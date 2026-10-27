#!/usr/bin/env node
/**
 * A tiny language server for tests (LSP over stdio):
 * - lines containing "ERROR" / "WARN" produce an error / warning diagnostic,
 * - completion offers "fakeCompletion",
 * - hover shows "**fake hover** for `<word>`",
 * - definition points at the first occurrence of the word in the same file
 *   (plus a location outside the project, which Kestrel must drop),
 * - signature help for "fake(a: number, b: string)",
 * - a change containing "CRASH" ends the process (restart tests).
 */
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);
const documents = new Map();

function wordAt(text, position) {
  const line = text.split(/\r?\n/)[position.line] ?? '';
  let start = position.character;
  let end = position.character;
  while (start > 0 && /\w/.test(line[start - 1] ?? '')) start--;
  while (end < line.length && /\w/.test(line[end] ?? '')) end++;
  return line.slice(start, end);
}

function publish(uri, text) {
  const diagnostics = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [marker, severity, message] of [
      ['ERROR', 1, 'Fake error'],
      ['WARN', 2, 'Fake warning'],
    ]) {
      const column = line.indexOf(marker);
      if (column !== -1) {
        diagnostics.push({
          range: {
            start: { line: index, character: column },
            end: { line: index, character: column + marker.length },
          },
          severity,
          message,
          source: 'fake-lsp',
        });
      }
    }
  });
  void connection.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics });
}

connection.onRequest('initialize', () => ({
  capabilities: {
    textDocumentSync: 1,
    completionProvider: { triggerCharacters: ['.'] },
    hoverProvider: true,
    definitionProvider: true,
    signatureHelpProvider: { triggerCharacters: ['(', ','] },
  },
  serverInfo: { name: 'fake-lsp' },
}));
connection.onNotification('initialized', () => {
  void connection.sendNotification('window/logMessage', { type: 3, message: 'fake-lsp ready' });
});
connection.onNotification('textDocument/didOpen', ({ textDocument }) => {
  documents.set(textDocument.uri, textDocument.text);
  publish(textDocument.uri, textDocument.text);
});
connection.onNotification('textDocument/didChange', ({ textDocument, contentChanges }) => {
  const text = contentChanges.at(-1)?.text ?? '';
  if (text.includes('CRASH')) process.exit(1);
  documents.set(textDocument.uri, text);
  publish(textDocument.uri, text);
});
connection.onNotification('textDocument/didClose', ({ textDocument }) => {
  documents.delete(textDocument.uri);
});
connection.onRequest('textDocument/completion', () => ({
  isIncomplete: false,
  items: [
    { label: 'fakeCompletion', kind: 3, detail: 'from fake-lsp', insertText: 'fakeCompletion()' },
  ],
}));
connection.onRequest('textDocument/hover', ({ textDocument, position }) => {
  const word = wordAt(documents.get(textDocument.uri) ?? '', position);
  return word ? { contents: { kind: 'markdown', value: `**fake hover** for \`${word}\`` } } : null;
});
connection.onRequest('textDocument/definition', ({ textDocument, position }) => {
  const text = documents.get(textDocument.uri) ?? '';
  const word = wordAt(text, position);
  if (!word) return [];
  const lines = text.split(/\r?\n/);
  const line = lines.findIndex((entry) => new RegExp(`\\b${word}\\b`).test(entry));
  const character = lines[line]?.search(new RegExp(`\\b${word}\\b`)) ?? 0;
  return [
    {
      uri: textDocument.uri,
      range: {
        start: { line, character },
        end: { line, character: character + word.length },
      },
    },
    {
      uri: 'file:///kestrel-outside-project/lib.d.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    },
  ];
});
connection.onRequest('textDocument/signatureHelp', () => ({
  signatures: [
    {
      label: 'fake(a: number, b: string)',
      parameters: [{ label: 'a: number' }, { label: 'b: string' }],
    },
  ],
  activeSignature: 0,
  activeParameter: 0,
}));
connection.onRequest('shutdown', () => null);
connection.onNotification('exit', () => {
  process.exit(0);
});
connection.listen();
process.stderr.write('fake-lsp started\n');
