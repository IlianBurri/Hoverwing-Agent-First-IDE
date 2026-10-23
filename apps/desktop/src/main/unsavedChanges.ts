import { dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { nativeTexts } from './nativeTexts';
import type { NativeLanguage } from './nativeTexts';

/**
 * The renderer blocks unloading while files are unsaved. Electron then emits
 * "will-prevent-unload", and we ask the user whether to close anyway.
 */
export function guardUnsavedChanges(window: BrowserWindow, language: () => NativeLanguage): void {
  window.webContents.on('will-prevent-unload', (event) => {
    const text = nativeTexts[language()];
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: text.unsavedMessage,
      detail: text.unsavedDetail,
      buttons: [text.cancel, text.unsavedDiscard],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    // preventDefault() here means: ignore the renderer's veto and close.
    if (choice === 1) event.preventDefault();
  });
}
