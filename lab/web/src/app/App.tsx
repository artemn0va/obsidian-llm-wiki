import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  ActivityIcon,
  AlertTriangleIcon,
  BookOpenIcon,
  BoxesIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  FileDiffIcon,
  FileTextIcon,
  HammerIcon,
  LayoutDashboardIcon,
  Loader2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlugZapIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  WandSparklesIcon,
  XCircleIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentProps, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import type { BridgeProgress, BridgeQueueItem, CleanLastIngestPreview, CleanLastIngestResult, IngestCandidate, IngestCandidates, IngestGranularity, LabStatus, QAFixPreview, QAFixPreviewItem, QAReport, QAFinding, RunDiffFileContent, RunRecord, WikiFileInfo } from './types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ModeToggle } from '@/components/mode-toggle';
import { cn } from '@/lib/utils';

type ViewKey = 'dashboard' | 'files' | 'qa' | 'runs' | 'diff' | 'bridge';

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboardIcon }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { key: 'files', label: 'Wiki Files', icon: FileTextIcon },
  { key: 'qa', label: 'QA Report', icon: ShieldCheckIcon },
  { key: 'runs', label: 'Runs', icon: ActivityIcon },
  { key: 'diff', label: 'Last Diff', icon: FileDiffIcon },
  { key: 'bridge', label: 'Plugin Bridge', icon: PlugZapIcon },
];

const SIDEBAR_DEFAULT_WIDTH_REM = 18;
const SIDEBAR_MIN_WIDTH_REM = 12;
const SIDEBAR_MAX_WIDTH_REM = 26;
const SIDEBAR_ICON_WIDTH_REM = 3;

export function App() {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [files, setFiles] = useState<WikiFileInfo[]>([]);
  const [qa, setQa] = useState<QAReport | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState<string>('');
  const [dryRunOutput, setDryRunOutput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidthRem, setSidebarWidthRem] = useState(SIDEBAR_DEFAULT_WIDTH_REM);

  const refresh = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [nextStatus, nextFiles, nextQa, nextRuns] = await Promise.all([
        api.status(),
        api.wikiFiles(),
        api.qa(),
        api.runs(),
      ]);
      setStatus(nextStatus);
      setFiles(nextFiles);
      setQa(nextQa);
      setRuns(nextRuns);
      if (!selectedFilePath && nextFiles[0]) setSelectedFilePath(nextFiles[0].path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!busyLabel && !status?.bridge.runtimeStatus?.busy) return;

    const id = window.setInterval(() => {
      void refresh(false);
    }, 1000);

    return () => window.clearInterval(id);
  }, [busyLabel, status?.bridge.runtimeStatus?.busy]);

  useEffect(() => {
    if (!selectedFilePath) return;
    api
      .wikiFile(selectedFilePath)
      .then((file) => setSelectedFileContent(file.content))
      .catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, [selectedFilePath]);

  const runAction = async <T,>(label: string, action: () => Promise<T>): Promise<T> => {
    setBusyLabel(label);
    try {
      const result = await action();
      toast.success(`${label} complete`);
      await refresh();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setBusyLabel('');
    }
  };

  const fixQa = () =>
    runAction('Fix QA', async () => {
      const result = await api.qaFix();
      toast.info(
        result.applied
          ? `Applied ${result.applied} fixes in ${result.updatedFiles.length} files.`
          : 'No auto-fixable QA findings.',
      );
    });
  const cleanLastIngest = () =>
    runAction('Clean Last Ingest', async () => {
      const result = await api.cleanLastIngest();
      const touched = result.deleted.length + result.restoredChanged.length;
      toast.info(
        touched
          ? `Deleted ${result.deleted.length} and restored ${result.restoredChanged.length} files from ${result.commandPath || result.runId}.`
          : 'No restorable changes found for the last ingest.',
      );
      if (result.skipped.length) {
        toast.warning(`${result.skipped.length} rollback items were skipped. Open Clean Last Ingest details for reasons.`);
      }
      return result;
    });

  const selectedFile = files.find((file) => file.path === selectedFilePath);
  const sidebarStyle = {
    '--sidebar-width': `${sidebarWidthRem}rem`,
    '--sidebar-width-icon': `${SIDEBAR_ICON_WIDTH_REM}rem`,
  } as CSSProperties;

  return (
    <TooltipProvider>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} style={sidebarStyle} className="h-svh overflow-hidden">
        <Sidebar collapsible="icon" className="relative">
          <SidebarHeader className="h-14 justify-center border-b p-2">
            <div className="flex min-w-0 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground group-data-[collapsible=icon]:hidden">
                <BoxesIcon />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <div className="truncate text-sm font-semibold">Wiki Lab</div>
                <div className="truncate text-xs text-muted-foreground">Local control panel</div>
              </div>
              <SidebarCollapseButton open={sidebarOpen} setOpen={setSidebarOpen} />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={activeView === item.key}
                        tooltip={item.label}
                        onClick={() => setActiveView(item.key)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <TooltipButton
              tooltip="Refresh data"
              variant="outline"
              size="sm"
              className="w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0"
              onClick={() => void refresh()}
              disabled={Boolean(busyLabel)}
            >
              <RefreshCwIcon data-icon="inline-start" />
              <span className="group-data-[collapsible=icon]:hidden">Refresh</span>
            </TooltipButton>
          </SidebarFooter>
          <SidebarResizeHandle
            disabled={!sidebarOpen}
            widthRem={sidebarWidthRem}
            onWidthChange={setSidebarWidthRem}
          />
        </Sidebar>

        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <header className="flex min-h-14 items-center gap-3 border-b bg-card px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="truncate text-sm font-medium">{titleFor(activeView)}</div>
              {busyLabel ? (
                <Badge variant="secondary">
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                  {busyLabel}
                </Badge>
              ) : null}
            </div>
            <BridgeProgressBadge status={status} />
            <StatusBadges status={status} loading={loading} />
            <ModeToggle />
          </header>

          <main className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-1 flex-col overflow-hidden p-4">
            {loading && !status ? (
              <LoadingState />
            ) : (
              <>
                {activeView === 'dashboard' ? (
                  <Dashboard
                    status={status}
                    files={files}
                    qa={qa}
                    busyLabel={busyLabel}
                    dryRunOutput={dryRunOutput}
                    setDryRunOutput={setDryRunOutput}
                    runAction={runAction}
                    fixQa={fixQa}
                    cleanLastIngest={cleanLastIngest}
                  />
                ) : null}
                {activeView === 'files' ? (
                  <WikiFiles files={files} selectedFile={selectedFile} selectedPath={selectedFilePath} setSelectedPath={setSelectedFilePath} content={selectedFileContent} />
                ) : null}
                {activeView === 'qa' ? (
                  <QAView
                    qa={qa}
                    busy={Boolean(busyLabel)}
                    refreshQa={() => runAction('Run QA', async () => setQa(await api.qa()))}
                    runAction={runAction}
                    openWikiFile={(path) => {
                      setSelectedFilePath(path);
                      setActiveView('files');
                    }}
                  />
                ) : null}
                {activeView === 'runs' ? (
                  <RunsView
                    runs={runs}
                    busy={Boolean(busyLabel)}
                    runAction={runAction}
                    cleanLastIngest={cleanLastIngest}
                    openDiffView={() => setActiveView('diff')}
                    openWikiFile={(path) => {
                      setSelectedFilePath(path);
                      setActiveView('files');
                    }}
                  />
                ) : null}
                {activeView === 'diff' ? (
                  <LastIngestDiffView
                    runs={runs}
                    busy={Boolean(busyLabel)}
                    runAction={runAction}
                    cleanLastIngest={cleanLastIngest}
                    openWikiFile={(path) => {
                      setSelectedFilePath(path);
                      setActiveView('files');
                    }}
                  />
                ) : null}
                {activeView === 'bridge' ? (
                  <BridgeView status={status} busyLabel={busyLabel} runAction={runAction} />
                ) : null}
              </>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster richColors />
    </TooltipProvider>
  );
}

function SidebarCollapseButton({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const Icon = open ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-8 shrink-0 group-data-[collapsible=icon]:ml-0"
          onClick={() => setOpen(!open)}
        >
          <Icon />
          <span className="sr-only">{open ? 'Collapse sidebar' : 'Expand sidebar'}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{open ? 'Collapse sidebar' : 'Expand sidebar'}</TooltipContent>
    </Tooltip>
  );
}

function SidebarResizeHandle({
  disabled,
  widthRem,
  onWidthChange,
}: {
  disabled: boolean;
  widthRem: number;
  onWidthChange: (widthRem: number) => void;
}) {
  const setClampedWidth = (nextWidthRem: number) => {
    onWidthChange(Math.min(SIDEBAR_MAX_WIDTH_REM, Math.max(SIDEBAR_MIN_WIDTH_REM, nextWidthRem)));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;

    event.preventDefault();
    const startX = event.clientX;
    const startWidthRem = widthRem;
    const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setClampedWidth(startWidthRem + (moveEvent.clientX - startX) / rootFontSize);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  if (disabled) return null;

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN_WIDTH_REM}
      aria-valuemax={SIDEBAR_MAX_WIDTH_REM}
      aria-valuenow={Math.round(widthRem)}
      tabIndex={0}
      className="absolute top-0 right-0 z-30 hidden h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-sidebar-border focus-visible:bg-sidebar-ring focus-visible:outline-none md:block"
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setClampedWidth(widthRem - 0.5);
        if (event.key === 'ArrowRight') setClampedWidth(widthRem + 0.5);
      }}
    />
  );
}

