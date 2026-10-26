import { z } from 'zod';

export const browserTabIdSchema = z.string().regex(/^b\d+$/);

/** What the address bar shows for a browser tab. */
export const browserStateSchema = z.object({
  tabId: browserTabIdSchema,
  url: z.string(),
  title: z.string(),
  loading: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  /** Last load error (Chromium error text, e.g. "ERR_CONNECTION_REFUSED"). */
  error: z.string().nullable(),
});
export type BrowserState = z.infer<typeof browserStateSchema>;

/** Position of the page inside the window, in CSS pixels; null hides it. */
export const browserBoundsSchema = z
  .object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0),
  })
  .nullable();
export type BrowserBounds = z.infer<typeof browserBoundsSchema>;

/**
 * The WHATWG URL class exists in Node and in browsers; shared code has
 * neither DOM nor Node types, so declare the few members used here.
 */
interface ParsedUrl {
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
  readonly port: string;
}
declare const URL: new (input: string) => ParsedUrl;

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Turns address bar input into a URL the browser may open, or null.
 * "localhost:3000" -> "http://localhost:3000/", "example.com" -> "https://…".
 * Only http(s); no search engine, no file: or other schemes.
 */
export function normalizeBrowserUrl(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(text);
  const candidate = hasScheme ? text : `${local ? 'http' : 'https'}://${text}`;
  let url: ParsedUrl;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol) || !url.hostname) return null;
  // Without a scheme, a host needs a dot or a port (else it is not an address).
  if (!hasScheme && !local && !url.hostname.includes('.') && !url.port) return null;
  return url.href;
}

/** Whether the browser may navigate to this URL (also for links and redirects). */
export function isAllowedBrowserUrl(url: string): boolean {
  if (url === 'about:blank') return true;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
