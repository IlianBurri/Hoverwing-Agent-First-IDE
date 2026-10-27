import type { ModuleHandlers } from '../../ipc/handlers';
import type { LayoutAssistant } from './service';

export function createLayoutHandlers(assistant: LayoutAssistant): ModuleHandlers<'layout'> {
  return {
    'layout:propose': ({ text, commands }) => assistant.propose(text, commands),
  };
}