function Dashboard({
  status,
  files,
  qa,
  busyLabel,
  dryRunOutput,
  setDryRunOutput,
  runAction,
  fixQa,
  cleanLastIngest,
}: {
  status: LabStatus | null;
  files: WikiFileInfo[];
  qa: QAReport | null;
  busyLabel: string;
  dryRunOutput: string;
  setDryRunOutput: (value: string) => void;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  fixQa: () => Promise<void>;
  cleanLastIngest: () => Promise<CleanLastIngestResult>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard title="Entities" value={status?.wikiCounts.entity || 0} description="Generated people, projects, products" />
        <MetricCard title="Concepts" value={status?.wikiCounts.concept || 0} description="Durable methods, terms, ideas" />
        <MetricCard title="Sources" value={status?.wikiCounts.source || 0} description="Ingested source summaries" />
        <MetricCard title="QA Errors" value={qa?.counts.error || 0} description={`${qa?.counts.warning || 0} warnings, ${qa?.counts.info || 0} info`} />
      </div>

      <ActiveProgressPanel status={status} />

      <Tabs defaultValue="operations" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
        </TabsList>
        <TabsContent value="operations" className="m-0">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Action Console</CardTitle>
                <CardDescription>Clean, check, deploy, and trigger Obsidian bridge commands.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <TooltipButton
                  tooltip="Preview reset"
                  variant="outline"
                  disabled={Boolean(busyLabel)}
                  onClick={() =>
                    void runAction('Dry Clean', async () => {
                      const result = await api.reset(false);
                      setDryRunOutput(result.stdout || result.stderr || 'No output.');
                    })
                  }
                >
                  <Trash2Icon data-icon="inline-start" />
                  Dry Clean
                </TooltipButton>
                <CleanWikiButton busy={Boolean(busyLabel)} runAction={runAction} />
                <CleanLastIngestButton busy={Boolean(busyLabel)} cleanLastIngest={cleanLastIngest} />
                <IngestCommandButton status={status} busy={Boolean(busyLabel)} runAction={runAction} />
                <TooltipButton
                  tooltip="Install plugin"
                  variant="outline"
                  disabled={Boolean(busyLabel)}
                  onClick={() => void runAction('Build + Deploy', () => api.buildDeploy())}
                >
                  <HammerIcon data-icon="inline-start" />
                  Build + Deploy
                </TooltipButton>
                <TooltipButton
                  tooltip="Restart Obsidian"
                  variant="outline"
                  disabled={Boolean(busyLabel)}
                  onClick={() => void runAction('Reload Obsidian', () => api.reloadObsidian())}
                >
                  <RefreshCwIcon data-icon="inline-start" />
                  Reload Obsidian
                </TooltipButton>
                <TooltipButton tooltip="Scan wiki" variant="outline" disabled={Boolean(busyLabel)} onClick={() => void runAction('Run QA', () => api.qa())}>
                  <ShieldCheckIcon data-icon="inline-start" />
                  Run QA
                </TooltipButton>
                <TooltipButton tooltip="Fix safe QA issues" variant="outline" disabled={Boolean(busyLabel)} onClick={() => void fixQa()}>
                  <WandSparklesIcon data-icon="inline-start" />
                  Fix QA
                </TooltipButton>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dry Clean Output</CardTitle>
                <CardDescription>Reset script output from the last dry run.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-40 rounded-md border bg-muted/30 p-3">
                  <pre className="text-xs leading-5">{dryRunOutput || 'Run Dry Clean to preview reset-wiki.ps1 output.'}</pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="status" className="m-0">
          <div className="grid gap-4 xl:grid-cols-3">
            <StatusCard title="Active Vault" value={status?.activeVaultRoot || 'Unknown'} ok={Boolean(status?.activeVaultRoot)} />
            <StatusCard title="Plugin Hash Match" value={status?.plugin.hashMatch ? 'Matched' : 'Mismatch'} ok={Boolean(status?.plugin.hashMatch)} />
            <StatusCard title="Bridge" value={bridgeLabel(status)} ok={Boolean(status?.bridge.runtimeStatus?.enabled)} />
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <RecentFiles files={files} />
        <FindingsPanel findings={qa?.findings || []} busy={Boolean(busyLabel)} onFixQa={() => void fixQa()} />
      </div>
    </div>
  );
}

