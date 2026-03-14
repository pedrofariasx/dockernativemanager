"use client";

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";
import { 
  getContainers, 
  startContainer,
  stopContainer,
  restartContainer,
  deleteContainer,
  createContainer,
  getContainerLogs,
  Container,
  execContainer,
  writeStdin
} from "@/lib/docker";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  Search,
  Terminal,
  Filter,
  SquareTerminal as CommandLine,
  RefreshCw,
  Eye,
  CheckSquare,
  MoreVertical,
  Copy,
  X,
  Download,
  Clipboard,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showSuccess, showError } from "@/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const Containers = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [logs, setLogs] = useState("");
  const [showTerminal, setShowTerminal] = useState(false);
  const [inspectData, setInspectData] = useState("");

  // Log specific states
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [wrapLines, setWrapLines] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [logTimeFilter, setLogTimeFilter] = useState("all"); // e.g., "all", "lastDay", "last4Hours", "lastHour", "last10Minutes"
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [logLineCount, setLogLineCount] = useState(1000); // 0 for all lines
  const [terminalShell, setTerminalShell] = useState<"sh" | "bash" | "ash">("sh");
  const [terminalUser, setTerminalUser] = useState("");
  const [terminalKey, setTerminalKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newPorts, setNewPorts] = useState("");
  const [newEnvs, setNewEnvs] = useState("");
  const [newVolumes, setNewVolumes] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Key to force log re-fetch when options change
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);

  const refreshContainers = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const data = await getContainers();
      setContainers(data);
    } catch (err) {
      if (manual) showError("Failed to fetch containers. Check Docker daemon.");
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshContainers();
    // Maintain a fallback interval just in case, but much slower
    const interval = setInterval(() => refreshContainers(false), 60000);
    return () => clearInterval(interval);
  }, [refreshContainers]);

  useDockerEvent("container", () => refreshContainers(false));

  const handleAction = async (action: (id: string) => Promise<unknown>, id: string, name: string) => {
    try {
      await action(id);
      showSuccess(`Action executed on ${name}`);
      refreshContainers();
    } catch (err) {
      showError(`Error performing action on ${name}`);
    }
  };

  const fetchLogs = useCallback(async (silent = false) => {
    if (!selectedContainer) return;

    if (!silent) setLogs("Loading logs...");
    let sinceTimestamp: number | null = null;
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    switch (logTimeFilter) {
      case "lastDay":
        sinceTimestamp = now - 24 * 60 * 60;
        break;
      case "last4Hours":
        sinceTimestamp = now - 4 * 60 * 60;
        break;
      case "lastHour":
        sinceTimestamp = now - 60 * 60;
        break;
      case "last10Minutes":
        sinceTimestamp = now - 10 * 60;
        break;
      case "all":
      default:
        sinceTimestamp = null;
        break;
    }

    try {
      const logData = await getContainerLogs(
        selectedContainer.id,
        showTimestamps,
        logLineCount === 0 ? null : logLineCount,
        sinceTimestamp
      );
      setLogs(logData || "");
    } catch (err) {
      setLogs(`Error loading logs: ${err}`);
    }
  }, [selectedContainer, showTimestamps, logLineCount, logTimeFilter]);

  const getVisibleLogs = useCallback(() => {
    if (!logSearchTerm) return logs;
    return logs.split('\n')
      .filter(line => line.toLowerCase().includes(logSearchTerm.toLowerCase()))
      .join('\n');
  }, [logs, logSearchTerm]);

  const openLogs = useCallback((container: Container) => {
    setSelectedContainer(container);
    setLogs("Loading logs...");
    setInspectData("");
    setShowTerminal(false);
    setLogsRefreshKey((prev) => prev + 1); // Trigger log re-fetch
  }, []);

  // Effect for fetching logs initially and on option changes
  useEffect(() => {
    if (selectedContainer && !showTerminal) {
      // If we're already loading or have content, fetch silently to avoid flickering settings
      const isInitial = logs === "Loading logs..." || logs === "";
      fetchLogs(!isInitial);
    }
  }, [fetchLogs, logsRefreshKey, selectedContainer, showTerminal]);

  // Effect for auto-refreshing logs
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (autoRefreshLogs && selectedContainer && !showTerminal) {
      intervalId = setInterval(() => fetchLogs(true), 3000); // Refresh every 3 seconds silently
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefreshLogs, selectedContainer, fetchLogs, showTerminal]);

  const openTerminal = (container: Container) => {
    setSelectedContainer(container);
    setShowTerminal(true);
    setLogs("");
    setInspectData("");
  };

  const openInspect = async (container: Container) => {
    setSelectedContainer(container);
    setInspectData("Loading inspection data...");
    setLogs("");
    setShowTerminal(false);
    try {
      const data = await (await import("@/lib/docker")).inspectContainer(container.id);
      setInspectData(data);
    } catch (err) {
      setInspectData("Error loading inspection data.");
    }
  };

  const handleDuplicate = async (container: Container) => {
    try {
      const data = await (await import("@/lib/docker")).inspectContainer(container.id);
      const config = JSON.parse(data);
      
      setNewName(`${container.name}-copy`);
      setNewImage(container.image);
      
      // Basic port mapping extraction from inspect
      if (config.HostConfig?.PortBindings) {
        const portsArr: string[] = [];
        Object.entries(config.HostConfig.PortBindings).forEach(([cPort, hostBindings]) => {
          const bindings = hostBindings as { HostPort: string }[] | null;
          if (bindings && bindings[0]) {
            portsArr.push(`${bindings[0].HostPort}:${cPort.split('/')[0]}`);
          }
        });
        setNewPorts(portsArr.join(", "));
      }

      setNewEnvs(config.Config?.Env?.join("\n") || "");
      setNewVolumes(config.HostConfig?.Binds?.join("\n") || "");
      
      setShowCreateDialog(true);
    } catch (err) {
      showError("Failed to duplicate container configuration");
    }
  };

  const handleCreate = async () => {
    if (!newImage) return;
    setIsCreating(true);
    try {
      const ports = newPorts.split(",").map(p => p.trim()).filter(p => p);
      const envs = newEnvs.split("\n").map(e => e.trim()).filter(e => e);
      const volumes = newVolumes.split("\n").map(v => v.trim()).filter(v => v);

      await createContainer(newName, newImage, ports, envs, volumes);
      showSuccess(`Container ${newName || newImage} created`);
      setShowCreateDialog(false);
      setNewName("");
      setNewImage("");
      setNewPorts("");
      setNewEnvs("");
      setNewVolumes("");
      refreshContainers();
    } catch (err) {
      showError(`Error creating container: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const filtered = containers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                          c.image.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(c => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async (action: (id: string) => Promise<unknown>, label: string) => {
    if (selectedIds.length === 0) return;
    
    const count = selectedIds.length;
    let successCount = 0;
    
    setIsRefreshing(true);
    for (const id of selectedIds) {
      try {
        await action(id);
        successCount++;
      } catch (err) {
        console.error(`Failed to ${label} container ${id}:`, err);
      }
    }
    setIsRefreshing(false);
    
    showSuccess(`${label} processed for ${successCount}/${count} containers`);
    setSelectedIds([]);
    refreshContainers();
  };

  return (
    <div className="h-full p-8">
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight">Containers</h2>
          <p className="text-muted-foreground mt-1">Manage your running and stopped Docker instances.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <div className="flex gap-2 animate-in fade-in slide-in-from-right-4">
              <Button
                variant="outline"
                size="sm"
                className="bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20"
                onClick={async () => handleBulkAction((await import("@/lib/docker")).startContainer, "Start")}
              >
                <Play className="w-4 h-4 mr-2" />
                Start ({selectedIds.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20"
                onClick={async () => handleBulkAction((await import("@/lib/docker")).stopContainer, "Stop")}
              >
                <Square className="w-4 h-4 mr-2" />
                Stop ({selectedIds.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20"
                onClick={async () => handleBulkAction((await import("@/lib/docker")).deleteContainer, "Delete")}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedIds.length})
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            className="bg-card border-border text-foreground"
            onClick={() => refreshContainers(true)}
            disabled={isRefreshing}
          >
            <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowCreateDialog(true)}>
            Create Container
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter containers by name or image..."
            className="bg-card border-border text-foreground pl-10 focus-visible:ring-blue-600 h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 h-11">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent text-foreground text-sm outline-none cursor-pointer h-full py-2 min-w-[120px]"
          >
            <option value="all" className="bg-background">All Status</option>
            <option value="running" className="bg-background">Running</option>
            <option value="exited" className="bg-background">Exited</option>
            <option value="paused" className="bg-background">Paused</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
        <Table>
          <TableHeader className="bg-card/80">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                  onCheckedChange={toggleSelectAll}
                  className="border-border data-[state=checked]:bg-blue-600"
                />
              </TableHead>
              <TableHead className="text-muted-foreground font-medium">Status</TableHead>
              <TableHead className="text-muted-foreground font-medium">Name</TableHead>
              <TableHead className="text-muted-foreground font-medium">Image</TableHead>
              <TableHead className="text-muted-foreground font-medium">Stats</TableHead>
              <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((container) => (
              <ContainerRow
                key={container.id}
                container={container}
                isSelected={selectedIds.includes(container.id)}
                onSelect={() => toggleSelect(container.id)}
                handleAction={handleAction}
                handleDuplicate={handleDuplicate}
                openLogs={openLogs}
                openTerminal={openTerminal}
                openInspect={openInspect}
              />
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No containers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedContainer} onOpenChange={(open) => {
        if (!open) {
          setSelectedContainer(null);
          setShowTerminal(false);
        }
      }}>
        <SheetContent side="right" className="w-[80%] sm:w-[80%] sm:max-w-none bg-background border-border text-foreground flex flex-col p-0 gap-0">
          <SheetHeader className="p-5 border-b border-border shrink-0">
            <SheetTitle className="text-foreground flex items-center gap-2">
              {showTerminal ? <CommandLine className="w-5 h-5 text-amber-500" /> : logs ? <Terminal className="w-5 h-5 text-blue-500" /> : <Eye className="w-5 h-5 text-emerald-500" />}
              {showTerminal ? "Terminal" : logs ? "Logs" : "Inspect"}: {selectedContainer?.name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              {showTerminal ? `Interactive shell for ${selectedContainer?.image}` : logs ? `Live container output from ${selectedContainer?.image}` : `Configuration details for ${selectedContainer?.id}`}
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-auto p-5 space-y-3">
            {showTerminal && selectedContainer ? (
              <div className="flex flex-col h-full space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                    {(["sh", "bash", "ash"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => { setTerminalShell(s); setTerminalKey((k) => k + 1); }}
                        className={`px-3 py-1 text-xs rounded font-mono transition-colors ${terminalShell === s ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="user (optional)"
                    value={terminalUser}
                    onChange={(e) => setTerminalUser(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") setTerminalKey((k) => k + 1); }}
                    className="h-8 text-xs w-36 bg-muted border-border"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setTerminalKey((k) => k + 1)}
                  >
                    Reconnect
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <TerminalComponent
                    key={terminalKey}
                    containerId={selectedContainer.id}
                    shell={terminalShell}
                    user={terminalUser}
                  />
                </div>
              </div>
            ) : logs ? (
              <div className="flex flex-col h-full">
                {/* Log Controls */}
                <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border mb-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-refresh-logs"
                      checked={autoRefreshLogs}
                      onCheckedChange={setAutoRefreshLogs}
                    />
                    <Label htmlFor="auto-refresh-logs" className="text-xs">Auto-refresh</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="wrap-lines"
                      checked={wrapLines}
                      onCheckedChange={setWrapLines}
                    />
                    <Label htmlFor="wrap-lines" className="text-xs">Wrap lines</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="show-timestamps"
                      checked={showTimestamps}
                      onCheckedChange={setShowTimestamps}
                    />
                    <Label htmlFor="show-timestamps" className="text-xs">Timestamps</Label>
                  </div>

                  <Select value={logTimeFilter} onValueChange={setLogTimeFilter}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue placeholder="Fetch" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="all">All logs</SelectItem>
                      <SelectItem value="lastDay">Last day</SelectItem>
                      <SelectItem value="last4Hours">Last 4 hours</SelectItem>
                      <SelectItem value="lastHour">Last hour</SelectItem>
                      <SelectItem value="last10Minutes">Last 10 minutes</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Search logs..."
                    className="h-8 w-[180px] text-xs bg-muted border-border"
                    value={logSearchTerm}
                    onChange={(e) => setLogSearchTerm(e.target.value)}
                  />

                  <Input
                    type="number"
                    placeholder="Lines"
                    className="h-8 w-[80px] text-xs bg-muted border-border"
                    value={logLineCount === 0 ? "" : logLineCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setLogLineCount(isNaN(val) ? 0 : val);
                    }}
                  />

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => setLogsRefreshKey(k => k + 1)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => {
                      if (!selectedContainer) return;
                      const visibleLogs = getVisibleLogs();
                      const element = document.createElement("a");
                      const file = new Blob([visibleLogs], { type: 'text/plain' });
                      element.href = URL.createObjectURL(file);
                      element.download = `${selectedContainer.name}-logs.txt`;
                      document.body.appendChild(element);
                      element.click();
                      document.body.removeChild(element);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => {
                      const visibleLogs = getVisibleLogs();
                      navigator.clipboard.writeText(visibleLogs);
                      showSuccess("Logs copied to clipboard");
                    }}
                  >
                    <Clipboard className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>

                {/* Logs Display */}
                <div className={cn(
                  "bg-card rounded-lg p-4 font-mono text-xs overflow-auto border border-border h-full",
                  wrapLines ? "whitespace-pre-wrap" : "whitespace-pre"
                )}>
                  {getVisibleLogs() || (logs === "Loading logs..." ? "Loading logs..." : "No logs available.")}
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-lg p-4 font-mono text-xs overflow-auto whitespace-pre-wrap border border-border h-full">
                {inspectData}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Create New Container</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="image">Image Name (required)</Label>
              <Input
                id="image"
                placeholder="e.g. nginx:latest"
                className="bg-card border-border text-foreground"
                value={newImage}
                onChange={(e) => setNewImage(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Container Name (optional)</Label>
              <Input
                id="name"
                placeholder="e.g. my-web-app"
                className="bg-card border-border text-foreground"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ports">Ports (comma separated)</Label>
              <Input
                id="ports"
                placeholder="e.g. 8080:80, 3000:3000"
                className="bg-card border-border text-foreground"
                value={newPorts}
                onChange={(e) => setNewPorts(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="envs">Environment Variables (one per line)</Label>
              <Textarea
                id="envs"
                placeholder="NODE_ENV=production&#10;API_KEY=secret"
                className="bg-card border-border text-foreground min-h-[80px]"
                value={newEnvs}
                onChange={(e) => setNewEnvs(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="volumes">Volumes (one per line, host:container)</Label>
              <Textarea
                id="volumes"
                placeholder="/path/on/host:/path/in/container"
                className="bg-card border-border text-foreground min-h-[80px]"
                value={newVolumes}
                onChange={(e) => setNewVolumes(e.target.value)}
                disabled={isCreating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-rose-900/50 text-rose-500 hover:bg-rose-950/30 hover:text-rose-400" onClick={() => setShowCreateDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleCreate} disabled={isCreating || !newImage}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
};

interface ContainerRowProps {
  container: Container;
  isSelected: boolean;
  onSelect: () => void;
  handleAction: (action: (id: string) => Promise<unknown>, id: string, name: string) => Promise<void>;
  handleDuplicate: (container: Container) => Promise<void>;
  openLogs: (container: Container) => void;
  openTerminal: (container: Container) => void;
  openInspect: (container: Container) => Promise<void>;
}

const ContainerRow = ({ container, isSelected, onSelect, handleAction, handleDuplicate, openLogs, openTerminal, openInspect }: ContainerRowProps) => {
  const [stats, setStats] = useState<{
    cpu_percent: number;
    memory_usage: number;
    memory_limit: number;
  } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (container.status === "running") {
      const setupStats = async () => {
        unlisten = await listen<{ cpu_percent: number; memory_usage: number; memory_limit: number }>(
          `container-stats-${container.id}`,
          (event) => {
            setStats(event.payload);
          }
        );
      };
      setupStats();
    } else {
      setStats(null);
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [container.status, container.id]);

  return (
    <TableRow className={cn(
      "border-border hover:bg-muted transition-colors group",
      isSelected && "bg-muted"
    )}>
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          className="border-border data-[state=checked]:bg-blue-600"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge className={cn(
            "capitalize px-2 py-0.5 text-[10px] font-semibold",
            container.status === "running" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted-500/10 text-muted-foreground border-muted-500/20"
          )}>
            {container.status}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">{container.state}</span>
        </div>
      </TableCell>
      <TableCell className="font-semibold text-foreground">{container.name}</TableCell>
      <TableCell className="text-muted-foreground text-xs font-mono">{container.image}</TableCell>
      <TableCell className="text-muted-foreground text-xs font-mono">
        {stats ? (
          <div className="flex flex-col gap-1">
            <span className="text-emerald-400">{stats.cpu_percent.toFixed(2)}% CPU</span>
            <span className="text-blue-400">{formatBytes(stats.memory_usage)} / {formatBytes(stats.memory_limit)} RAM</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
              <span className="sr-only">Open menu</span>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px] bg-card border-border">
            {container.status === "running" ? (
              <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={async () => handleAction((await import("@/lib/docker")).stopContainer, container.id, container.name)}>
                <Square className="mr-2 h-4 w-4 text-amber-500" />
                <span>Stop</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={async () => handleAction((await import("@/lib/docker")).startContainer, container.id, container.name)}>
                <Play className="mr-2 h-4 w-4 text-emerald-500" />
                <span>Start</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={async () => handleAction((await import("@/lib/docker")).restartContainer, container.id, container.name)}>
              <RefreshCw className="mr-2 h-4 w-4 text-blue-400" />
              <span>Restart</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openLogs(container)}>
              <Terminal className="mr-2 h-4 w-4 text-blue-500" />
              <span>Logs</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openTerminal(container)} disabled={container.status !== "running"}>
              <CommandLine className="mr-2 h-4 w-4 text-amber-500" />
              <span>Terminal</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openInspect(container)}>
              <Eye className="mr-2 h-4 w-4 text-emerald-500" />
              <span>Inspect</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleDuplicate(container)}>
              <Copy className="mr-2 h-4 w-4 text-blue-400" />
              <span>Duplicate/Edit</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => handleAction((await import("@/lib/docker")).deleteContainer, container.id, container.name)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

import { useRef } from "react";
import { useTheme } from "next-themes";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const SHELLS = ["sh", "bash", "ash"] as const;
type ShellType = typeof SHELLS[number];

const TerminalComponent = ({
  containerId,
  shell,
  user,
}: {
  containerId: string;
  shell: ShellType;
  user: string;
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = {
        background: resolvedTheme === "dark" ? "#09090b" : "#ffffff",
        foreground: resolvedTheme === "dark" ? "#f8fafc" : "#0f172a",
        cursor: "#3b82f6",
      };
    }
  }, [resolvedTheme]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: {
        background: resolvedTheme === "dark" ? "#09090b" : "#ffffff",
        foreground: resolvedTheme === "dark" ? "#f8fafc" : "#0f172a",
        cursor: "#3b82f6",
      },
      fontSize: 12,
      fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    term.writeln(`\x1b[34m[*] Connecting to container shell (${shell})...\x1b[0m`);

    // Send keystrokes to backend stdin
    const dataDispose = term.onData((data) => {
      writeStdin(containerId, data).catch(() => {});
    });

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<string>(`exec-output-${containerId}`, (event) => {
        term.write(event.payload);
      });

      try {
        await execContainer(containerId, shell, user || undefined);
      } catch (err) {
        term.writeln(`\r\n\x1b[31m[!] Error: ${err}\x1b[0m`);
      }
    };

    setup();

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      dataDispose.dispose();
      if (unlisten) unlisten();
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, [containerId, shell, user]);

  return (
    <div className="h-[460px] w-full bg-background rounded-lg overflow-hidden border border-border p-2">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
};

export default Containers;