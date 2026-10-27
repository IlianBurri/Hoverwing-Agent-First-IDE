import { z } from 'zod';
import { bottomViewSchema, sidebarViewSchema, workbenchSchema } from '../../schemas/workbench';

export const layoutStateSchema = z.object({
  workbench: workbenchSchema,
  toolbar: z.array(z.string().min(1).max(100)).max(30),
  sidebarView: sidebarViewSchema,
  bottomView: bottomViewSchema,
});

/**
 * "Customize layout with AI": the chat model proposes a layout. Main checks
 * it against the layout schemas; nothing is applied here – the renderer
 * shows a preview and applies it only when the user agrees.
 */
export const layoutChannels = {
  'layout:propose': {
    request: z.object({
      text: z.string().trim().min(1).max(2000),
      /** Commands that may go into the toolbar (id + translated title). */
      commands: z
        .array(z.object({ id: z.string().min(1).max(100), title: z.string().max(200) }))
        .max(500),
    }),
    response: z.object({
      layout: layoutStateSchema,
      /** The model's explanation (untrusted text, display only). */
      explanation: z.string().max(2000),
      model: z.string(),
    }),
  },
} as const;
