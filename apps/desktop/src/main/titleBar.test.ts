import { describe, expect, it } from 'vitest';
import { titleBarOptions, titleBarOverlay } from './titleBar';

describe('titleBarOptions', () => {
  it('keeps native traffic lights on macOS', () => {
    const options = titleBarOptions('darwin', 'dark');
    expect(options.titleBarStyle).toBe('hidden');
    expect(options.titleBarOverlay).toBeUndefined();
  });

  it('uses a themed overlay on Windows and Linux', () => {
    expect(titleBarOptions('win32', 'light').titleBarOverlay).toEqual(titleBarOverlay('light'));
    expect(titleBarOptions('linux', 'dark').titleBarOverlay).toEqual(titleBarOverlay('dark'));
  });
});
