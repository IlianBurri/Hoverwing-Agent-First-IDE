// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PermissionRequest } from '@kestrel/shared';
import { initI18n } from '../../i18n';
import { PermissionCard } from './PermissionCard';

const invoke = vi.fn(() => Promise.resolve({ ok: true, data: null }));

beforeAll(async () => {
  Object.assign(window, { kestrel: { invoke, on: vi.fn() } });
  await initI18n('en');
});

afterEach(cleanup);

const request: PermissionRequest = {
  id: 'p1',
  kind: 'file.write',
  target: 'src/app.ts',
  title: 'Add a greeting',
  diff: '--- src/app.ts\n+++ src/app.ts\n@@ -1 +1 @@\n-old\n+new',
  agentName: 'Test agent',
  sessionId: 's1',
  slotId: null,
  createdAt: 0,
};

describe('PermissionCard', () => {
  it('explains what the agent wants and shows the diff', () => {
    render(<PermissionCard request={request} />);
    expect(
      screen.getByRole('heading', { name: 'Test agent wants to change a file' }),
    ).toBeDefined();
    expect(screen.getByText('src/app.ts')).toBeDefined();
    expect(screen.getByLabelText('Proposed change').textContent).toContain('+new');
  });

  it('sends the decision to the main process', () => {
    render(<PermissionCard request={request} />);
    fireEvent.click(screen.getByRole('button', { name: 'Always allow (this project)' }));
    expect(invoke).toHaveBeenCalledWith('permissions:respond', {
      requestId: 'p1',
      decision: 'allowAlways',
    });
  });
});
