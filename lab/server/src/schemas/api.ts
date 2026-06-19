import { z } from 'zod';

export const resetSchema = z.object({
  execute: z.boolean().default(false),
});

export const bridgeCommandSchema = z.object({
  type: z.enum(['ingest-file', 'ingest-folder', 'lint-wiki', 'regenerate-index', 'cancel']),
  path: z.string().optional(),
  granularity: z.enum(['fine', 'standard', 'coarse', 'minimal']).optional(),
});

export type BridgeCommandInput = z.infer<typeof bridgeCommandSchema>;

export const commandIdSchema = z.object({
  id: z.string().min(8),
});

export const runReviewSchema = z.object({
  action: z.enum(['keep', 'mark-reviewed']),
  paths: z.array(z.string().min(1)).default([]),
});

export const staleRunCleanupSchema = z.object({
  ids: z.array(z.string().min(8)).optional(),
});

export const qaFixApplySchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
});
