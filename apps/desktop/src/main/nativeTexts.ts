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
    installMessage: 'Ollama-Installationsprogramm starten?',
    installDetail:
      'Die Datei wurde von der offiziellen Quelle geladen und ihre SHA-256-Prüfsumme stimmt.\n\nQuelle: {source}\nDatei: {file}\nSHA-256: {sha256}',
    installStart: 'Installieren',
    trustMessage: 'Diesem Projekt vertrauen?',
    trustDetail:
      'Sprach-Server und Git können Code aus dem Projekt ausführen (z. B. tsserver-Plugins, Git-Hooks und -Filter). Vertraue nur Projekten, deren Herkunft du kennst.\n\n{root}',
    trustAllow: 'Vertrauen',
    lspMessage: 'Sprach-Server «{name}» starten?',
    lspDetail:
      'Kestrel startet dieses Programm in deinem Projektordner, mit deinen Rechten. Es liest den Code und kann Werkzeuge aus dem Projekt laden.\n\n{command}',
    lspStart: 'Starten',
    renamedMessage: 'Kestrel heisst jetzt Hoverwing',
    renamedDetail:
      'Deine Einstellungen, Chats, Checkpoints, Agenten und Regeln wurden übernommen. Der alte Kestrel-Ordner bleibt unverändert, du kannst ihn später löschen.',
    renamedKeys:
      'Gespeicherte API-Schlüssel, Agent-Variablen und Anmeldungen musst du einmal neu eingeben: Der Schlüsselbund deines Systems bindet sie an den App-Namen.',
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
    installMessage: 'Start the Ollama installer?',
    installDetail:
      'The file was downloaded from the official source and its SHA-256 checksum matches.\n\nSource: {source}\nFile: {file}\nSHA-256: {sha256}',
    installStart: 'Install',
    trustMessage: 'Trust this project?',
    trustDetail:
      'Language servers and Git can run code from the project (e.g. tsserver plugins, Git hooks and filters). Only trust projects whose origin you know.\n\n{root}',
    trustAllow: 'Trust',
    lspMessage: 'Start language server “{name}”?',
    lspDetail:
      'Kestrel will start this program in your project folder, with your rights. It reads the code and can load tools from the project.\n\n{command}',
    lspStart: 'Start',
    renamedMessage: 'Kestrel is now called Hoverwing',
    renamedDetail:
      'Your settings, chats, checkpoints, agents and rules were taken over. The old Kestrel folder stays as it was; you can delete it later.',
    renamedKeys:
      'Saved API keys, agent variables and sign-ins have to be entered once more: your system keychain ties them to the app name.',
  },
} as const;

export type NativeLanguage = keyof typeof nativeTexts;
