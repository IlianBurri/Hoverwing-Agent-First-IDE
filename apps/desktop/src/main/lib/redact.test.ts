import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('hides API keys and tokens', () => {
    expect(redact('curl -H "x-api-key: sk-ant-api03-abcdefghijklmnopqrstuv"')).not.toContain(
      'abcdefghij',
    );
    expect(redact('git clone https://ghp_abcdefghijklmnopqrstuvwxyz0123@github.com')).toContain(
      '[redacted]',
    );
    expect(redact('AKIAABCDEFGHIJKLMNOP')).toBe('[redacted]');
  });

  it('hides values of secret-looking assignments', () => {
    expect(redact('export API_KEY=hunter22 && npm test')).toBe(
      'export API_KEY=[redacted] && npm test',
    );
    expect(redact('mysql --password s3cr3t!')).toBe('mysql --password [redacted]');
  });

  it('leaves normal commands alone', () => {
    expect(redact('npm run build -- --mode production')).toBe('npm run build -- --mode production');
  });
});
