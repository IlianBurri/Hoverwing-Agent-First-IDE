import { bottomViews, sidebarViews, statusItems } from '@kestrel/shared';
import type { LayoutState } from '@kestrel/shared';
import type { ChatTurn } from '../providers';

export interface CommandInfo {
  id: string;
  title: string;
}

/**
 * The instructions for the model: the allowed values, the current layout and
 * the user's wish. Only layout data goes out – no files, paths or secrets.
 */
export function layoutPrompt(
  current: LayoutState,
  commands: readonly CommandInfo[],
  request: string,
): ChatTurn[] {
  const system = [
    'You arrange the user interface of Kestrel, a desktop IDE. Answer with ONE JSON object and nothing else.',
    'Include only what should change. Shape (every field optional):',
    '{"workbench":{"sidebarSide":"left|right","agentSide":"left|right",',
    '"panels":{"sidebar":bool,"bottom":bool,"agent":bool},',
    '"activityBar":{"visible":bool,"order":[view…],"hidden":[view…]},',
    '"bottomTabs":{"order":[tab…],"hidden":[tab…]},',
    '"statusBar":{"visible":bool,"hidden":[item…]}},',
    '"toolbar":[commandId…],"sidebarView":view,"bottomView":tab,',
    '"explanation":"one or two sentences in the language of the user"}',
    '',
    `Views (sidebar, activity bar): ${sidebarViews.join(', ')}`,
    `Tabs (bottom panel): ${bottomViews.join(', ')}`,
    `Status bar items: ${statusItems.join(', ')}`,
    '"toolbar" replaces the whole list of title bar buttons; use only these command ids:',
    ...commands.map((command) => `- ${command.id}: ${command.title}`),
    '',
    'The sidebar shows one view at a time; the activity bar switches views.',
    'Do not invent fields or values. If the wish cannot be met, change nothing and say why in "explanation".',
  ].join('\n');
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Current layout:\n${JSON.stringify(current)}\n\nWish of the user:\n${request}`,
    },
  ];
}

export function correctionTurns(answer: string, error: string): ChatTurn[] {
  return [
    { role: 'assistant', content: answer.slice(0, 8000) },
    {
      role: 'user',
      content: `That was not valid: ${error}. Reply again with ONE corrected JSON object only.`,
    },
  ];
}