function WikiFiles({
  files,
  selectedFile,
  selectedPath,
  setSelectedPath,
  content,
}: {
  files: WikiFileInfo[];
  selectedFile?: WikiFileInfo;
  selectedPath: string;
  setSelectedPath: (path: string) => void;
  content: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'modifiedAt', desc: true }]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const columns = useMemo<ColumnDef<WikiFileInfo>[]>(
    () => [
      { accessorKey: 'path', header: 'Path' },
      { accessorKey: 'type', header: 'Type' },
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'warningCount', header: 'Warnings' },
      { accessorKey: 'modifiedAt', header: 'Modified' },
    ],
    [],
  );
  const table = useReactTable({
    data: files,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="min-h-0 flex-1"
      autoSaveId="wiki-lab-files-layout"
    >
      <ResizablePanel defaultSize="58%" minSize="32rem" className="min-w-0">
        <Card className="h-full min-h-0 overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>Wiki Files</CardTitle>
            <CardDescription>{files.length} markdown files under wiki/.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <ScrollArea className="h-full rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          <button className="flex items-center gap-1 text-left" onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </button>
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.original.path === selectedPath ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => setSelectedPath(row.original.path)}
                    >
                      <TableCell className="max-w-[22rem] truncate font-mono text-xs">{row.original.path}</TableCell>
                      <TableCell><Badge variant="secondary">{row.original.type}</Badge></TableCell>
                      <TableCell className="max-w-[18rem] truncate">{row.original.title}</TableCell>
                      <TableCell>{row.original.warningCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(row.original.modifiedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </ResizablePanel>

      <ResizableHandle withHandle className="mx-2" />

      <ResizablePanel defaultSize="42%" minSize="22rem" className="min-w-0">
        <Card className="h-full min-h-0 overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{selectedFile?.title || 'Preview'}</CardTitle>
              <CardDescription className="truncate">{selectedFile?.path || 'Select a wiki file.'}</CardDescription>
            </div>
            <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
              <TooltipButton tooltip="Open preview" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <BookOpenIcon data-icon="inline-start" />
                Open
              </TooltipButton>
              <SheetContent className="w-[min(48rem,95vw)] sm:max-w-none">
                <SheetHeader>
                  <SheetTitle>{selectedFile?.title || 'Preview'}</SheetTitle>
                  <SheetDescription>{selectedFile?.path}</SheetDescription>
                </SheetHeader>
                <ScrollArea className="mt-4 h-[calc(100vh-8rem)] rounded-md border bg-muted/30 p-4">
                  <pre className="whitespace-pre-wrap text-xs leading-5">{content}</pre>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <ScrollArea className="h-full rounded-md border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-xs leading-5">{content || 'No file selected.'}</pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function QAView({
  qa,
  busy,
  refreshQa,
  runAction,
  openWikiFile,
}: {
  qa: QAReport | null;
  busy: boolean;
  refreshQa: () => void;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  openWikiFile: (path: string) => void;
}) {
  const [preview, setPreview] = useState<QAFixPreview | null>(null);
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadPreview = async () => {
    setLoadingPreview(true);
    try {
      setPreview(await api.qaFixPreview());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load QA fix preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    void loadPreview();
  }, [qa?.generatedAt]);

  const applyFixes = async (ids?: string[]) => {
    await runAction(ids?.length === 1 ? 'Apply QA Fix' : 'Apply Safe QA Fixes', async () => {
      const result = await api.qaFixApply(ids);
      toast.info(
        result.applied
          ? `Applied ${result.applied} fixes in ${result.updatedFiles.length} files.`
          : 'No selected QA fixes were applied.',
      );
      const nextQa = await api.qa();
      const nextPreview = await api.qaFixPreview();
      setPreview(nextPreview);
      return nextQa;
    });
    refreshQa();
  };

  const ignoreIssue = (id: string) => {
    setIgnoredIds((current) => new Set([...current, id]));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Errors" value={qa?.counts.error || 0} description="Must fix before trusting ingest" />
        <MetricCard title="Warnings" value={qa?.counts.warning || 0} description="Review before keeping output" />
        <MetricCard title="Info" value={qa?.counts.info || 0} description="Quality and structure hints" />
      </div>
      <Card className="min-h-0">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>QA Fix Center</CardTitle>
            <CardDescription>
              {preview
                ? `${preview.fixableCount} safe fixes, ${preview.nonFixableCount} review-only findings`
                : qa?.generatedAt ? `Generated ${formatDate(qa.generatedAt)}` : 'No QA report loaded.'}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TooltipButton tooltip="Apply safe fixes" variant="outline" size="sm" disabled={busy || !preview?.fixableCount} onClick={() => void applyFixes()}>
              <WandSparklesIcon data-icon="inline-start" />
              Apply safe fixes
            </TooltipButton>
            <TooltipButton tooltip="Scan wiki" variant="outline" size="sm" disabled={busy} onClick={refreshQa}>
              <ShieldCheckIcon data-icon="inline-start" />
              Run QA
            </TooltipButton>
          </div>
        </CardHeader>
        <CardContent className="min-h-0">
          {loadingPreview ? (
            <Skeleton className="h-96" />
          ) : (
            <QAFixCenter
              preview={preview}
              ignoredIds={ignoredIds}
              busy={busy}
              onApply={(id) => void applyFixes([id])}
              onIgnore={ignoreIssue}
              onOpenFile={openWikiFile}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const qaFixTypeLabels: Record<string, string> = {
  'broken-links': 'Broken links',
  'prompt-leaks': 'Prompt leaks',
  source_file: 'source_file',
  'bad-slug': 'Bad slug',
  'source-tag-pollution': 'Source tag pollution',
  other: 'Other',
};

function QAFixCenter({
  preview,
  ignoredIds,
  busy,
  onApply,
  onIgnore,
  onOpenFile,
}: {
  preview: QAFixPreview | null;
  ignoredIds: Set<string>;
  busy: boolean;
  onApply: (id: string) => void;
  onIgnore: (id: string) => void;
  onOpenFile: (path: string) => void;
}) {
  if (!preview) return <EmptyLine text="No QA fix preview loaded." />;

  const entries = Object.entries(preview.groups) as Array<[keyof QAFixPreview['groups'], QAFixPreviewItem[]]>;

  return (
    <ScrollArea className="h-[calc(100vh-17rem)] rounded-md border">
      <div className="flex flex-col gap-3 p-3">
        {entries.map(([type, items]) => (
          <QAFixGroup
            key={type}
            title={qaFixTypeLabels[type] || type}
            items={items}
            ignoredIds={ignoredIds}
            busy={busy}
            onApply={onApply}
            onIgnore={onIgnore}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function QAFixGroup({
  title,
  items,
  ignoredIds,
  busy,
  onApply,
  onIgnore,
  onOpenFile,
}: {
  title: string;
  items: QAFixPreviewItem[];
  ignoredIds: Set<string>;
  busy: boolean;
  onApply: (id: string) => void;
  onIgnore: (id: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const visibleItems = items.filter((item) => !ignoredIds.has(item.id));
  const fixable = visibleItems.filter((item) => item.fixable).length;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium">{title}</div>
          <Badge variant={fixable ? 'secondary' : 'outline'}>{fixable} fixable</Badge>
        </div>
        <Badge variant="outline">{visibleItems.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {visibleItems.length ? visibleItems.map((item) => (
          <QAFixIssueRow
            key={item.id}
            item={item}
            busy={busy}
            onApply={onApply}
            onIgnore={onIgnore}
            onOpenFile={onOpenFile}
          />
        )) : <EmptyLine text="No findings in this group." />}
      </div>
    </div>
  );
}

function QAFixIssueRow({
  item,
  busy,
  onApply,
  onIgnore,
  onOpenFile,
}: {
  item: QAFixPreviewItem;
  busy: boolean;
  onApply: (id: string) => void;
  onIgnore: (id: string) => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <span className="truncate text-sm font-medium">{item.message}</span>
          </div>
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{item.file}{item.line ? `:${item.line}` : ''}</div>
          <div className="mt-2 text-xs text-muted-foreground">{item.proposedChange}</div>
          {item.explanation ? <div className="mt-1 text-xs text-muted-foreground">{item.explanation}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TooltipButton tooltip="Open file" variant="ghost" size="sm" onClick={() => onOpenFile(item.file)}>
            <BookOpenIcon data-icon="inline-start" />
            Open
          </TooltipButton>
          <TooltipButton tooltip="Ignore in UI" variant="ghost" size="sm" onClick={() => onIgnore(item.id)}>
            <XCircleIcon data-icon="inline-start" />
            Ignore
          </TooltipButton>
          <TooltipButton tooltip={item.fixable ? 'Apply fix' : 'Manual review required'} variant="outline" size="sm" disabled={busy || !item.fixable} onClick={() => onApply(item.id)}>
            <WandSparklesIcon data-icon="inline-start" />
            Apply
          </TooltipButton>
        </div>
      </div>
      {(item.beforeSnippet !== undefined || item.afterSnippet !== undefined) ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <SnippetPreview title="Before" value={item.beforeSnippet} />
          <SnippetPreview title="After" value={item.afterSnippet} />
        </div>
      ) : null}
    </div>
  );
}

function SnippetPreview({ title, value }: { title: string; value?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="mb-1 text-xs text-muted-foreground">{title}</div>
      <pre className="whitespace-pre-wrap break-words font-mono text-xs">{value || 'No text change preview.'}</pre>
    </div>
  );
}

function RunsView({
  runs,
  busy,
  runAction,
  cleanLastIngest,
  openDiffView,
  openWikiFile,
}: {
  runs: RunRecord[];
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  cleanLastIngest: () => Promise<CleanLastIngestResult>;
  openDiffView: () => void;
  openWikiFile: (path: string) => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState('');
  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0] || null;
  const completedRuns = runs.filter((run) => ['success', 'error', 'cancelled'].includes(run.status)).length;
  const staleRuns = runs.filter((run) => run.isStale && run.canCleanup);
  const totalCreated = runs.reduce((sum, run) => sum + run.counts.created, 0);
  const totalChanged = runs.reduce((sum, run) => sum + run.counts.changed, 0);

  useEffect(() => {
    if (!runs.length) {
      if (selectedRunId) setSelectedRunId('');
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  const openRun = (run: RunRecord) => {
    setSelectedRunId(run.id);
  };

  const openDiff = (run: RunRecord) => {
    setSelectedRunId(run.id);
    openDiffView();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Tracked Runs" value={runs.length} description={`${completedRuns} terminal bridge commands`} />
        <MetricCard title="Created Files" value={totalCreated} description="Files created across tracked runs" />
        <MetricCard title="Changed Files" value={totalChanged} description="Existing files changed by ingest" />
        <MetricCard title="Stale Runs" value={staleRuns.length} description={staleRuns.length ? 'Cleanup available' : 'No unfinished stale runs'} />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="h-full min-h-0 overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Ingest Runs</CardTitle>
              <CardDescription>Readable bridge history with source, duration, diff, and QA movement.</CardDescription>
            </div>
            <StaleRunsCleanupButton staleRuns={staleRuns} busy={busy} runAction={runAction} />
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <ScrollArea className="h-full rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>QA</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const response = asBridgeResponse(run.response);

                    return (
                      <TableRow
                        key={run.id}
                        data-state={run.id === selectedRun?.id ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <TableCell className="min-w-72">
                          <div className="truncate text-sm font-medium">{run.sourcePath || 'No source path'}</div>
                          <div className="truncate font-mono text-xs text-muted-foreground">{run.commandType} · {shortId(run.id)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <RunStatusBadge status={run.status} />
                            {run.isStale ? <Badge variant="destructive">stale</Badge> : null}
                            <RunProgressInline progress={response?.progress} compact />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">{formatDuration(run.durationMs)}</TableCell>
                        <TableCell><RunDiffBadges run={run} /></TableCell>
                        <TableCell><RunQaDelta run={run} /></TableCell>
                        <TableCell><QualityBadge quality={run.quality} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(run.modifiedAt)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                            <TooltipButton tooltip="Open run" variant="ghost" size="sm" onClick={() => openRun(run)}>
                              <BookOpenIcon data-icon="inline-start" />
                              Run
                            </TooltipButton>
                            <TooltipButton tooltip="Open source" variant="ghost" size="sm" disabled={!run.sourcePath} onClick={run.sourcePath ? () => openObsidianVaultPath(run.sourcePath) : undefined}>
                              <ExternalLinkIcon data-icon="inline-start" />
                              Source
                            </TooltipButton>
                            <TooltipButton tooltip="Open diff" variant="ghost" size="sm" disabled={!run.diff} onClick={() => openDiff(run)}>
                              <FileDiffIcon data-icon="inline-start" />
                              Diff
                            </TooltipButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <RunDetailPanel
          run={selectedRun}
          isLatest={Boolean(selectedRun && selectedRun.id === runs[0]?.id)}
          busy={busy}
          runAction={runAction}
          cleanLastIngest={cleanLastIngest}
          openWikiFile={openWikiFile}
        />
      </div>
    </div>
  );
}

function RunDetailPanel({
  run,
  isLatest,
  busy,
  runAction,
  cleanLastIngest,
  openWikiFile,
}: {
  run: RunRecord | null;
  isLatest: boolean;
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  cleanLastIngest: () => Promise<CleanLastIngestResult>;
  openWikiFile: (path: string) => void;
}) {
  if (!run) {
    return (
      <Card className="h-full min-h-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Run Detail</CardTitle>
          <CardDescription>Select a run to inspect ingest output.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyLine text="No runs tracked yet." />
        </CardContent>
      </Card>
    );
  }

  const created = run.diff?.created || [];
  const changed = run.diff?.changed || [];
  const deleted = run.diff?.deleted || [];
  const preserved = run.diff?.preserved || [];

  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{run.sourcePath || 'Run detail'}</CardTitle>
            <CardDescription className="truncate">{run.commandType} · {shortId(run.id)} · {formatDate(run.modifiedAt)}</CardDescription>
            {run.isStale && run.staleReason ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <AlertTriangleIcon />
                <span className="truncate">{run.staleReason}</span>
              </div>
            ) : null}
          </div>
          <RunStatusBadge status={run.status} />
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full pr-3">
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 md:grid-cols-3">
              <RunMiniStat label="Duration" value={formatDuration(run.durationMs)} />
              <RunMiniStat label="Mode" value={run.mode} />
              <RunMiniStat label="QA" value={qaShort(run.qaAfter)} />
              <RunMiniStat label="Quality" value={qualityShort(run.quality)} />
            </div>

            <QualityScorePanel run={run} />

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">QA before / after</div>
              <RunQaDelta run={run} verbose />
            </div>

            <RunFileList
              title="Created files"
              files={created}
              empty="No created files."
              review={run.review}
              busy={busy}
              onOpenFile={openWikiFile}
              onDeleteCreated={isLatest && created.length ? () => void cleanLastIngest() : undefined}
              onKeep={(paths) => void runAction('Keep Run Files', () => api.reviewRun(run.id, { action: 'keep', paths }))}
              onMarkReviewed={(paths) => void runAction('Mark Reviewed', () => api.reviewRun(run.id, { action: 'mark-reviewed', paths }))}
            />
            <RunFileList
              title="Changed files"
              files={changed}
              empty="No changed files."
              review={run.review}
              busy={busy}
              onOpenFile={openWikiFile}
              onKeep={(paths) => void runAction('Keep Run Files', () => api.reviewRun(run.id, { action: 'keep', paths }))}
              onMarkReviewed={(paths) => void runAction('Mark Reviewed', () => api.reviewRun(run.id, { action: 'mark-reviewed', paths }))}
            />
            <RunFileList
              title="Deleted files"
              files={deleted}
              empty="No deleted files."
              review={run.review}
              busy={busy}
              onKeep={(paths) => void runAction('Keep Run Files', () => api.reviewRun(run.id, { action: 'keep', paths }))}
              onMarkReviewed={(paths) => void runAction('Mark Reviewed', () => api.reviewRun(run.id, { action: 'mark-reviewed', paths }))}
            />
            <RunFileList
              title="Preserved files"
              files={preserved}
              empty="No preserved files."
              review={run.review}
              busy={busy}
              onOpenFile={openWikiFile}
              onKeep={(paths) => void runAction('Keep Run Files', () => api.reviewRun(run.id, { action: 'keep', paths }))}
              onMarkReviewed={(paths) => void runAction('Mark Reviewed', () => api.reviewRun(run.id, { action: 'mark-reviewed', paths }))}
            />

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Raw command</div>
              <JsonInline value={run.command} />
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Raw response</div>
              <JsonInline value={run.response} />
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

type DiffSectionKey = 'all' | 'created' | 'changed' | 'deleted' | 'preserved';
type ConcreteDiffSection = Exclude<DiffSectionKey, 'all'>;

interface DiffFileItem {
  path: string;
  section: ConcreteDiffSection;
}

function LastIngestDiffView({
  runs,
  busy,
  runAction,
  cleanLastIngest,
  openWikiFile,
}: {
  runs: RunRecord[];
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  cleanLastIngest: () => Promise<CleanLastIngestResult>;
  openWikiFile: (path: string) => void;
}) {
  const run = runs.find((item) => item.diff) || runs[0] || null;
  const [section, setSection] = useState<DiffSectionKey>('all');
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [preview, setPreview] = useState<RunDiffFileContent | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const allItems = useMemo(() => run ? buildDiffFileItems(run) : [], [run]);
  const filteredItems = allItems.filter((item) => {
    const sectionMatches = section === 'all' || item.section === section;
    const queryMatches = !query.trim() || item.path.toLowerCase().includes(query.trim().toLowerCase());
    return sectionMatches && queryMatches;
  });
  const selectedItem = filteredItems.find((item) => item.path === selectedPath) || filteredItems[0] || null;
  const selectedPaths = selectedItem ? [selectedItem.path] : [];

  useEffect(() => {
    if (!selectedItem) {
      if (selectedPath) setSelectedPath('');
      return;
    }

    if (selectedItem.path !== selectedPath) {
      setSelectedPath(selectedItem.path);
    }
  }, [selectedItem, selectedPath]);

  useEffect(() => {
    if (!run || !selectedItem) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    api.runDiffFile(run.id, selectedItem.path)
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Failed to load diff preview');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [run?.id, selectedItem?.path]);

  if (!run) {
    return (
      <Card className="min-h-0 flex-1">
        <CardHeader>
          <CardTitle>Last Ingest Diff</CardTitle>
          <CardDescription>No Lab runs found.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyLine text="Run an ingest from Wiki Lab to capture a diff." />
        </CardContent>
      </Card>
    );
  }

  const canRollback = run.id === runs[0]?.id && selectedItem?.section === 'created';

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[0.9fr_1.2fr]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">Last Ingest Diff</CardTitle>
              <CardDescription className="truncate">{run.sourcePath || 'No source path'} · {shortId(run.id)}</CardDescription>
            </div>
            <RunStatusBadge status={run.status} />
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <RunMiniStat label="Duration" value={formatDuration(run.durationMs)} />
            <RunMiniStat label="Mode" value={run.mode} />
            <RunMiniStat label="Started" value={run.startedAt ? formatDate(run.startedAt) : 'Pending'} />
            <RunMiniStat label="Finished" value={run.completedAt ? formatDate(run.completedAt) : 'Pending'} />
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-col gap-3">
          <div className="grid gap-2 md:grid-cols-[11rem_1fr]">
            <Select value={section} onValueChange={(value) => setSection(value as DiffSectionKey)}>
              <SelectTrigger>
                <SelectValue placeholder="Section" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All sections</SelectItem>
                  <SelectItem value="created">Created files</SelectItem>
                  <SelectItem value="changed">Changed files</SelectItem>
                  <SelectItem value="deleted">Deleted files</SelectItem>
                  <SelectItem value="preserved">Preserved files</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by path" />
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <DiffCount label="Created" value={run.counts.created} section="created" active={section} setSection={setSection} />
            <DiffCount label="Changed" value={run.counts.changed} section="changed" active={section} setSection={setSection} />
            <DiffCount label="Deleted" value={run.counts.deleted} section="deleted" active={section} setSection={setSection} />
            <DiffCount label="Preserved" value={run.diff?.preserved?.length || 0} section="preserved" active={section} setSection={setSection} />
          </div>

          <ScrollArea className="min-h-0 flex-1 rounded-md border">
            <div className="flex flex-col gap-1 p-2">
              {filteredItems.length ? filteredItems.map((item) => (
                <div
                  key={`${item.section}:${item.path}`}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 rounded-md p-2 hover:bg-muted/40',
                    selectedItem?.path === item.path && selectedItem.section === item.section && 'bg-muted',
                  )}
                  onClick={() => setSelectedPath(item.path)}
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">{item.path}</div>
                    <div className="mt-1 flex items-center gap-1">
                      <DiffSectionBadge section={item.section} />
                      {item.section === 'deleted' ? <Badge variant="destructive">missing now</Badge> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    {item.section !== 'deleted' ? (
                      <TooltipButton tooltip="Open file" variant="ghost" size="sm" onClick={() => openWikiFile(item.path)}>
                        <BookOpenIcon data-icon="inline-start" />
                        Open
                      </TooltipButton>
                    ) : null}
                    {item.section === 'created' && run.id === runs[0]?.id ? (
                      <TooltipButton tooltip="Rollback latest ingest" variant="ghost" size="sm" disabled={busy} onClick={() => void cleanLastIngest()}>
                        <Trash2Icon data-icon="inline-start" />
                        Delete created
                      </TooltipButton>
                    ) : null}
                  </div>
                </div>
              )) : <EmptyLine text="No files match this filter." />}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid min-h-0 gap-4 xl:grid-rows-[1fr_0.8fr]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{selectedItem?.path || 'File Preview'}</CardTitle>
              <CardDescription>
                {selectedItem ? `${selectedItem.section} · ${previewStateText(preview, selectedItem.section)}` : 'Select a file.'}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <TooltipButton tooltip="Keep file" variant="outline" size="sm" disabled={busy || !selectedPaths.length} onClick={() => void runAction('Keep Run File', () => api.reviewRun(run.id, { action: 'keep', paths: selectedPaths }))}>
                <CheckCircle2Icon data-icon="inline-start" />
                Keep
              </TooltipButton>
              <TooltipButton tooltip="Mark reviewed" variant="outline" size="sm" disabled={busy || !selectedPaths.length} onClick={() => void runAction('Mark Reviewed', () => api.reviewRun(run.id, { action: 'mark-reviewed', paths: selectedPaths }))}>
                <ShieldCheckIcon data-icon="inline-start" />
                Mark reviewed
              </TooltipButton>
              {canRollback ? (
                <TooltipButton tooltip="Rollback latest ingest" variant="outline" size="sm" disabled={busy} onClick={() => void cleanLastIngest()}>
                  <Trash2Icon data-icon="inline-start" />
                  Delete created
                </TooltipButton>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0">
            {previewLoading ? (
              <Skeleton className="h-full min-h-80" />
            ) : (
              <DiffPreview item={selectedItem} preview={preview} />
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <CardHeader>
            <CardTitle>QA Findings</CardTitle>
            <CardDescription>Grouped findings from the run's after snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0">
            <GroupedQaFindings report={run.qaAfter} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DiffCount({
  label,
  value,
  section,
  active,
  setSection,
}: {
  label: string;
  value: number;
  section: ConcreteDiffSection;
  active: DiffSectionKey;
  setSection: (section: DiffSectionKey) => void;
}) {
  return (
    <button
      type="button"
      className={cn('rounded-md border p-2 text-left hover:bg-muted/40', active === section && 'bg-muted')}
      onClick={() => setSection(active === section ? 'all' : section)}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </button>
  );
}

function DiffPreview({ item, preview }: { item: DiffFileItem | null; preview: RunDiffFileContent | null }) {
  if (!item) return <EmptyLine text="Select a diff file." />;
  if (!preview) return <EmptyLine text="No preview available." />;

  if (item.section === 'changed') {
    return (
      <div className="grid h-full min-h-80 gap-3 md:grid-cols-2">
        <MarkdownPane title="Before backup" content={preview.beforeContent} missingText="No backup content." />
        <MarkdownPane title="Current wiki" content={preview.afterContent} missingText="Current file is missing." />
      </div>
    );
  }

  if (item.section === 'deleted') {
    return <MarkdownPane title="Before backup" content={preview.beforeContent} missingText="No backup content for deleted file." />;
  }

  return <MarkdownPane title={item.section === 'created' ? 'Current wiki' : 'Markdown preview'} content={preview.afterContent} missingText="Current file is missing." />;
}

function MarkdownPane({ title, content, missingText }: { title: string; content: string | null; missingText: string }) {
  return (
    <div className="flex min-h-0 flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <Badge variant={content === null ? 'destructive' : 'outline'}>{content === null ? 'missing' : 'available'}</Badge>
      </div>
      {content === null ? (
        <EmptyLine text={missingText} />
      ) : (
        <ScrollArea className="h-full min-h-72 rounded-md border bg-muted/20">
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{content}</pre>
        </ScrollArea>
      )}
    </div>
  );
}

function GroupedQaFindings({ report }: { report?: QAReport | null }) {
  if (!report || !report.findings.length) return <EmptyLine text="No QA findings for this run." />;

  const groups: Array<QAFinding['severity']> = ['error', 'warning', 'info'];

  return (
    <ScrollArea className="h-full rounded-md border">
      <div className="flex flex-col gap-2 p-3">
        {groups.map((severity) => {
          const findings = report.findings.filter((finding) => finding.severity === severity);
          if (!findings.length) return null;

          return (
            <div key={severity} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <SeverityBadge severity={severity} />
                <Badge variant="outline">{findings.length}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {findings.slice(0, 8).map((finding) => <FindingRow key={`${finding.file}-${finding.line}-${finding.message}`} finding={finding} />)}
                {findings.length > 8 ? <div className="text-xs text-muted-foreground">+{findings.length - 8} more</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function buildDiffFileItems(run: RunRecord): DiffFileItem[] {
  const diff = run.diff;
  if (!diff) return [];

  return [
    ...toDiffFileItems(diff.created || [], 'created'),
    ...toDiffFileItems(diff.changed || [], 'changed'),
    ...toDiffFileItems(diff.deleted || [], 'deleted'),
    ...toDiffFileItems(diff.preserved || [], 'preserved'),
  ];
}

function toDiffFileItems(files: Array<{ path?: string }>, section: ConcreteDiffSection): DiffFileItem[] {
  return files
    .map((file) => file.path)
    .filter((path): path is string => Boolean(path))
    .map((path) => ({ path, section }));
}

function DiffSectionBadge({ section }: { section: ConcreteDiffSection }) {
  const variant = section === 'deleted' ? 'destructive' : section === 'preserved' ? 'outline' : 'secondary';
  return <Badge variant={variant}>{section}</Badge>;
}

function previewStateText(preview: RunDiffFileContent | null, section: ConcreteDiffSection) {
  if (!preview) return 'No preview loaded';
  if (section === 'changed') {
    if (preview.beforeExists && preview.afterExists) return 'before and current available';
    if (!preview.beforeExists && !preview.afterExists) return 'before and current missing';
    return preview.beforeExists ? 'current missing' : 'backup missing';
  }
  if (section === 'deleted') return preview.beforeExists ? 'deleted from current wiki' : 'deleted, backup missing';
  return preview.afterExists ? 'current file available' : 'current file missing';
}

function StaleRunsCleanupButton({
  staleRuns,
  busy,
  runAction,
}: {
  staleRuns: RunRecord[];
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const cleanup = () =>
    runAction('Clean Stale Runs', async () => {
      const result = await api.cleanupStaleRuns(staleRuns.map((run) => run.id));
      toast.info(
        result.deleted.length
          ? `Removed ${result.deleted.length} stale run records.`
          : 'No stale run records were removed.',
      );
      if (result.skipped.length) {
        toast.info(`${result.skipped.length} runs were skipped because they are no longer stale.`);
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <TooltipButton tooltip="Clean stale runs" variant="outline" size="sm" disabled={busy || !staleRuns.length} onClick={() => setOpen(true)}>
        <XCircleIcon data-icon="inline-start" />
        Clean stale
      </TooltipButton>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clean stale run records?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes unfinished Lab run metadata, queued command files, and stale response files. It does not delete or restore wiki markdown files.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 rounded-md border p-3">
          {staleRuns.slice(0, 6).map((run) => (
            <div key={run.id} className="min-w-0">
              <div className="truncate font-mono text-xs">{run.sourcePath || run.id}</div>
              <div className="truncate text-xs text-muted-foreground">{run.staleReason || 'Unfinished stale run.'}</div>
            </div>
          ))}
          {staleRuns.length > 6 ? (
            <div className="text-xs text-muted-foreground">+{staleRuns.length - 6} more stale runs</div>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              void cleanup();
            }}
          >
            Clean stale
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RunMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function RunDiffBadges({ run }: { run: RunRecord }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={run.counts.created ? 'secondary' : 'outline'}>+{run.counts.created}</Badge>
      <Badge variant={run.counts.changed ? 'secondary' : 'outline'}>~{run.counts.changed}</Badge>
      <Badge variant={run.counts.deleted ? 'destructive' : 'outline'}>-{run.counts.deleted}</Badge>
    </div>
  );
}

function RunQaDelta({ run, verbose = false }: { run: RunRecord; verbose?: boolean }) {
  const before = run.qaBefore?.counts || null;
  const after = run.qaAfter?.counts || null;

  if (!before && !after) return <span className="text-xs text-muted-foreground">No QA snapshot</span>;

  if (!before) {
    return <span className="text-xs text-muted-foreground">After: {qaShort(run.qaAfter)}</span>;
  }

  if (!after) {
    return <span className="text-xs text-muted-foreground">Before: {qaShort(run.qaBefore)}</span>;
  }

  const className = verbose ? 'grid gap-2 text-sm md:grid-cols-3' : 'flex flex-col gap-1 text-xs';

  return (
    <div className={className}>
      <QaCountDelta label="Errors" before={before.error} after={after.error} />
      <QaCountDelta label="Warnings" before={before.warning} after={after.warning} />
      <QaCountDelta label="Info" before={before.info} after={after.info} />
    </div>
  );
}

function QualityBadge({ quality }: { quality: RunRecord['quality'] }) {
  const label = qualityShort(quality);
  const variant = quality.riskLevel === 'high' ? 'destructive' : quality.riskLevel === 'medium' ? 'secondary' : 'outline';

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-xs text-muted-foreground">{quality.riskLevel} risk</span>
    </div>
  );
}

function QualityScorePanel({ run }: { run: RunRecord }) {
  const quality = run.quality;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Quality score</div>
          <div className="text-xs text-muted-foreground">Deterministic score from QA findings and affected files.</div>
        </div>
        <QualityBadge quality={quality} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ScoreMeter label="Content" value={quality.contentScore} reasons={quality.reasons.content} />
        <ScoreMeter label="Structure" value={quality.structureScore} reasons={quality.reasons.structure} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ReasonBlock title="Risk" items={quality.reasons.risk} />
        <ReasonBlock title="Actions" items={[...quality.reasons.actions, quality.llmReview.note]} />
      </div>
    </div>
  );
}

function ScoreMeter({ label, value, reasons }: { label: string; value: number | null; reasons: string[] }) {
  const normalized = value ?? 0;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-sm tabular-nums">{value === null ? 'n/a' : `${value}/100`}</span>
      </div>
      <Progress value={normalized} />
      <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {reasons.slice(0, 3).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}

function ReasonBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function QaCountDelta({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  const variant = delta > 0 ? 'destructive' : delta < 0 ? 'secondary' : 'outline';

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono tabular-nums">{before} → {after}</span>
        <Badge variant={variant}>{delta > 0 ? `+${delta}` : delta}</Badge>
      </div>
    </div>
  );
}

function RunFileList({
  title,
  files,
  empty,
  review,
  busy,
  onOpenFile,
  onDeleteCreated,
  onKeep,
  onMarkReviewed,
}: {
  title: string;
  files: Array<{ path?: string }>;
  empty: string;
  review?: RunRecord['review'];
  busy: boolean;
  onOpenFile?: (path: string) => void;
  onDeleteCreated?: () => void;
  onKeep: (paths: string[]) => void;
  onMarkReviewed: (paths: string[]) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const paths = files.map((file) => file.path).filter((path): path is string => Boolean(path));
  const keptPaths = new Set(review?.keptPaths || []);
  const reviewedPaths = new Set(review?.reviewedPaths || []);

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{files.length}</Badge>
          {onDeleteCreated ? (
            <TooltipButton tooltip="Rollback ingest" variant="outline" size="sm" disabled={busy} onClick={() => setDeleteOpen(true)}>
              <Trash2Icon data-icon="inline-start" />
              Rollback ingest
            </TooltipButton>
          ) : null}
          <TooltipButton tooltip="Keep files" variant="outline" size="sm" disabled={busy || !paths.length} onClick={() => onKeep(paths)}>
            <CheckCircle2Icon data-icon="inline-start" />
            Keep
          </TooltipButton>
          <TooltipButton tooltip="Mark reviewed" variant="outline" size="sm" disabled={busy || !paths.length} onClick={() => onMarkReviewed(paths)}>
            <ShieldCheckIcon data-icon="inline-start" />
            Mark reviewed
          </TooltipButton>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {files.length ? files.slice(0, 10).map((file, index) => (
          <div key={`${file.path || 'unknown'}-${index}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/40">
            <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {file.path || 'unknown path'}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {file.path && keptPaths.has(file.path) ? <Badge variant="secondary">kept</Badge> : null}
              {file.path && reviewedPaths.has(file.path) ? <Badge variant="secondary">reviewed</Badge> : null}
              {file.path && onOpenFile ? (
                <TooltipButton tooltip="Open file" variant="ghost" size="sm" onClick={() => onOpenFile(file.path || '')}>
                  <BookOpenIcon data-icon="inline-start" />
                  Open
                </TooltipButton>
              ) : null}
            </div>
          </div>
        )) : <EmptyLine text={empty} />}
        {files.length > 10 ? (
          <div className="text-xs text-muted-foreground">+{files.length - 10} more</div>
        ) : null}
      </div>
      {onDeleteCreated ? (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rollback the last ingest?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes files created by the latest tracked ingest and restores changed files from backup when their current hashes are safe.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setDeleteOpen(false);
                  onDeleteCreated();
                }}
              >
                Rollback ingest
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

function BridgeView({
  status,
  busyLabel,
  runAction,
}: {
  status: LabStatus | null;
  busyLabel: string;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  const queue = status?.bridge.queue || null;
  const staleItems = queue?.items.filter((item) => item.canClearStale) || [];
  const canCancelActive = Boolean(queue?.items.some((item) => item.canCancel));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <ActiveProgressPanel status={status} showWhenIdle />

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Bridge Status</CardTitle>
            <CardDescription>Obsidian plugin bridge writes runtime status into the vault.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StatusLine label="Enabled" ok={Boolean(status?.bridge.runtimeStatus?.enabled)} value={String(Boolean(status?.bridge.runtimeStatus?.enabled))} />
            <StatusLine label="Running" ok={Boolean(status?.bridge.runtimeStatus?.running)} value={String(Boolean(status?.bridge.runtimeStatus?.running))} />
            <StatusLine label="Busy" ok={!status?.bridge.runtimeStatus?.busy} value={String(Boolean(status?.bridge.runtimeStatus?.busy))} />
            <StatusLine label="Updated" ok={Boolean(status?.bridge.runtimeStatus?.updatedAt)} value={status?.bridge.runtimeStatus?.updatedAt ? formatDate(status.bridge.runtimeStatus.updatedAt) : 'Never'} />
            <StatusLine label="Last heartbeat" ok={Boolean(queue?.lastHeartbeatAt && !queue.disabledReason)} value={queue?.lastHeartbeatAt ? formatDate(queue.lastHeartbeatAt) : 'No heartbeat'} />
            <StatusLine label="Active age" ok={!queue?.activeCommandAgeMs || queue.activeCommandAgeMs <= queue.staleThresholdMs} value={formatDuration(queue?.activeCommandAgeMs ?? null)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plugin Build</CardTitle>
            <CardDescription>{status?.plugin.workflowMessage || 'Build, deploy, then reload Obsidian.'}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatusCard title="Fork Version" value={status?.plugin.forkVersion || 'Unknown'} ok={Boolean(status?.plugin.forkVersion)} />
              <StatusCard title="Installed Version" value={status?.plugin.installedVersion || 'Unknown'} ok={Boolean(status?.plugin.installed)} />
              <StatusCard title="Reload Needed" value={status?.plugin.reloadNeeded ? 'Yes' : 'No'} ok={!status?.plugin.reloadNeeded} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <HashLine label="Fork main.js" hash={status?.plugin.forkMainHash} />
              <HashLine label="Installed main.js" hash={status?.plugin.installedMainHash} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <StatusLine label="Hash match" ok={Boolean(status?.plugin.hashMatch)} value={status?.plugin.hashMatch ? 'Fork and installed plugin match' : 'Build + Deploy needed'} />
              <StatusLine label="Last build" ok={Boolean(status?.plugin.deploy.lastBuildAt)} value={deployTimeLabel(status?.plugin.deploy.lastBuildAt, status?.plugin.deploy.lastBuildExitCode)} />
              <StatusLine label="Last deploy" ok={Boolean(status?.plugin.deploy.lastDeployAt)} value={status?.plugin.deploy.lastDeployAt ? formatDate(status.plugin.deploy.lastDeployAt) : 'Never'} />
              <StatusLine label="Safe artifacts" ok={Boolean(status?.plugin.deploy.lastDeployFiles.length)} value={status?.plugin.deploy.lastDeployFiles.length ? status.plugin.deploy.lastDeployFiles.join(', ') : 'main.js, manifest.json, styles.css'} />
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Action order</div>
              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                <span>1. Build fork</span>
                <span>2. Deploy safe artifacts</span>
                <span>3. Reload Obsidian</span>
              </div>
            </div>

            <DeployLogPreview lines={status?.plugin.deploy.lastDeployLog || []} />

            <div className="flex flex-wrap gap-2">
              <TooltipButton tooltip="Build and copy artifacts" disabled={Boolean(busyLabel)} onClick={() => void runAction('Build + Deploy', () => api.buildDeploy())}>
                <HammerIcon data-icon="inline-start" />
                Build + Deploy
              </TooltipButton>
              <TooltipButton tooltip="Reload Obsidian" variant="outline" disabled={Boolean(busyLabel)} onClick={() => void runAction('Reload Obsidian', () => api.reloadObsidian())}>
                <RefreshCwIcon data-icon="inline-start" />
                Reload Obsidian
              </TooltipButton>
            </div>
          </CardContent>
        </Card>
      </div>

      <BridgeQueuePanel
        queue={queue}
        busy={Boolean(busyLabel)}
        staleItems={staleItems}
        canCancelActive={canCancelActive}
        runAction={runAction}
      />
    </div>
  );
}

function BridgeQueuePanel({
  queue,
  busy,
  staleItems,
  canCancelActive,
  runAction,
}: {
  queue: LabStatus['bridge']['queue'] | null;
  busy: boolean;
  staleItems: BridgeQueueItem[];
  canCancelActive: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  if (!queue) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bridge Queue</CardTitle>
          <CardDescription>No bridge queue status is available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Bridge Queue</CardTitle>
          <CardDescription>Pending, running, stale, failed, and completed bridge commands.</CardDescription>
        </div>
        <Badge variant={queue.disabledReason ? 'destructive' : 'secondary'}>
          {queue.disabledReason ? 'Attention' : 'Observable'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2 md:grid-cols-5">
          <QueueCount label="Pending" value={queue.counts.pending} />
          <QueueCount label="Running" value={queue.counts.running} />
          <QueueCount label="Stale" value={queue.counts.stale} />
          <QueueCount label="Failed" value={queue.counts.failed} />
          <QueueCount label="Done" value={queue.counts.done} />
        </div>

        {queue.warnings.length ? (
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertTriangleIcon />
              Bridge signals
            </div>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {queue.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <TooltipButton
            tooltip="Clear stale commands"
            variant="outline"
            disabled={busy || !staleItems.length}
            onClick={() => void runAction('Clear Stale Commands', () => api.clearStaleBridgeCommands(staleItems.map((item) => item.id)))}
          >
            <Trash2Icon data-icon="inline-start" />
            Clear stale
          </TooltipButton>
          <TooltipButton
            tooltip="Cancel active work"
            variant="outline"
            disabled={busy || !canCancelActive}
            onClick={() => void runAction('Cancel Active Work', () => api.cancelActiveBridgeWork())}
          >
            <XCircleIcon data-icon="inline-start" />
            Cancel active
          </TooltipButton>
        </div>

        <ScrollArea className="max-h-80 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Command</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Heartbeat</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.items.length ? queue.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-72">
                    <div className="truncate text-sm font-medium">{item.path || item.type}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{shortId(item.id)} · {item.type}</div>
                  </TableCell>
                  <TableCell><QueueStateBadge item={item} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDuration(item.ageMs)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.lastHeartbeatAt ? formatDate(item.lastHeartbeatAt) : 'None'}</TableCell>
                  <TableCell className="max-w-96 truncate text-xs text-muted-foreground">{item.reason}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyLine text="No bridge commands found." />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function QueueCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function QueueStateBadge({ item }: { item: BridgeQueueItem }) {
  const variant = item.state === 'failed' || item.state === 'stale'
    ? 'destructive'
    : item.state === 'running'
      ? 'secondary'
      : 'outline';
  return <Badge variant={variant}>{item.state}</Badge>;
}

function ActiveProgressPanel({
  status,
  showWhenIdle = false,
}: {
  status: LabStatus | null;
  showWhenIdle?: boolean;
}) {
  const runtime = status?.bridge.runtimeStatus;
  const progress = runtime?.progress || null;
  const activeCommand = runtime?.activeCommand || null;
  const busy = Boolean(runtime?.busy);
  const percent = progressPercent(progress);

  if (!showWhenIdle && !busy && !progress) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Bridge Progress</CardTitle>
          <CardDescription className="truncate">
            {activeCommand?.path || progress?.target || runtime?.message || 'No active command.'}
          </CardDescription>
        </div>
        <Badge variant={busy ? 'secondary' : 'outline'}>
          {busy ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : null}
          {busy ? 'Running' : 'Idle'}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{progress?.phase || runtime?.message || 'Waiting'}</div>
            <div className="truncate text-xs text-muted-foreground">{progress?.message || 'No progress event yet.'}</div>
          </div>
          {percent !== null ? (
            <div className="text-sm font-medium tabular-nums">{percent}%</div>
          ) : null}
        </div>

        {percent !== null ? (
          <Progress value={percent} />
        ) : (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
            {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            {busy ? 'Waiting for the next engine milestone.' : 'No active progress.'}
          </div>
        )}

        <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <div className="min-w-0 truncate">
            <span className="font-medium text-foreground">Command:</span>{' '}
            {activeCommand?.type || 'none'}
          </div>
          <div className="min-w-0 truncate">
            <span className="font-medium text-foreground">Run:</span>{' '}
            {activeCommand?.id || 'none'}
          </div>
          <div className="min-w-0 truncate">
            <span className="font-medium text-foreground">Updated:</span>{' '}
            {progress?.updatedAt ? formatDate(progress.updatedAt) : runtime?.updatedAt ? formatDate(runtime.updatedAt) : 'Never'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BridgeProgressBadge({ status }: { status: LabStatus | null }) {
  const runtime = status?.bridge.runtimeStatus;
  const progress = runtime?.progress || null;
  const busy = Boolean(runtime?.busy);
  const percent = progressPercent(progress);

  if (!busy && !progress) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className="hidden md:flex">
          {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
          {percent !== null ? `${percent}%` : 'Working'}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{progress?.message || runtime?.message || 'Bridge progress'}</TooltipContent>
    </Tooltip>
  );
}

function TooltipButton({
  tooltip,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  tooltip: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function CleanWikiButton({
  busy,
  runAction,
}: {
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <TooltipButton tooltip="Delete output" variant="destructive" disabled={busy} onClick={() => setOpen(true)}>
        <Trash2Icon data-icon="inline-start" />
        Clean Wiki
      </TooltipButton>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clean generated wiki output?</AlertDialogTitle>
          <AlertDialogDescription>
            This runs reset-wiki.ps1 with -Execute. Schema, required files, and llm-wiki-schema are preserved by the script.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
          I understand this deletes generated wiki pages.
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogAction disabled={!confirmed} onClick={() => void runAction('Clean Wiki', () => api.reset(true))}>
                Clean Wiki
              </AlertDialogAction>
            </TooltipTrigger>
            <TooltipContent>Run reset</TooltipContent>
          </Tooltip>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CleanLastIngestButton({
  busy,
  cleanLastIngest,
}: {
  busy: boolean;
  cleanLastIngest: () => Promise<CleanLastIngestResult>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [preview, setPreview] = useState<CleanLastIngestPreview | null>(null);
  const [lastResult, setLastResult] = useState<CleanLastIngestResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setConfirmed(false);
    setLastResult(null);
    setPreviewLoading(true);
    api.cleanLastIngestPreview()
      .then(setPreview)
      .catch((error) => {
        setPreview(null);
        toast.error(error instanceof Error ? error.message : 'Failed to load rollback preview');
      })
      .finally(() => setPreviewLoading(false));
  }, [open]);

  const applyRollback = async () => {
    const result = await cleanLastIngest();
    setLastResult(result);
    setConfirmed(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <TooltipButton tooltip="Preview rollback" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        <RotateCcwIcon data-icon="inline-start" />
        Clean Last Ingest
      </TooltipButton>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Clean only the last ingest?</AlertDialogTitle>
          <AlertDialogDescription>
            Preview the rollback before applying it. Created files can be deleted; changed files restore only when the current hash still matches the ingest output.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {previewLoading ? (
          <Skeleton className="h-56" />
        ) : preview ? (
          <RollbackPreviewPanel preview={preview} result={lastResult} />
        ) : (
          <EmptyLine text="No rollback preview available." />
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={confirmed} disabled={!preview} onCheckedChange={(value) => setConfirmed(value === true)} />
          I understand this deletes new files from the last ingest.
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogAction
                disabled={!confirmed || !preview || busy}
                onClick={(event) => {
                  event.preventDefault();
                  void applyRollback();
                }}
              >
                Clean Last Ingest
              </AlertDialogAction>
            </TooltipTrigger>
            <TooltipContent>Apply rollback</TooltipContent>
          </Tooltip>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RollbackPreviewPanel({
  preview,
  result,
}: {
  preview: CleanLastIngestPreview;
  result: CleanLastIngestResult | null;
}) {
  const skipped = result?.skipped || preview.skipped;
  const deleted = result?.deleted || preview.deleteCandidates;
  const restored = result?.restoredChanged || preview.restoreCandidates;

  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-hidden">
      <div className="grid gap-2 md:grid-cols-4">
        <RunMiniStat label="Run" value={shortId(preview.runId)} />
        <RunMiniStat label="Mode" value={preview.mode} />
        <RunMiniStat label={result ? 'Deleted' : 'Will delete'} value={String(deleted.length)} />
        <RunMiniStat label={result ? 'Restored' : 'Will restore'} value={String(restored.length)} />
      </div>
      <ScrollArea className="min-h-0 rounded-md border">
        <div className="flex flex-col gap-3 p-3">
          <RollbackPathGroup title={result ? 'Deleted files' : 'Will delete'} paths={deleted} empty="No created files to delete." />
          <RollbackPathGroup title={result ? 'Restored changed files' : 'Will restore'} paths={restored} empty="No changed files can be restored." />
          <RollbackSkipGroup skipped={skipped} result={Boolean(result)} />
          {preview.preservedChanged.length ? (
            <RollbackPathGroup title="Preserved changed files" paths={preview.preservedChanged} empty="No preserved changed files." />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function RollbackPathGroup({ title, paths, empty }: { title: string; paths: string[]; empty: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <Badge variant="outline">{paths.length}</Badge>
      </div>
      <div className="flex flex-col gap-1">
        {paths.length ? paths.slice(0, 12).map((path) => (
          <div key={path} className="truncate font-mono text-xs text-muted-foreground">{path}</div>
        )) : <EmptyLine text={empty} />}
        {paths.length > 12 ? <div className="text-xs text-muted-foreground">+{paths.length - 12} more</div> : null}
      </div>
    </div>
  );
}

function RollbackSkipGroup({ skipped, result }: { skipped: Array<{ path: string; reason: string }>; result: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{result ? 'Skipped during rollback' : 'Will skip'}</div>
        <Badge variant={skipped.length ? 'destructive' : 'outline'}>{skipped.length}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        {skipped.length ? skipped.slice(0, 12).map((item) => (
          <div key={`${item.path}:${item.reason}`} className="rounded-md bg-muted/40 p-2">
            <div className="truncate font-mono text-xs">{item.path}</div>
            <div className="text-xs text-muted-foreground">{item.reason}</div>
          </div>
        )) : <EmptyLine text="No skipped rollback items." />}
        {skipped.length > 12 ? <div className="text-xs text-muted-foreground">+{skipped.length - 12} more</div> : null}
      </div>
    </div>
  );
}

function IngestCommandButton({
  status,
  busy,
  runAction,
}: {
  status: LabStatus | null;
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('ingest-file');
  const [targetPath, setTargetPath] = useState('wiki-start/Personal/2026-06-18.md');
  const [granularity, setGranularity] = useState<IngestGranularity>('coarse');
  const [candidates, setCandidates] = useState<IngestCandidates | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const needsTarget = type === 'ingest-file' || type === 'ingest-folder';
  const needsGranularity = needsTarget;
  const targetCandidates = type === 'ingest-folder' ? candidates?.folders || [] : candidates?.files || [];
  const recentCandidates = type === 'ingest-file' ? candidates?.recent || [] : [];
  const recentCandidatePaths = new Set(recentCandidates.map((candidate) => candidate.path));
  const primaryCandidates = targetCandidates.filter((candidate) => !recentCandidatePaths.has(candidate.path));
  const selectedCandidate = targetCandidates.find((candidate) => candidate.path === targetPath) || null;
  const pathWarnings = needsTarget ? validateIngestPath(targetPath, type, selectedCandidate) : [];
  const bridgeRequirements = getBridgeRequirements(status);
  const canQueue = (!needsTarget || Boolean(targetPath.trim())) && pathWarnings.length === 0;

  useEffect(() => {
    if (!open || candidates || loadingCandidates) return;

    setLoadingCandidates(true);
    api.ingestCandidates()
      .then((nextCandidates) => {
        setCandidates(nextCandidates);
        const firstPath = nextCandidates.recent[0]?.path || nextCandidates.files[0]?.path || nextCandidates.folders[0]?.path;
        if (firstPath) setTargetPath(firstPath);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load ingest candidates'))
      .finally(() => setLoadingCandidates(false));
  }, [open, candidates, loadingCandidates]);

  useEffect(() => {
    if (!needsTarget || !candidates) return;
    const firstPath = (type === 'ingest-folder' ? candidates.folders[0] : candidates.recent[0] || candidates.files[0])?.path;
    if (firstPath) setTargetPath(firstPath);
  }, [type, candidates, needsTarget]);

  const submit = async () => {
    const command = await api.bridgeCommand({
      type,
      path: needsTarget ? targetPath : undefined,
      granularity: needsGranularity ? granularity : undefined,
    });
    toast.info(`Bridge command queued: ${command.id}`);
    setOpen(false);
    await pollBridgeCommand(command.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipButton tooltip="Queue ingest" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        <PlugZapIcon data-icon="inline-start" />
        Ingest
      </TooltipButton>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Queue bridge command</DialogTitle>
          <DialogDescription>Obsidian must be open and Lab Bridge enabled in plugin settings.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Command" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="ingest-file">Ingest file</SelectItem>
                <SelectItem value="ingest-folder">Ingest folder</SelectItem>
                <SelectItem value="lint-wiki">Lint wiki</SelectItem>
                <SelectItem value="regenerate-index">Regenerate index</SelectItem>
                <SelectItem value="cancel">Cancel active work</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {needsGranularity ? (
            <Select value={granularity} onValueChange={(value) => setGranularity(value as IngestGranularity)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Granularity" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="coarse">Coarse</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="fine">Fine</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          {needsTarget ? (
            <>
              <Select value={targetPath} onValueChange={setTargetPath} disabled={loadingCandidates || targetCandidates.length === 0}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingCandidates ? 'Loading notes...' : 'Select source'} />
                </SelectTrigger>
                <SelectContent>
                  {recentCandidates.length > 0 ? (
                    <SelectGroup>
                      {recentCandidates.map((candidate) => (
                        <SelectItem key={`recent:${candidate.path}`} value={candidate.path}>
                          {formatIngestCandidate(candidate)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null}
                  <SelectGroup>
                    {primaryCandidates.map((candidate) => (
                      <SelectItem key={candidate.path} value={candidate.path}>
                        {formatIngestCandidate(candidate)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input value={targetPath} onChange={(event) => setTargetPath(event.target.value)} placeholder="wiki-start/Personal/2026-06-18.md" />
            </>
          ) : null}
          <IngestPreviewPanel
            type={type}
            targetPath={needsTarget ? targetPath : undefined}
            granularity={needsGranularity ? granularity : undefined}
            candidate={selectedCandidate}
            warnings={pathWarnings}
            requirements={bridgeRequirements}
          />
        </div>
        <DialogFooter>
          <TooltipButton tooltip="Close dialog" variant="outline" onClick={() => setOpen(false)}>Cancel</TooltipButton>
          <TooltipButton tooltip="Queue command" disabled={!canQueue} onClick={() => void runActionFromDialog('Queue Command', submit, runAction)}>Queue</TooltipButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatIngestCandidate(candidate: IngestCandidate): string {
  const detail = candidate.kind === 'folder'
    ? `${candidate.markdownCount ?? 0} files`
    : candidate.root;
  return `${candidate.path} (${detail})`;
}

function IngestPreviewPanel({
  type,
  targetPath,
  granularity,
  candidate,
  warnings,
  requirements,
}: {
  type: string;
  targetPath?: string;
  granularity?: IngestGranularity;
  candidate: IngestCandidate | null;
  warnings: string[];
  requirements: Array<{ label: string; ok: boolean; value: string }>;
}) {
  const payload = {
    type,
    ...(targetPath ? { path: targetPath } : {}),
    ...(granularity ? { granularity } : {}),
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Command preview</div>
        {candidate ? <Badge variant="secondary">{candidate.root}</Badge> : <Badge variant="outline">manual path</Badge>}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {requirements.map((item) => (
          <div key={item.label} className="rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <Badge variant={item.ok ? 'secondary' : 'destructive'}>{item.ok ? 'OK' : 'Check'}</Badge>
            </div>
            <div className="mt-1 truncate text-xs">{item.value}</div>
          </div>
        ))}
      </div>
      <code className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{JSON.stringify(payload)}</code>
      {warnings.length ? (
        <div className="flex flex-col gap-1">
          {warnings.map((warning) => (
            <div key={warning} className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangleIcon />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Path is allowlisted and ready to queue.</div>
      )}
    </div>
  );
}

function getBridgeRequirements(status: LabStatus | null): Array<{ label: string; ok: boolean; value: string }> {
  const runtime = status?.bridge.runtimeStatus;
  const updatedAt = runtime?.updatedAt ? new Date(runtime.updatedAt).getTime() : 0;
  const fresh = updatedAt > 0 && Date.now() - updatedAt < 30_000;

  return [
    {
      label: 'Obsidian',
      ok: Boolean(runtime && fresh),
      value: runtime?.updatedAt ? `Seen ${formatDate(runtime.updatedAt)}` : 'No runtime status',
    },
    {
      label: 'Lab Bridge',
      ok: Boolean(runtime?.enabled),
      value: runtime?.enabled ? 'Enabled' : 'Disabled',
    },
    {
      label: 'Queue',
      ok: !runtime?.busy,
      value: runtime?.busy ? 'Busy' : 'Ready',
    },
  ];
}

function validateIngestPath(pathValue: string, type: string, candidate: IngestCandidate | null): string[] {
  const normalized = pathValue.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const lowered = normalized.toLowerCase();
  const warnings: string[] = [];

  if (!normalized) warnings.push('Select a source path.');
  if (/^[a-z]:/i.test(pathValue) || pathValue.startsWith('/') || pathValue.startsWith('\\\\')) warnings.push('Path must be vault-relative.');
  if (normalized.includes('../') || normalized === '..') warnings.push('Parent directory traversal is blocked.');
  if (lowered === '.obsidian' || lowered.startsWith('.obsidian/')) warnings.push('.obsidian is blocked.');
  if (lowered === '.llm-wiki-lab' || lowered.startsWith('.llm-wiki-lab/')) warnings.push('.llm-wiki-lab is blocked.');
  if (lowered === 'wiki' || lowered.startsWith('wiki/')) warnings.push('Generated wiki output is blocked as ingest input.');
  if (normalized && !lowered.startsWith('wiki-start/') && !lowered.startsWith('sources/')) warnings.push('Use an allowlisted source under wiki-start/ or sources/.');
  if (type === 'ingest-file' && candidate?.kind === 'folder') warnings.push('Selected target is a folder, but command is ingest-file.');
  if (type === 'ingest-folder' && candidate?.kind === 'file') warnings.push('Selected target is a file, but command is ingest-folder.');

  return [...new Set(warnings)];
}

async function runActionFromDialog(
  label: string,
  action: () => Promise<unknown>,
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>,
) {
  await runAction(label, action);
}

async function pollBridgeCommand(id: string) {
  for (let i = 0; i < 120; i += 1) {
    const payload = await api.bridgeCommandStatus(id);
    const response = payload.response as { status?: string; message?: string } | null;
    if (response && ['success', 'error', 'cancelled'].includes(String(response.status))) {
      if (response.status === 'success') toast.success(response.message || 'Bridge command complete');
      else toast.error(response.message || `Bridge command ${response.status}`);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
  toast.info('Bridge command still pending');
}

function MetricCard({ title, value, description }: { title: string; value: number; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusCard({ title, value, ok }: { title: string; value: string; ok: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm">{value}</div>
        <Badge variant={ok ? 'secondary' : 'destructive'}>{ok ? 'OK' : 'Check'}</Badge>
      </CardContent>
    </Card>
  );
}

function StatusLine({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm">{value}</span>
        {ok ? <CheckCircle2Icon /> : <AlertTriangleIcon />}
      </div>
    </div>
  );
}

function HashLine({ label, hash }: { label: string; hash?: string | null }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-sm">{shortHash(hash)}</div>
    </div>
  );
}

function DeployLogPreview({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Deploy log preview</div>
        <Badge variant="outline">{lines.length}</Badge>
      </div>
      <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
        {lines.length ? lines.join('\n') : 'No build/deploy log yet.'}
      </pre>
    </div>
  );
}

function StatusBadges({ status, loading }: { status: LabStatus | null; loading: boolean }) {
  if (loading && !status) return <Skeleton className="h-6 w-48" />;
  return (
    <div className="hidden items-center gap-2 md:flex">
      {status?.plugin.reloadNeeded ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive">Reload Needed</Badge>
          </TooltipTrigger>
          <TooltipContent>Deploy finished; reload Obsidian to load the new plugin.</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={status?.plugin.hashMatch ? 'secondary' : 'destructive'}>Hash Match</Badge>
        </TooltipTrigger>
        <TooltipContent>Fork main.js and installed plugin main.js</TooltipContent>
      </Tooltip>
      <Badge variant={status?.bridge.runtimeStatus?.enabled ? 'secondary' : 'outline'}>Bridge</Badge>
      <Badge variant={status?.resetScriptExists ? 'secondary' : 'destructive'}>Reset Script</Badge>
    </div>
  );
}

function RunStatusBadge({ status }: { status?: string }) {
  const value = status || 'queued';
  const variant = value === 'error'
    ? 'destructive'
    : value === 'running' || value === 'success'
      ? 'secondary'
      : 'outline';

  return <Badge variant={variant}>{value}</Badge>;
}

function RunProgressInline({ progress, compact = false }: { progress?: BridgeProgress | null; compact?: boolean }) {
  if (!progress) return <span className="text-xs text-muted-foreground">No progress</span>;

  const percent = progressPercent(progress);

  if (compact) {
    return (
      <span className="max-w-40 truncate text-xs text-muted-foreground">
        {percent !== null ? `${percent}% · ` : ''}{progress.phase || progress.message}
      </span>
    );
  }

  return (
    <div className="flex min-w-40 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="max-w-56 truncate">{progress.phase || progress.message}</span>
        {percent !== null ? <span className="tabular-nums text-muted-foreground">{percent}%</span> : null}
      </div>
      {percent !== null ? <Progress value={percent} /> : null}
    </div>
  );
}

function RecentFiles({ files }: { files: WikiFileInfo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Files</CardTitle>
        <CardDescription>Newest generated wiki files.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {files.slice(0, 8).map((file) => (
          <div key={file.path} className="flex items-center justify-between gap-3 rounded-md border p-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{file.title}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{file.path}</div>
            </div>
            <Badge variant="secondary">{file.type}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function FindingsPanel({
  findings,
  busy,
  onFixQa,
}: {
  findings: QAFinding[];
  busy?: boolean;
  onFixQa?: () => void;
}) {
  const topFindings = findings.slice(0, 8);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>QA Findings</CardTitle>
          <CardDescription>Highest-signal issues after the last scan.</CardDescription>
        </div>
        {onFixQa ? (
          <TooltipButton tooltip="Fix safe QA issues" variant="outline" size="sm" disabled={busy || !findings.length} onClick={onFixQa}>
            <WandSparklesIcon data-icon="inline-start" />
            Fix
          </TooltipButton>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {topFindings.length ? topFindings.map((finding) => <FindingRow key={`${finding.file}-${finding.line}-${finding.message}`} finding={finding} />) : <EmptyLine text="No findings." />}
      </CardContent>
    </Card>
  );
}

function FindingsTable({ findings }: { findings: QAFinding[] }) {
  return (
    <ScrollArea className="h-[calc(100vh-17rem)] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Suggested Fix</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {findings.map((finding) => (
            <TableRow key={`${finding.file}-${finding.line}-${finding.message}`}>
              <TableCell><SeverityBadge severity={finding.severity} /></TableCell>
              <TableCell className="max-w-[22rem] truncate font-mono text-xs">{finding.file}{finding.line ? `:${finding.line}` : ''}</TableCell>
              <TableCell>{finding.message}</TableCell>
              <TableCell className="text-muted-foreground">{finding.suggestedFix}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function FindingRow({ finding }: { finding: QAFinding }) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-2">
      <SeverityBadge severity={finding.severity} />
      <div className="min-w-0">
        <div className="truncate text-sm">{finding.message}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{finding.file}{finding.line ? `:${finding.line}` : ''}</div>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: QAFinding['severity'] }) {
  return (
    <Badge variant={severity === 'error' ? 'destructive' : severity === 'warning' ? 'secondary' : 'outline'}>
      {severity}
    </Badge>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{text}</div>;
}

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-32" />
      ))}
    </div>
  );
}

function JsonInline({ value }: { value: unknown }) {
  return <code className="line-clamp-3 text-xs text-muted-foreground">{JSON.stringify(value ?? null)}</code>;
}

function asBridgeResponse(value: unknown): { status?: string; message?: string; progress?: BridgeProgress | null } | null {
  if (!value || typeof value !== 'object') return null;
  const response = value as { status?: unknown; message?: unknown; progress?: unknown };

  return {
    status: typeof response.status === 'string' ? response.status : undefined,
    message: typeof response.message === 'string' ? response.message : undefined,
    progress: isBridgeProgress(response.progress) ? response.progress : null,
  };
}

function isBridgeProgress(value: unknown): value is BridgeProgress {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as BridgeProgress).message === 'string' &&
    typeof (value as BridgeProgress).phase === 'string',
  );
}

function progressPercent(progress?: BridgeProgress | null) {
  if (typeof progress?.percent !== 'number') return null;
  return Math.max(0, Math.min(100, Math.round(progress.percent)));
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function shortHash(value?: string | null) {
  return value ? value.slice(0, 12) : 'Missing';
}

function formatDuration(value: number | null) {
  if (typeof value !== 'number') return 'Pending';
  const totalSeconds = Math.max(0, Math.round(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function qaShort(report?: QAReport | null) {
  if (!report) return 'No QA';
  return `E${report.counts.error} W${report.counts.warning} I${report.counts.info}`;
}

function deployTimeLabel(value?: string | null, exitCode?: number | null) {
  if (!value) return 'Never';
  return `${formatDate(value)} · exit ${exitCode ?? 'unknown'}`;
}

function qualityShort(quality: RunRecord['quality']) {
  if (quality.contentScore === null || quality.structureScore === null) return 'No score';
  return `C${quality.contentScore} S${quality.structureScore}`;
}

function openObsidianVaultPath(path: string | null | undefined) {
  if (!path) return;
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  window.location.href = `obsidian://open?vault=Roadmap&file=${encodeURIComponent(normalized)}`;
}

function titleFor(view: ViewKey) {
  return navItems.find((item) => item.key === view)?.label || 'Wiki Lab';
}

function bridgeLabel(status: LabStatus | null) {
  if (!status?.bridge.runtimeStatus) return 'No runtime status';
  if (status.bridge.runtimeStatus.enabled) return status.bridge.runtimeStatus.busy ? 'Enabled, busy' : 'Enabled';
  return 'Disabled';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
