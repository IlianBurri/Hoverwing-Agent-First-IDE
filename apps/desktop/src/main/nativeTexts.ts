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
    agentSandboxDetail:
      'Kestrel startet dieses Programm in der Docker-Sandbox. Es sieht nur deinen Projektordner (ohne Geheimdateien) und kann ihn ändern. Starte nur Agenten, denen du vertraust.\n\n{command}',
    agentStart: 'Starten',
    mcpMessage: 'MCP-Server «{name}» erlauben?',
    mcpDetail:
      'Kestrel startet dieses Programm bei Bedarf auf deinem System, mit deinen Rechten. Erlaube nur Server, denen du vertraust.\n\n{command}',
    mcpAllow: 'Erlauben',
  },
  en: {
    unsavedMessage: 'Discard unsaved changes?',
    unsavedDetail: 'Some files have changes that are not saved yet.',
    unsavedDiscard: 'Discard and close',
    cancel: 'Cancel',
    agentMessage: 'Start agent “{name}”?',
    agentDetail:
      'Kestrel will start this program in your project folder. It runs with your rights. Only start agents you trust.\n\n{command}',
    agentSandboxDetail:
      'Kestrel will start this program in the Docker sandbox. It only sees your project folder (without secret files) and can change it. Only start agents you trust.\n\n{command}',
    agentStart: 'Start',
    mcpMessage: 'Allow MCP server “{name}”?',
    mcpDetail:
      'Kestrel will start this program on your system when needed, with your rights. Only allow servers you trust.\n\n{command}',
    mcpAllow: 'Allow',
  },
} as const;

export type NativeLanguage = keyof typeof nativeTexts;
