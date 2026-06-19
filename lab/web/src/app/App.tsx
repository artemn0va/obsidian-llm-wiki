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
} from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentProps, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import type { BridgeProgress, IngestCandidate, IngestCandidates, IngestGranularity, LabStatus, QAReport, QAFinding, RunRecord, WikiFileInfo } from './types';
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

type ViewKey = 'dashboard' | 'files' | 'qa' | 'runs' | 'bridge';

const navItems: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboardIcon }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { key: 'files', label: 'Wiki Files', icon: FileTextIcon },
  { key: 'qa', label: 'QA Report', icon: ShieldCheckIcon },
  { key: 'runs', label: 'Runs', icon: ActivityIcon },
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

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setBusyLabel(label);
    try {
      await action();
      toast.success(`${label} complete`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
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
                {activeView === 'qa' ? <QAView qa={qa} busy={Boolean(busyLabel)} refreshQa={() => runAction('Run QA', async () => setQa(await api.qa()))} fixQa={fixQa} /> : null}
                {activeView === 'runs' ? (
                  <RunsView
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
  cleanLastIngest: () => Promise<void>;
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
                <IngestCommandButton busy={Boolean(busyLabel)} runAction={runAction} />
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
  fixQa,
}: {
  qa: QAReport | null;
  busy: boolean;
  refreshQa: () => void;
  fixQa: () => Promise<void>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Errors" value={qa?.counts.error || 0} description="Must fix before trusting ingest" />
        <MetricCard title="Warnings" value={qa?.counts.warning || 0} description="Review before keeping output" />
        <MetricCard title="Info" value={qa?.counts.info || 0} description="Quality and structure hints" />
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>QA Findings</CardTitle>
            <CardDescription>{qa?.generatedAt ? `Generated ${formatDate(qa.generatedAt)}` : 'No QA report loaded.'}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <TooltipButton tooltip="Fix safe QA issues" variant="outline" size="sm" disabled={busy} onClick={() => void fixQa()}>
              <WandSparklesIcon data-icon="inline-start" />
              Fix QA
            </TooltipButton>
            <TooltipButton tooltip="Scan wiki" variant="outline" size="sm" disabled={busy} onClick={refreshQa}>
              <ShieldCheckIcon data-icon="inline-start" />
              Run QA
            </TooltipButton>
          </div>
        </CardHeader>
        <CardContent>
          <FindingsTable findings={qa?.findings || []} />
        </CardContent>
      </Card>
    </div>
  );
}

function RunsView({
  runs,
  busy,
  runAction,
  cleanLastIngest,
  openWikiFile,
}: {
  runs: RunRecord[];
  busy: boolean;
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>;
  cleanLastIngest: () => Promise<void>;
  openWikiFile: (path: string) => void;
}) {
  const [selectedRunId, setSelectedRunId] = useState('');
  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0] || null;
  const latestRun = runs[0] || null;
  const completedRuns = runs.filter((run) => ['success', 'error', 'cancelled'].includes(run.status)).length;
  const totalCreated = runs.reduce((sum, run) => sum + run.counts.created, 0);
  const totalChanged = runs.reduce((sum, run) => sum + run.counts.changed, 0);
  const latestQaErrors = latestRun?.qaAfter?.counts.error ?? 0;

  useEffect(() => {
    if (!runs.length) {
      if (selectedRunId) setSelectedRunId('');
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Tracked Runs" value={runs.length} description={`${completedRuns} terminal bridge commands`} />
        <MetricCard title="Created Files" value={totalCreated} description="Files created across tracked runs" />
        <MetricCard title="Changed Files" value={totalChanged} description="Existing files changed by ingest" />
        <MetricCard title="Latest QA Errors" value={latestQaErrors} description={latestRun ? latestRun.sourcePath || latestRun.id : 'No runs yet'} />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.35fr_0.95fr]">
        <Card className="h-full min-h-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Ingest Runs</CardTitle>
            <CardDescription>Readable bridge history with source, duration, diff, and QA movement.</CardDescription>
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
                    <TableHead>Updated</TableHead>
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
                            <RunProgressInline progress={response?.progress} compact />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">{formatDuration(run.durationMs)}</TableCell>
                        <TableCell><RunDiffBadges run={run} /></TableCell>
                        <TableCell><RunQaDelta run={run} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(run.modifiedAt)}</TableCell>
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
  cleanLastIngest: () => Promise<void>;
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
            </div>

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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plugin Build</CardTitle>
            <CardDescription>Build fork and copy safe plugin artifacts into the active vault.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <StatusCard title="Installed Version" value={status?.plugin.version || 'Unknown'} ok={Boolean(status?.plugin.installed)} />
              <StatusCard title="Hash Match" value={status?.plugin.hashMatch ? 'Matched' : 'Mismatch'} ok={Boolean(status?.plugin.hashMatch)} />
            </div>
            <TooltipButton tooltip="Install plugin" disabled={Boolean(busyLabel)} onClick={() => void runAction('Build + Deploy', () => api.buildDeploy())}>
              <HammerIcon data-icon="inline-start" />
              Build + Deploy
            </TooltipButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
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
  cleanLastIngest: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <TooltipButton tooltip="Delete last ingest files" variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        <RotateCcwIcon data-icon="inline-start" />
        Clean Last Ingest
      </TooltipButton>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clean only the last ingest?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes wiki markdown files created by the last Lab-tracked ingest and restores changed files from the pre-ingest backup when hashes are safe.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
          I understand this deletes new files from the last ingest.
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogAction disabled={!confirmed} onClick={() => void cleanLastIngest()}>
                Clean Last Ingest
              </AlertDialogAction>
            </TooltipTrigger>
            <TooltipContent>Delete last ingest</TooltipContent>
          </Tooltip>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function IngestCommandButton({
  busy,
  runAction,
}: {
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
        </div>
        <DialogFooter>
          <TooltipButton tooltip="Close dialog" variant="outline" onClick={() => setOpen(false)}>Cancel</TooltipButton>
          <TooltipButton tooltip="Queue command" disabled={needsTarget && !targetPath.trim()} onClick={() => void runActionFromDialog('Queue Command', submit, runAction)}>Queue</TooltipButton>
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

function StatusBadges({ status, loading }: { status: LabStatus | null; loading: boolean }) {
  if (loading && !status) return <Skeleton className="h-6 w-48" />;
  return (
    <div className="hidden items-center gap-2 md:flex">
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
