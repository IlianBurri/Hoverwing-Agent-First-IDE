import { describe, expect, it } from 'vitest';
import { PageCollector } from './collector';

describe('PageCollector', () => {
  it('collects console calls and uncaught errors', () => {
    const collector = new PageCollector(() => 1);
    collector.handle('Runtime.consoleAPICalled', {
      type: 'warning',
      args: [
        { type: 'string', value: 'careful' },
        { type: 'number', value: 3 },
      ],
      stackTrace: { callFrames: [{ url: 'http://localhost/app.js', lineNumber: 9 }] },
    });
    collector.handle('Runtime.exceptionThrown', {
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: 'TypeError: x is undefined' },
        url: 'http://localhost/app.js',
        lineNumber: 0,
      },
    });
    expect(collector.console).toEqual([
      { level: 'warning', text: 'careful 3', source: 'http://localhost/app.js:10', time: 1 },
      {
        level: 'error',
        text: 'TypeError: x is undefined',
        source: 'http://localhost/app.js:1',
        time: 1,
      },
    ]);
  });

  it('reports HTTP errors and failed requests, not cancelled ones', () => {
    const collector = new PageCollector(() => 2);
    collector.handle('Network.requestWillBeSent', {
      requestId: '1',
      type: 'Fetch',
      request: { url: 'http://localhost/api', method: 'POST' },
    });
    collector.handle('Network.responseReceived', {
      requestId: '1',
      type: 'Fetch',
      response: { url: 'http://localhost/api', status: 500 },
    });
    collector.handle('Network.requestWillBeSent', {
      requestId: '2',
      request: { url: 'http://localhost:9/x', method: 'GET' },
    });
    collector.handle('Network.loadingFailed', {
      requestId: '2',
      errorText: 'net::ERR_CONNECTION_REFUSED',
    });
    collector.handle('Network.requestWillBeSent', {
      requestId: '3',
      request: { url: 'http://localhost/slow', method: 'GET' },
    });
    collector.handle('Network.loadingFailed', { requestId: '3', canceled: true });
    collector.handle('Network.responseReceived', {
      requestId: '4',
      response: { url: 'http://localhost/ok', status: 200 },
    });
    expect(collector.network).toEqual([
      {
        url: 'http://localhost/api',
        method: 'POST',
        status: 500,
        error: null,
        resourceType: 'Fetch',
        time: 2,
      },
      {
        url: 'http://localhost:9/x',
        method: 'GET',
        status: null,
        error: 'net::ERR_CONNECTION_REFUSED',
        resourceType: null,
        time: 2,
      },
    ]);
  });

  it('keeps only the latest entries and shortens long text', () => {
    const collector = new PageCollector();
    for (let index = 0; index < 250; index++) {
      collector.handle('Runtime.consoleAPICalled', {
        type: 'log',
        args: [{ value: index === 249 ? 'x'.repeat(5000) : String(index) }],
      });
    }
    expect(collector.console).toHaveLength(200);
    expect(collector.console[0]?.text).toBe('50');
    expect(collector.console.at(-1)?.text.length).toBe(2001);
  });
});
