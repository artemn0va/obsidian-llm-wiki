import express from 'express';
import { commandIdSchema, bridgeCommandSchema, resetSchema, runReviewSchema, staleRunCleanupSchema } from '../schemas/api.js';
import { createBridgeCommand, getBridgeCommand } from '../services/bridge.js';
import { readWikiFile, getWikiFiles } from '../services/fs.js';
import { getIngestCandidates } from '../services/ingest-candidates.js';
import { cleanLastIngest, previewCleanLastIngest } from '../services/last-ingest-clean.js';
import { buildAndDeployPlugin, buildPlugin, deployPlugin } from '../services/plugin.js';
import { reloadObsidian } from '../services/obsidian.js';
import { fixQA, runQA } from '../services/qa.js';
import { resetWiki } from '../services/reset.js';
import { cleanupStaleRuns } from '../services/run-cleanup.js';
import { readRunDiffFile } from '../services/run-diff.js';
import { updateRunReview } from '../services/run-review.js';
import { getRuns, getStatus } from '../services/status.js';

export const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'wiki-lab-ui', now: new Date().toISOString() });
});

apiRouter.get('/status', asyncHandler(async (_req, res) => {
  res.json(await getStatus());
}));

apiRouter.get('/runs', asyncHandler(async (_req, res) => {
  res.json(await getRuns());
}));

apiRouter.post('/runs/:id/review', asyncHandler(async (req, res) => {
  const params = commandIdSchema.parse(req.params);
  const body = runReviewSchema.parse(req.body);
  res.json(await updateRunReview(params.id, body));
}));

apiRouter.post('/runs/stale/cleanup', asyncHandler(async (req, res) => {
  const body = staleRunCleanupSchema.parse(req.body);
  res.json(await cleanupStaleRuns(body.ids));
}));

apiRouter.get('/runs/:id/diff-file', asyncHandler(async (req, res) => {
  const params = commandIdSchema.parse(req.params);
  const target = String(req.query.path || '');
  res.json(await readRunDiffFile(params.id, target));
}));

apiRouter.get('/wiki/files', asyncHandler(async (_req, res) => {
  res.json(await getWikiFiles());
}));

apiRouter.get('/wiki/file', asyncHandler(async (req, res) => {
  const target = String(req.query.path || '');
  res.json(await readWikiFile(target));
}));

apiRouter.post('/wiki/clean-last-ingest', asyncHandler(async (_req, res) => {
  res.json(await cleanLastIngest());
}));

apiRouter.get('/wiki/clean-last-ingest/preview', asyncHandler(async (_req, res) => {
  const { restoreActions: _restoreActions, ...preview } = await previewCleanLastIngest();
  res.json(preview);
}));

apiRouter.get('/ingest/candidates', asyncHandler(async (_req, res) => {
  res.json(await getIngestCandidates());
}));

apiRouter.get('/qa', asyncHandler(async (_req, res) => {
  res.json(await runQA());
}));

apiRouter.post('/qa/fix', asyncHandler(async (_req, res) => {
  res.json(await fixQA());
}));

apiRouter.post('/reset', asyncHandler(async (req, res) => {
  const body = resetSchema.parse(req.body);
  res.json(await resetWiki(body.execute));
}));

apiRouter.post('/plugin/build', asyncHandler(async (_req, res) => {
  res.json(await buildPlugin());
}));

apiRouter.post('/plugin/deploy', asyncHandler(async (_req, res) => {
  res.json(await deployPlugin());
}));

apiRouter.post('/plugin/build-deploy', asyncHandler(async (_req, res) => {
  res.json(await buildAndDeployPlugin());
}));

apiRouter.post('/obsidian/reload', asyncHandler(async (_req, res) => {
  res.json(await reloadObsidian());
}));

apiRouter.post('/bridge/command', asyncHandler(async (req, res) => {
  const body = bridgeCommandSchema.parse(req.body);
  res.json(await createBridgeCommand(body));
}));

apiRouter.get('/bridge/command/:id', asyncHandler(async (req, res) => {
  const params = commandIdSchema.parse(req.params);
  res.json(await getBridgeCommand(params.id));
}));

function asyncHandler(
  handler: (req: express.Request, res: express.Response) => Promise<void> | void,
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}
