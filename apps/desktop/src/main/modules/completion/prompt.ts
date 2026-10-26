import type { ChatTurn } from '../providers';

export const CURSOR = '<CURSOR>';

const SYSTEM_PROMPT = [
  'You are a code completion engine.',
  `Continue the code exactly at ${CURSOR}.`,
  'Reply with only the text to insert there: no explanations, no Markdown',
  'fences, no repetition of the surrounding code. Keep it short: finish the',
  'current statement or a few lines at most. Reply with nothing if unsure.',
].join(' ');

/** For models without fill-in-the-middle: the gap as a chat question. */
export function completionMessages(request: {
  path: string;
  language: string;
  prefix: string;
  suffix: string;
}): ChatTurn[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `File: ${request.path} (${request.language})\n\n${request.prefix}${CURSOR}${request.suffix}`,
    },
  ];
}

const MAX_LINES = 20;

/**
 * Makes a model's answer insertable: removes Markdown fences and an echoed
 * cursor marker, drops a repeated start of the current line, and cuts where
 * the answer runs into the code after the cursor.
 */
export function cleanCompletion(raw: string, prefix: string, suffix: string): string {
  let text = raw.replace(/\r\n/g, '\n').replaceAll(CURSOR, '');
  const fenced = /^\s*```[\w+-]*\n([\s\S]*?)\n?```\s*$/.exec(text);
  if (fenced?.[1] !== undefined) text = fenced[1];

  // Chat models like to repeat the line they were asked to continue.
  const currentLine = prefix.slice(prefix.lastIndexOf('\n') + 1);
  if (currentLine.trim() && text.startsWith(currentLine)) text = text.slice(currentLine.length);

  let lines = text.split('\n');
  const following = suffix
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // If the answer ends with the code that already follows the cursor, drop that tail.
  for (let start = 1; start < lines.length; start++) {
    const tail = lines
      .slice(start)
      .map((line) => line.trim())
      .filter(Boolean);
    if (tail.length > 0 && tail.every((line, index) => line === following[index])) {
      lines = lines.slice(0, start);
      break;
    }
  }

  text = lines.slice(0, MAX_LINES).join('\n').trimEnd();
  return text.trim() === '' ? '' : text;
}
