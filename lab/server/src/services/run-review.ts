import path from 'node:path';
import { labStateRoot } from '../config.js';
import { readJson, writeJson } from './fs.js';

export interface RunReviewState {
  updatedAt: string;
  keptPaths: string[];
  reviewedPaths: string[];
}

export async function getRunReview(runId: string): Promise<RunReviewState | null> {
  return readJson<RunReviewState>(reviewPath(runId));
}

export async function updateRunReview(
  runId: string,
  input: { action: 'keep' | 'mark-reviewed'; paths: string[] },
): Promise<RunReviewState> {
  const current = await getRunReview(runId);
  const keptPaths = new Set(current?.keptPaths || []);
  const reviewedPaths = new Set(current?.reviewedPaths || []);

  for (const item of input.paths) {
    const normalized = normalizeWikiPath(item);
    if (!normalized) continue;
    if (input.action === 'keep') keptPaths.add(normalized);
    if (input.action === 'mark-reviewed') reviewedPaths.add(normalized);
  }

  const next: RunReviewState = {
    updatedAt: new Date().toISOString(),
    keptPaths: [...keptPaths].sort(),
    reviewedPaths: [...reviewedPaths].sort(),
  };

  await writeJson(reviewPath(runId), next);
  return next;
}

function reviewPath(runId: string): string {
  return path.join(labStateRoot, 'runs', runId, 'review.json');
}

function normalizeWikiPath(value: string): string | null {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized.startsWith('wiki/') || normalized.includes('../')) return null;
  return normalized;
}
