import { describe, expect, it } from 'vitest';
import { evaluatePolicy, isSensitivePath } from './permissions';
import type { PermissionRule } from './permissions';

function rule(patch: Partial<PermissionRule>): PermissionRule {
  return {
    id: 'r',
    kind: 'file.write',
    pattern: '**',
    level: 'allow',
    scope: 'project',
    createdAt: 0,
    ...patch,
  };
}

describe('isSensitivePath', () => {
  it.each([
    '.env',
    'api/.env.production',
    'certs/server.pem',
    '.ssh/config',
    'home/.aws/credentials',
    'ID_RSA',
  ])('treats %s as sensitive', (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it.each(['.env.example', 'src/env.ts', 'docs/keys.md', 'environment.md'])('allows %s', (path) => {
    expect(isSensitivePath(path)).toBe(false);
  });
});

describe('evaluatePolicy', () => {
  it('asks by default', () => {
    expect(evaluatePolicy('file.write', 'src/a.ts', [])).toEqual({ level: 'ask', decidedBy: null });
  });

  it('applies matching allow rules', () => {
    const rules = [rule({ pattern: 'src/**' })];
    expect(evaluatePolicy('file.write', 'src/a.ts', rules).level).toBe('allow');
    expect(evaluatePolicy('file.write', 'test/a.ts', rules).level).toBe('ask');
    expect(evaluatePolicy('file.read', 'src/a.ts', rules).level).toBe('ask');
  });

  it('lets deny win over allow', () => {
    const rules = [rule({ pattern: '**' }), rule({ pattern: 'src/secret/**', level: 'deny' })];
    expect(evaluatePolicy('file.write', 'src/secret/x.ts', rules)).toEqual({
      level: 'deny',
      decidedBy: 'rule',
    });
  });

  it('never allows sensitive files, even with an allow-all rule', () => {
    expect(evaluatePolicy('file.read', '.env', [rule({ kind: 'file.read' })])).toEqual({
      level: 'deny',
      decidedBy: 'sensitive',
    });
  });

  it('matches commands exactly, not as globs', () => {
    const rules = [rule({ kind: 'command.run', pattern: 'npm test' })];
    expect(evaluatePolicy('command.run', 'npm test', rules).level).toBe('allow');
    expect(evaluatePolicy('command.run', 'npm test && rm -rf ~', rules).level).toBe('ask');
  });
});
