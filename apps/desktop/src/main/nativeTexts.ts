/** The few texts the main process shows itself (native dialogs). */
export const nativeTexts = {
  de: {
    unsavedMessage: 'Ungespeicherte Änderungen verwerfen?',
    unsavedDetail: 'Einige Dateien haben Änderungen, die noch nicht gespeichert sind.',
    unsavedDiscard: 'Verwerfen und schliessen',
    cancel: 'Abbrechen',
    agentMessage: 'Agent «{name}» starten?',
    agentDetail:
      'Kestrel startet dieses Programm in deinem Projektordner. Es läuft mit deinen Rechten. Starte nur Agenten, denen du vertraust.\n\n{command}',
    agentStart: 'Starten',
  },
  en: {
    unsavedMessage: 'Discard unsaved changes?',
    unsavedDetail: 'Some files have changes that are not saved yet.',
    unsavedDiscard: 'Discard and close',
    cancel: 'Cancel',
    agentMessage: 'Start agent “{name}”?',
    agentDetail:
      'Kestrel will start this program in your project folder. It runs with your rights. Only start agents you trust.\n\n{command}',
    agentStart: 'Start',
  },
} as const;

export type NativeLanguage = keyof typeof nativeTexts;
