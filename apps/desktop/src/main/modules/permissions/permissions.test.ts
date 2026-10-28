import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionRequest } from '@kestrel/shared';
import { AuditLog } from './audit';
import { RuleStore } from './rules';
import { PermissionService } from './service';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-permissions-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function setup() {
  const requests: PermissionRequest[] = [];
  const events = {
    request: vi.fn((_owner: number, request: PermissionRequest) => {
      requests.push(request);
    }),
    resolved: vi.fn(),
    logged: vi.fn(),
  };
  const service = new PermissionService(new RuleStore(dir), new AuditLog(dir), events);
  return { service, events, requests };
}

const context = {
  ownerId: 1,
  root: '/projects/demo',
  agentName: 'Test agent',
  sessionId: 's1',
  slotId: 'slot-a',
};
const write = { kind: 'file.write' as const, target: 'src/a.ts', title: 'Edit src/a.ts' };

describe('PermissionService', () => {
  it('asks the user and continues after "allow once"', async () => {
    const { service, requests } = setup();
    const decision = service.check(context, write);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    await service.respond(1, requests[0]?.id ?? '', 'allowOnce');
    await expect(decision).resolves.toBe(true);
    // Once means once: the next write asks again.
    void service.check(context, write);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(2);
    });
  });

  it('remembers "always allow" for this project only', async () => {
    const { service, requests } = setup();
    const first = service.check(context, write);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    await service.respond(1, requests[0]?.id ?? '', 'allowAlways');
    await expect(first).resolves.toBe(true);

    await expect(service.check(context, write)).resolves.toBe(true);
    expect(requests).toHaveLength(1);

    void service.check({ ...context, root: '/projects/other' }, write);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(2);
    });
  });

  it('denies sensitive files without asking and logs it', async () => {
    const { service, events } = setup();
    await expect(service.check(context, { ...write, target: '.env' })).resolves.toBe(false);
    expect(events.request).not.toHaveBeenCalled();
    const [entry] = await service.readLog(context.root, 10);
    expect(entry).toMatchObject({ target: '.env', outcome: 'denied', decidedBy: 'sensitive' });
  });

  it('only accepts answers from the window that was asked', async () => {
    const { service, requests } = setup();
    void service.check(context, write);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    await expect(service.respond(2, requests[0]?.id ?? '', 'allowOnce')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('cancels open questions as denied', async () => {
    const { service, requests, events } = setup();
    const decision = service.check(context, write);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    service.cancel(1, 'slot-a');
    await expect(decision).resolves.toBe(false);
    expect(events.resolved).toHaveBeenCalledWith(1, requests[0]?.id);
    expect(service.pendingFor(1)).toEqual([]);
  });

  it('redacts secrets in the log', async () => {
    const { service, requests } = setup();
    const decision = service.check(context, {
      kind: 'command.run',
      target: 'curl -H "Authorization: Bearer x" -d token=abcdef123',
      title: 'Run curl',
    });
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    await service.respond(1, requests[0]?.id ?? '', 'deny');
    await expect(decision).resolves.toBe(false);
    const [entry] = await service.readLog(context.root, 10);
    expect(entry?.target).not.toContain('abcdef123');
  });

  it('keeps project rules out of the project folder', async () => {
    const store = new RuleStore(dir);
    await store.add('/projects/demo', {
      kind: 'file.read',
      pattern: '**',
      level: 'allow',
      scope: 'project',
    });
    await store.add('/projects/demo', {
      kind: 'network',
      pattern: '**',
      level: 'deny',
      scope: 'global',
    });
    expect(await new RuleStore(dir).rulesFor('/projects/demo')).toHaveLength(2);
    expect(await new RuleStore(dir).rulesFor('/projects/other')).toHaveLength(1);
  });
});
