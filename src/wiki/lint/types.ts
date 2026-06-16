// Shared types for the lint pipeline.
// These are internal to src/wiki/lint/ and are not exported from the package
// surface. LintController is the only public entry point.

import { LLMWikiSettings } from '../../types';

export interface LintPhaseContext {
  app: {
    vault: {
      getMarkdownFiles: () => Array<{ path: string; basename: string }>;
      read: (file: { path: string }) => Promise<string>;
      getAbstractFileByPath: (path: string) => unknown;
      process: (file: unknown, fn: (data: string) => string | Promise<string>) => Promise<string>;
    };
    workspace: {
      onLayoutReady: (cb: () => void) => void;
    };
    metadataCache: {
      on: (event: string, cb: unknown) => unknown;
    };
  };
  settings: LLMWikiSettings;
  wikiEngine: {
    updateStatusBar: (text: string) => void;
    getExistingWikiPages: () => Promise<Array<{ path: string }>>;
    tryReadFile: (path: string) => Promise<string | null>;
    getOpenContradictions: () => Promise<Array<{ path: string; status: string; claim: string }>>;
    resolveContradiction: (path: string) => Promise<void>;
    updateContradictionStatus: (path: string, status: string) => Promise<void>;
  };
  checkCancelled: () => void;
  stageNotice: {
    setMessage: (message: string) => void;
  } | null;
  totalPages: number;
}

export interface ScannerPage {
  path: string;
  content: string;
  basename: string;
}

export interface ProgrammaticFindings {
  aliasDeficientPages: ScannerPage[];
  emptyPages: Array<{ path: string; content: string }>;
  orphans: string[];
  tagViolations: import('./scanners').TagViolation[];
  pollutedPages: Array<{ path: string; title: string; cleanTitle: string }>;
  deadLinks: Array<{ source: string; target: string }>;
  ungroundedQuotes: import('./scanners').QuoteGroundingIssue[];
  sourcesNormalizedFiles: number;
  sourcesNormalizedEntries: number;
  doubleNestFixes: number;
}

export interface DuplicateResult {
  target: string;
  source: string;
  reason: string;
}

export interface LlmAssistedResults {
  duplicates: DuplicateResult[];
  contradictionsReport: string;
  llmReport: string;
}
