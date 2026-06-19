import { App } from 'obsidian';
import type { ExtractionGranularity, LLMWikiSettings } from './types';
import { WikiEngine } from './wiki/wiki-engine';

type BridgeCommandType = 'ingest-file' | 'ingest-folder' | 'lint-wiki' | 'regenerate-index' | 'cancel';
type BridgeStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';

interface BridgeProgress {
  message: string;
  phase: string;
  current?: number;
  total?: number;
  percent?: number;
  target?: string;
  updatedAt: string;
}

interface BridgeCommand {
  id: string;
  type: BridgeCommandType;
  path?: string;
  granularity?: ExtractionGranularity;
  createdAt?: string;
  source?: string;
}

const LAB_GRANULARITIES: ExtractionGranularity[] = ['fine', 'standard', 'coarse', 'minimal'];

interface BridgeHost {
  app: App;
  settings: LLMWikiSettings;
  wikiEngine: WikiEngine;
  registerInterval(id: number): number;
  runLabIngestFile(path: string, onProgress?: (message: string) => void): Promise<unknown>;
  runLabIngestFolder(path: string, onProgress?: (message: string) => void): Promise<unknown>;
  lintWiki(): Promise<void>;
}

const ROOT = '.llm-wiki-lab';
const COMMANDS = `${ROOT}/commands`;
const RESPONSES = `${ROOT}/responses`;
const RUNS = `${ROOT}/runs`;
const LOGS = `${ROOT}/logs`;
const RUNTIME_STATUS = `${ROOT}/runtime-status.json`;

export class LabBridge {
  private busy = false;
  private activeCommand: BridgeCommand | null = null;
  private activeProgress: BridgeProgress | null = null;

  constructor(private host: BridgeHost) {}

  start(): void {
    void this.ensureBridgeFolders();
    void this.writeRuntimeStatus('Bridge loaded.');
    this.host.registerInterval(window.setInterval(() => {
      void this.tick();
    }, 1000));
  }

  async stop(): Promise<void> {
    await this.writeRuntimeStatus('Bridge stopped.', false);
  }

  private async tick(): Promise<void> {
    await this.ensureBridgeFolders();
    if (this.busy) {
      await this.writeRuntimeStatus(this.activeProgress?.message || 'Bridge busy.');
      return;
    }

    await this.writeRuntimeStatus(this.host.settings.labBridgeEnabled ? 'Bridge polling.' : 'Bridge disabled.');

    if (!this.host.settings.labBridgeEnabled) return;

    const adapter = this.host.app.vault.adapter;
    const listing = await adapter.list(COMMANDS);
    const commandFiles = listing.files
      .filter((file) => file.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));

    const commandPath = commandFiles[0];
    if (!commandPath) return;

    let command: BridgeCommand;
    try {
      command = JSON.parse(await adapter.read(commandPath)) as BridgeCommand;
    } catch (error) {
      await adapter.remove(commandPath);
      console.error('[WikiLabBridge] Invalid command removed:', commandPath, error);
      return;
    }

