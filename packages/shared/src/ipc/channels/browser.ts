import { z } from 'zod';
import { browserBoundsSchema, browserStateSchema, browserTabIdSchema } from '../../schemas/browser';

const byTab = z.object({ tabId: browserTabIdSchema });
const url = z.string().min(1).max(8192);

/** The integrated browser. Pages run in their own session and never reach these channels. */
export const browserChannels = {
  /** Creates a browser tab (hidden until it gets bounds). */
  'browser:create': { request: z.object({ url: url.optional() }), response: browserStateSchema },
  /** Opens address bar input; invalid or non-web addresses are rejected. */
  'browser:navigate': { request: z.object({ tabId: browserTabIdSchema, url }), response: z.null() },
  'browser:back': { request: byTab, response: z.null() },
  'browser:forward': { request: byTab, response: z.null() },
  'browser:reload': { request: byTab, response: z.null() },
  'browser:stop': { request: byTab, response: z.null() },
  'browser:setBounds': {
    request: z.object({ tabId: browserTabIdSchema, bounds: browserBoundsSchema }),
    response: z.null(),
  },
  'browser:openDevTools': { request: byTab, response: z.null() },
  'browser:close': { request: byTab, response: z.null() },
  /** Deletes cookies, storage and cache of the browser session. */
  'browser:clearData': { request: z.undefined(), response: z.null() },
} as const;

export const browserEvents = {
  'browser:state': browserStateSchema,
  /** A page wants a new window (or an agent opened a page): show it in a new tab. */
  'browser:openTab': z.object({ url }),
  /** Main opened a tab itself (an agent asked for it): show it in the editor area. */
  'browser:opened': browserStateSchema,
} as const;
