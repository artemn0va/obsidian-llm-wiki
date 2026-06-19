import { z } from 'zod';

export const resetSchema = z.object({
  execute: z.boolean().default(false),
});

export const bridgeCommandSchema = z.object({
  type: z.enum(['ingest-file', 'ingest-folder', 'lint-wiki', 'regenerate-index', 'cancel']),
  path: z.string().optional(),
});

export type BridgeCommandInput = z.infer<typeof bridgeCommandSchema>;

export const commandIdSchema = z.object({
  id: z.string().min(8),
});
