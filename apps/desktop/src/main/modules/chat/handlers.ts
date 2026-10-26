import type { ModuleHandlers } from '../../ipc/handlers';
import type { ChatService } from './service';

export function createChatHandlers(chat: ChatService): ModuleHandlers<'chat'> {
  return {
    'chat:send': (request, { sender }) => chat.send(sender.id, request),
    'chat:stop': async (_request, { sender }) => {
      await chat.stop(sender.id);
      return null;
    },
    'chat:list': () => chat.list(),
    'chat:load': ({ id }) => chat.load(id),
    'chat:delete': async ({ id }, { sender }) => {
      await chat.delete(sender.id, id);
      return null;
    },
  };
}
