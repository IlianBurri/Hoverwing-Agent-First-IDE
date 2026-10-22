import type { Session, WebContents } from 'electron';

/**
 * Content-Security-Policy for the main window. Only local resources are
 * allowed. Inline styles are needed by React style props; scripts are not.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Dev server needs websocket + inline module preamble for React refresh. */
export function devContentSecurityPolicy(devServerUrl: string): string {
  const origin = new URL(devServerUrl).origin;
  const ws = origin.replace(/^http/, 'ws');
  return CONTENT_SECURITY_POLICY.replace(
    "script-src 'self'",
    `script-src 'self' 'unsafe-inline' ${origin}`,
  ).replace("connect-src 'self'", `connect-src 'self' ${origin} ${ws}`);
}

export function applySessionSecurity(session: Session, csp: string): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Deny camera, microphone, notifications, etc. until a module asks for them
  // through the permission system.
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.setPermissionCheckHandler(() => false);
}

/** Returns true when `targetUrl` is the app's own page (and thus allowed). */
export function isAppUrl(targetUrl: string, appUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const app = new URL(appUrl);
    if (app.protocol === 'file:') {
      return target.protocol === 'file:' && target.pathname === app.pathname;
    }
    return target.origin === app.origin;
  } catch {
    return false;
  }
}

/** Blocks navigation away from the app and all new windows. */
export function lockNavigation(contents: WebContents, appUrl: string): void {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, appUrl)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url, appUrl)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
