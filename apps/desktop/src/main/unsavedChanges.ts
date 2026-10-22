import { dialog } from 'electron';
import type { BrowserWindow } from 'electron';

const texts = {
  de: {
    message: 'Ungespeicherte Änderungen verwerfen?',
    detail: 'Einige Dateien haben Änderungen, die noch nicht gespeichert sind.',
    discard: 'Verwerfen und schliessen',
    cancel: 'Abbrechen',
  },
  en: {
    message: 'Discard unsaved changes?',
    detail: 'Some files have changes that are not saved yet.',
    discard: 'Discard and close',
    cancel: 'Cancel',
  },
} as const;

/**
 * The renderer blocks unloading while files are unsaved. Electron then emits
 * "will-prevent-unload", and we ask the user whether to close anyway.
 */
export function guardUnsavedChanges(window: BrowserWindow, language: () => 'de' | 'en'): void {
  window.webContents.on('will-prevent-unload', (event) => {
    const text = texts[language()];
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      message: text.message,
      detail: text.detail,
      buttons: [text.cancel, text.discard],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    // preventDefault() here means: ignore the renderer's veto and close.
    if (choice === 1) event.preventDefault();
  });
}
