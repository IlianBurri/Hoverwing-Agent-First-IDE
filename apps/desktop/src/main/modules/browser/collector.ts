/** One console message of a page. */
export interface ConsoleEntry {
  level: 'log' | 'info' | 'warning' | 'error' | 'debug';
  text: string;
  /** Script location, if known. */
  source: string | null;
  time: number;
}

/** A failed request or an HTTP error response (status >= 400). */
export interface NetworkError {
  url: string;
  method: string | null;
  status: number | null;
  /** Chromium error, e.g. "net::ERR_CONNECTION_REFUSED". */
  error: string | null;
  resourceType: string | null;
  time: number;
}

const MAX_ENTRIES = 200;
const MAX_TEXT = 2000;

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function push<T>(list: T[], entry: T): void {
  list.push(entry);
  if (list.length > MAX_ENTRIES) list.shift();
}

type Params = Record<string, unknown>;
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const obj = (value: unknown): Params =>
  typeof value === 'object' && value !== null ? (value as Params) : {};

function consoleLevel(type: string | null): ConsoleEntry['level'] {
  switch (type) {
    case 'error':
    case 'assert':
      return 'error';
    case 'warning':
    case 'warn':
      return 'warning';
    case 'info':
      return 'info';
    case 'debug':
    case 'verbose':
      return 'debug';
    default:
      return 'log';
  }
}

/** Text of a Runtime.consoleAPICalled argument (RemoteObject). */
function remoteText(arg: unknown): string {
  const value = obj(arg);
  if ('value' in value) {
    return typeof value['value'] === 'string' ? value['value'] : JSON.stringify(value['value']);
  }
  return str(value['description']) ?? str(value['type']) ?? '';
}

/**
 * Collects console output and network errors of one page from Chrome
 * DevTools Protocol events (Runtime, Log, Network). Bounded buffers.
 */
export class PageCollector {
  readonly console: ConsoleEntry[] = [];
  readonly network: NetworkError[] = [];
  /** Requests in flight: id -> url/method/type, to describe failures. */
  private readonly requests = new Map<
    string,
    { url: string; method: string; type: string | null }
  >();

  constructor(private readonly now: () => number = Date.now) {}

  handle(method: string, params: Params): void {
    switch (method) {
      case 'Runtime.consoleAPICalled': {
        const args = Array.isArray(params['args']) ? params['args'] : [];
        const frames = obj(params['stackTrace'])['callFrames'];
        const first = Array.isArray(frames) ? obj(frames[0]) : {};
        const url = str(first['url']);
        const line = num(first['lineNumber']);
        push(this.console, {
          level: consoleLevel(str(params['type'])),
          text: clip(args.map(remoteText).join(' ')),
          source: url ? `${url}${line === null ? '' : `:${String(line + 1)}`}` : null,
          time: this.now(),
        });
        break;
      }
      case 'Runtime.exceptionThrown': {
        const details = obj(params['exceptionDetails']);
        const exception = obj(details['exception']);
        const url = str(details['url']);
        const line = num(details['lineNumber']);
        push(this.console, {
          level: 'error',
          text: clip(str(exception['description']) ?? str(details['text']) ?? 'Uncaught error'),
          source: url ? `${url}${line === null ? '' : `:${String(line + 1)}`}` : null,
          time: this.now(),
        });
        break;
      }
      case 'Log.entryAdded': {
        const entry = obj(params['entry']);
        // Network failures also arrive via Network.*; keep browser-level messages.
        if (str(entry['source']) === 'network') break;
        push(this.console, {
          level: consoleLevel(str(entry['level'])),
          text: clip(str(entry['text']) ?? ''),
          source: str(entry['url']),
          time: this.now(),
        });
        break;
      }
      case 'Network.requestWillBeSent': {
        const id = str(params['requestId']);
        const request = obj(params['request']);
        const url = str(request['url']);
        if (id && url) {
          this.requests.set(id, {
            url,
            method: str(request['method']) ?? 'GET',
            type: str(params['type']),
          });
          if (this.requests.size > 1000) {
            const oldest = this.requests.keys().next().value;
            if (oldest !== undefined) this.requests.delete(oldest);
          }
        }
        break;
      }
      case 'Network.responseReceived': {
        const id = str(params['requestId']);
        const response = obj(params['response']);
        const status = num(response['status']);
        if (status !== null && status >= 400) {
          const request = id ? this.requests.get(id) : undefined;
          push(this.network, {
            url: str(response['url']) ?? request?.url ?? '',
            method: request?.method ?? null,
            status,
            error: null,
            resourceType: str(params['type']) ?? request?.type ?? null,
            time: this.now(),
          });
        }
        break;
      }
      case 'Network.loadingFailed': {
        const id = str(params['requestId']);
        const request = id ? this.requests.get(id) : undefined;
        // Cancelled requests (navigation away) are not errors.
        if (params['canceled'] === true) break;
        push(this.network, {
          url: request?.url ?? '',
          method: request?.method ?? null,
          status: null,
          error: str(params['errorText']),
          resourceType: str(params['type']) ?? request?.type ?? null,
          time: this.now(),
        });
        if (id) this.requests.delete(id);
        break;
      }
      case 'Network.loadingFinished': {
        const id = str(params['requestId']);
        if (id) this.requests.delete(id);
        break;
      }
    }
  }

  clear(): void {
    this.console.length = 0;
    this.network.length = 0;
    this.requests.clear();
  }
}
