import type {
  BridgeCommandResponse,
  BridgeCancelResult,
  BridgeQueueActionResult,
  BridgeQueueStatus,
  CleanLastIngestPreview,
  CleanLastIngestResult,
  IngestCandidates,
  IngestGranularity,
  LabStatus,
  ProcessResult,
  QAFixReport,
  QAFixPreview,
  QAReport,
  RunDiffFileContent,
  RunReviewState,
  RunRecord,
  SchemaHealth,
  StaleRunCleanupResult,
  WikiFileInfo,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return payload as T;
}

export const api = {
  health: () => request<{ ok: boolean; now: string }>('/api/health'),
  status: () => request<LabStatus>('/api/status'),
  runs: () => request<RunRecord[]>('/api/runs'),
  reviewRun: (id: string, body: { action: 'keep' | 'mark-reviewed'; paths: string[] }) =>
    request<RunReviewState>(`/api/runs/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cleanupStaleRuns: (ids?: string[]) =>
    request<StaleRunCleanupResult>('/api/runs/stale/cleanup', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  runDiffFile: (id: string, path: string) =>
    request<RunDiffFileContent>(`/api/runs/${encodeURIComponent(id)}/diff-file?path=${encodeURIComponent(path)}`),
  wikiFiles: () => request<WikiFileInfo[]>('/api/wiki/files'),
  wikiFile: (path: string) => request<{ path: string; content: string }>(`/api/wiki/file?path=${encodeURIComponent(path)}`),
  ingestCandidates: () => request<IngestCandidates>('/api/ingest/candidates'),
  cleanLastIngest: () =>
    request<CleanLastIngestResult>('/api/wiki/clean-last-ingest', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  cleanLastIngestPreview: () => request<CleanLastIngestPreview>('/api/wiki/clean-last-ingest/preview'),
  qa: () => request<QAReport>('/api/qa'),
  qaFix: () =>
    request<QAFixReport>('/api/qa/fix', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  qaFixPreview: () => request<QAFixPreview>('/api/qa/fix/preview'),
  qaFixApply: (ids?: string[]) =>
    request<QAFixReport>('/api/qa/fix/apply', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  schemaHealth: () => request<SchemaHealth>('/api/schema/health'),
  reset: (execute: boolean) =>
    request<ProcessResult>('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ execute }),
    }),
  buildDeploy: () =>
    request<{ success: boolean; build: ProcessResult; deploy: unknown }>('/api/plugin/build-deploy', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  reloadObsidian: () =>
    request<ProcessResult>('/api/obsidian/reload', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  bridgeCommand: (body: { type: string; path?: string; granularity?: IngestGranularity }) =>
    request<BridgeCommandResponse>('/api/bridge/command', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bridgeQueue: () => request<BridgeQueueStatus>('/api/bridge/queue'),
  clearStaleBridgeCommands: (ids?: string[]) =>
    request<BridgeQueueActionResult>('/api/bridge/queue/clear-stale', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  cancelActiveBridgeWork: () =>
    request<BridgeCancelResult>('/api/bridge/cancel-active', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  bridgeCommandStatus: (id: string) => request<Record<string, unknown>>(`/api/bridge/command/${id}`),
};