    await this.processCommand(command, commandPath);
  }

  private async processCommand(command: BridgeCommand, commandPath: string): Promise<void> {
    this.busy = true;
    this.activeCommand = command;
    this.activeProgress = this.buildProgress(`Starting ${command.type}.`, 0, command.path);
    await this.writeResponse(command, 'running', `Running ${command.type}`, undefined, this.activeProgress);
    await this.writeRuntimeStatus(`Running ${command.type}.`);

    try {
      const report = await this.execute(command);
      const status: BridgeStatus = command.type === 'cancel' ? 'cancelled' : 'success';
      this.activeProgress = this.buildProgress(`${command.type} complete.`, 100, command.path);
      await this.writeRuntimeStatus(`${command.type} complete.`);
      await this.writeResponse(command, status, `${command.type} complete.`, report, this.activeProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.activeProgress = this.buildProgress(message, undefined, command.path);
      await this.writeRuntimeStatus(message);
      await this.writeResponse(command, 'error', message, undefined, this.activeProgress);
      console.error('[WikiLabBridge] Command failed:', command, error);
    } finally {
      try {
        await this.host.app.vault.adapter.remove(commandPath);
      } catch {
        // Command may already be gone.
      }
      this.busy = false;
      this.activeCommand = null;
      this.activeProgress = null;
      await this.writeRuntimeStatus('Bridge polling.');
    }
  }

  private async execute(command: BridgeCommand): Promise<unknown> {
    switch (command.type) {
      case 'ingest-file':
        if (!command.path) throw new Error('ingest-file requires path.');
        return this.withCommandGranularity(command, () => (
          this.withWikiProgress(command, onProgress => this.host.runLabIngestFile(command.path!, onProgress))
        ));
      case 'ingest-folder':
        if (!command.path) throw new Error('ingest-folder requires path.');
        return this.withCommandGranularity(command, () => (
          this.withWikiProgress(command, onProgress => this.host.runLabIngestFolder(command.path!, onProgress))
        ));
      case 'lint-wiki':
        this.reportProgress(command, 'Linting wiki...');
        await this.host.lintWiki();
        return { success: true };
      case 'regenerate-index':
        this.reportProgress(command, 'Regenerating index...');
        await this.host.wikiEngine.generateIndexFromEngine();
        return { success: true };
      case 'cancel':
        if (this.host.wikiEngine.isIngesting()) this.host.wikiEngine.cancelIngestion();
        if (this.host.wikiEngine.isLintRunning()) this.host.wikiEngine.cancelLint();
        return { cancelled: true };
      default:
        throw new Error(`Unsupported command type: ${(command as { type: string }).type}`);
    }
  }

  private async withCommandGranularity<T>(
    command: BridgeCommand,
    run: () => Promise<T>,
  ): Promise<T> {
    const granularity = this.normalizeGranularity(command.granularity);
    if (!granularity) return run();

    const previousGranularity = this.host.settings.extractionGranularity;
    if (previousGranularity === granularity) return run();

    this.host.settings.extractionGranularity = granularity;
    this.host.wikiEngine.updateSettings(this.host.settings);
    this.reportProgress(command, `Using ${granularity} granularity...`);

    try {
      return await run();
    } finally {
      this.host.settings.extractionGranularity = previousGranularity;
      this.host.wikiEngine.updateSettings(this.host.settings);
    }
  }

  private normalizeGranularity(value?: string): ExtractionGranularity | null {
    return LAB_GRANULARITIES.includes(value as ExtractionGranularity)
      ? value as ExtractionGranularity
      : null;
  }

  private async withWikiProgress<T>(
    command: BridgeCommand,
    run: (onProgress: (message: string) => void) => Promise<T>,
  ): Promise<T> {
    const previousProgress = this.host.wikiEngine.getProgressCallback();
    const onProgress = (message: string) => {
      previousProgress?.(message);
      this.reportProgress(command, message);
    };

    this.host.wikiEngine.setProgressCallback(onProgress);
    try {
      return await run(onProgress);
    } finally {
      this.host.wikiEngine.setProgressCallback(previousProgress);
    }
  }

  private async ensureBridgeFolders(): Promise<void> {
    const adapter = this.host.app.vault.adapter;
    for (const folder of [ROOT, COMMANDS, RESPONSES, RUNS, LOGS]) {
      if (!(await adapter.exists(folder))) {
        await adapter.mkdir(folder);
      }
    }
  }

  private buildProgress(message: string, percent?: number, target?: string): BridgeProgress {
    const prefixedStep = message.match(/^\[(\d+)\/(\d+)\]\s*(.+)$/);
    const batchStep = message.match(/\bbatch\s+(\d+)\/(\d+)/i);

    const current = prefixedStep ? Number(prefixedStep[1]) : batchStep ? Number(batchStep[1]) : undefined;
    const total = prefixedStep ? Number(prefixedStep[2]) : batchStep ? Number(batchStep[2]) : undefined;
    const computedPercent = current && total
      ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
      : percent;

    return {
      message,
      phase: prefixedStep ? prefixedStep[3] : message,
      current,
      total,
      percent: computedPercent,
      target,
      updatedAt: new Date().toISOString(),
    };
  }

  private reportProgress(command: BridgeCommand, message: string): void {
    if (this.activeCommand?.id !== command.id) return;

    this.activeProgress = this.buildProgress(message, undefined, command.path);
    void this.writeRuntimeStatus(message);
    void this.writeResponse(command, 'running', message, undefined, this.activeProgress);
  }

  private async writeRuntimeStatus(message: string, running = true): Promise<void> {
    await this.host.app.vault.adapter.write(RUNTIME_STATUS, JSON.stringify({
      enabled: Boolean(this.host.settings.labBridgeEnabled),
      running,
      busy: this.busy,
      message,
      activeCommand: this.activeCommand,
      progress: this.activeProgress,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  }

  private async writeResponse(
    command: BridgeCommand,
    status: BridgeStatus,
    message: string,
    report?: unknown,
    progress?: BridgeProgress | null,
  ): Promise<void> {
    await this.host.app.vault.adapter.write(`${RESPONSES}/${command.id}.json`, JSON.stringify({
      id: command.id,
      type: command.type,
      status,
      message,
      progress: progress || null,
      report,
      startedAt: status === 'running' ? new Date().toISOString() : undefined,
      finishedAt: status !== 'running' ? new Date().toISOString() : undefined,
    }, null, 2));
  }
}
