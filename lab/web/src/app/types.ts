export interface LabStatus {
  activeVaultRoot: string;
  forkRoot: string;
  wikiRoot: string;
  pluginInstallRoot: string;
  resetScriptExists: boolean;
  webBuildExists: boolean;
  wikiCounts: Record<string, number>;
  plugin: {
    installed: boolean;
    version: string | null;
    forkMainHash: string | null;
    installedMainHash: string | null;
    hashMatch: boolean;
  };
  bridge: {
    stateRoot: string;
    runtimeStatus: BridgeRuntimeStatus | null;
  };
}

export interface BridgeRuntimeStatus {
  enabled?: boolean;
  running?: boolean;
  busy?: boolean;
  updatedAt?: string;
  message?: string;
  activeCommand?: {
    id: string;
    type: string;
    path?: string;
    createdAt?: string;
  } | null;
  progress?: BridgeProgress | null;
}

export interface BridgeProgress {
  message: string;
  phase: string;
  current?: number;
  total?: number;
  percent?: number;
  target?: string;
  updatedAt: string;
}

export interface WikiFileInfo {
  path: string;
  title: string;
  type: string;
  tags: string[];
  aliases: string[];
  sources: string[];
  size: number;
  modifiedAt: string;
  warningCount: number;
}

export interface QAReport {
  generatedAt: string;
  counts: Record<'error' | 'warning' | 'info', number>;
  findings: QAFinding[];
}

export interface QAFinding {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestedFix: string;
}

export interface QAFixReport {
  generatedAt: string;
  applied: number;
  updatedFiles: string[];
  remainingFindings: number;
  changes: Array<{
    file: string;
    action: string;
    count: number;
  }>;
}

export interface RunRecord {
  id: string;
  modifiedAt: string;
  sourcePath: string | null;
  commandType: string;
  mode: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  isStale: boolean;
  staleReason: string | null;
  canCleanup: boolean;
  counts: {
    created: number;
    changed: number;
    deleted: number;
  };
  command: unknown;
  response: unknown;
  before?: unknown;
  after?: unknown;
  diff?: {
    created?: Array<{ path?: string }>;
    changed?: Array<{ path?: string }>;
    deleted?: Array<{ path?: string }>;
    preserved?: Array<{ path?: string }>;
  } | null;
  review?: {
    updatedAt: string;
    keptPaths: string[];
    reviewedPaths: string[];
  } | null;
  qaBefore?: QAReport | null;
  qaAfter?: QAReport | null;
}

export interface RunReviewState {
  updatedAt: string;
  keptPaths: string[];
  reviewedPaths: string[];
}

export interface StaleRunCleanupResult {
  deleted: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface RunDiffFileContent {
  runId: string;
  path: string;
  beforeContent: string | null;
  afterContent: string | null;
  beforeExists: boolean;
  afterExists: boolean;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CleanLastIngestResult {
  runId: string;
  commandPath?: string;
  mode: 'diff' | 'current-vs-before';
  deleted: string[];
  skipped: Array<{ path: string; reason: string }>;
  restoredChanged: string[];
  preservedChanged: string[];
}

export type IngestGranularity = 'fine' | 'standard' | 'coarse' | 'minimal';

export interface IngestCandidate {
  path: string;
  title: string;
  kind: 'file' | 'folder';
  root: 'wiki-start' | 'sources';
  modifiedAt?: string;
  size?: number;
  markdownCount?: number;
}

export interface IngestCandidates {
  files: IngestCandidate[];
  folders: IngestCandidate[];
  recent: IngestCandidate[];
}

export interface BridgeCommandResponse {
  id: string;
  type: string;
  path?: string;
  granularity?: IngestGranularity;
  createdAt: string;
}
