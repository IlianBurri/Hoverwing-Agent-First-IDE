import type { ModuleHandlers } from '../../ipc/handlers';
import type { CompletionService } from './service';

export function createCompletionHandlers(
  completion: CompletionService,
): ModuleHandlers<'completion'> {
  return {
    'completion:request': (request, { sender }) => completion.complete(sender.id, request),
    'completion:cancel': ({ requestId }, { sender }) => {
      completion.cancel(sender.id, requestId);
      return null;
    },
  };
}
