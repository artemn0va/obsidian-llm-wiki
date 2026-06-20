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
    forkVersion: string | null;
    installedVersion: string | null;
    forkMainHash: string | null;
    installedMainHash: string | null;
    hashMatch: boolean;
    deploy: DeployStatus;
    reloadNeeded: boolean;
    workflowMessage: string;
  };
  bridge: {
    stateRoot: string;
    runtimeStatus: BridgeRuntimeStatus | null;
    queue: BridgeQueueStatus;
  };
}

export interface DeployStatus {
  lastBuildAt: string | null;
  lastBuildExitCode: number | null;
  lastDeployAt: string | null;
  lastDeployHash: string | null;
  lastDeployFiles: string[];
  lastDeployLog: string[];
  reloadNeeded: boolean;
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
  settings?: PluginSettingsMirror | null;
}

export interface PluginSettingsMirror {
  source: 'runtime-status';
  updatedAt: string;
  provider: string;
  model: string;
  extractionGranularity: string;
  wikiLanguage: string;
  uiLanguage: string;
  wikiFolder: string;
  labBridgeEnabled: boolean;
  enableSchema: boolean;
  autoWatchSources: boolean;
  autoWatchMode: string;
  watchedFolders: string[];
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

export type BridgeQueueState = 'pending' | 'running' | 'stale' | 'failed' | 'done';

export interface BridgeQueueItem {
  id: string;
  type: string;
  path: string | null;
  state: BridgeQueueState;
  reason: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastHeartbeatAt: string | null;
  ageMs: number | null;
  commandFile: string | null;
  responseStatus: string | null;
  canClearStale: boolean;
  canCancel: boolean;
}

export interface BridgeQueueStatus {
  generatedAt: string;
  staleThresholdMs: number;
  activeCommandAgeMs: number | null;
  lastHeartbeatAt: string | null;
  disabledReason: string | null;
  warnings: string[];
  counts: Record<BridgeQueueState, number>;
  items: BridgeQueueItem[];
}

export interface BridgeQueueActionResult {
  cleared: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface BridgeCancelResult {
  queued: boolean;
  commandId: string | null;
  reason: string;
}

export interface SchemaHealth {
  generatedAt: string;
  schemaPath: string;
  exists: boolean;
  modifiedAt: string | null;
  detectedSections: string[];
  requiredSections: string[];
  missingRequiredSections: string[];
  taskCoverage: SchemaTaskCoverage[];
  unusedImportantSections: string[];
  wikiLanguage: string | null;
  languagePolicy: {
    present: boolean;
    preview: string[];
  };
  warnings: string[];
}

export interface SchemaTaskCoverage {
  task: 'analyze' | 'summary' | 'entity' | 'concept' | 'related' | 'merge' | 'full';
  configuredSections: string[];
  availableSections: string[];
  missingSections: string[];
  importantSectionsUsed: string[];
  coveragePercent: number;
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

export type QAFixIssueType = 'broken-links' | 'prompt-leaks' | 'source_file' | 'bad-slug' | 'source-tag-pollution' | 'other';

export interface QAFixPreviewItem {
  id: string;
  type: QAFixIssueType;
  fixable: boolean;
  file: string;
  line?: number;
  severity: QAFinding['severity'];
  message: string;
  proposedChange: string;
  beforeSnippet?: string;
  afterSnippet?: string;
  explanation?: string;
}

export interface QAFixPreview {
  generatedAt: string;
  fixableCount: number;
  nonFixableCount: number;
  groups: Record<QAFixIssueType, QAFixPreviewItem[]>;
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
  quality: IngestQualityScore;
}

export type QualityRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface IngestQualityScore {
  contentScore: number | null;
  structureScore: number | null;
  riskLevel: QualityRiskLevel;
  affectedFiles: number;
  reasons: {
    content: string[];
    structure: string[];
    risk: string[];
    actions: string[];
  };
  metrics: {
    thinPages: number;
    duplicateQuotes: number;
    missingSourceAttribution: number;
    brokenLinks: number;
    badSlugs: number;
    frontmatterIssues: number;
    promptLeaks: number;
    errors: number;
    warnings: number;
    info: number;
  };
  llmReview: {
    enabled: false;
    status: 'disabled';
    note: string;
  };
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

export interface CleanLastIngestPreview {
  runId: string;
  commandPath?: string;
  mode: 'diff' | 'current-vs-before';
  deleteCandidates: string[];
  restoreCandidates: string[];
  skipped: Array<{ path: string; reason: string }>;
  preservedChanged: string[];
}

export type IngestGranularity = 'auto' | 'fine' | 'standard' | 'coarse' | 'minimal';

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
