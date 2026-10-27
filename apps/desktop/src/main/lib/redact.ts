/**
 * Removes things that look like secrets before text is logged or stored.
 * Not perfect, but catches the usual suspects (API keys, tokens, passwords
 * passed on a command line).
 */
const patterns: readonly RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, // OpenAI/Anthropic/Stripe-style keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** KEY=value or --password value, where the name suggests a secret. */
const assignment =
  /\b([A-Za-z0-9_]*(?:key|token|secret|password|passwd|pwd)[A-Za-z0-9_]*)(\s*[=:]\s*|\s+)(["']?)[^\s"']{4,}\3/gi;

/** Credentials inside URLs, e.g. https://user:token@github.com. */
const urlCredentials = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

export function redact(text: string): string {
  let result = text.replace(urlCredentials, '$1[redacted]@');
  for (const pattern of patterns) result = result.replace(pattern, '[redacted]');
  return result.replace(
    assignment,
    (_match, name: string, separator: string) => `${name}${separator}[redacted]`,
  );
}
