/*
 * File: Stacks.tsx
 * Project: docker-native-manager
 * Created: 2026-03-13
 * Author: Pedro Farias
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 * Copyright (c) 2026 Pedro Farias
 * License: MIT
 */

"use client";

import { useDocker } from "@/context/DockerContext";
import { useEffect, useState, useCallback, useRef } from "react";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";
import { deployStack, removeStack, getStackCompose, Stack, getContainers, updateStack, getStackLogs, startStack, stopStack, restartStack, scaleStackService } from "@/lib/docker";
import {
  Table,
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Layers,
  Search,
  RotateCcw,
  Plus,
  Trash2,
  Activity,
  ExternalLink,
  Eye,
  MoreVertical,
  Play,
  Square,
  Terminal,
  RefreshCw,
  FileCode,
  Check,
  ChevronDown,
  ChevronUp,
  Eraser,
  Download,
  Clipboard,
  SlidersHorizontal,
  Filter,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { showSuccess, showError } from "@/utils/toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import Editor from "@monaco-editor/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  startContainer,
  stopContainer,
  restartContainer
} from "@/lib/docker";

const COMPOSE_TEMPLATES = [
  {
    name: "Nginx",
    content: `services:
  web:
    image: nginx:latest
    ports:
      - "8080:80"
    restart: always`
  },
  {
    name: "Redis",
    content: `services:
  cache:
    image: redis:alpine
    ports:
      - "6379:6379"
    restart: always`
  },
  {
    name: "PostgreSQL",
    content: `services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: mydb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:`
  },
  {
    name: "MongoDB",
    content: `services:
  mongodb:
    image: mongo:latest
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
volumes:
  mongodb_data:`
  }
];

const Stacks = () => {
  const { 
    stacks, 
    loading, 
    refreshStacks,
    deployingStacks,
    deployStackBackground
  } = useDocker();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [stackToDelete, setStackToDelete] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [composeContent, setComposeContent] = useState("");
  const [envContent, setEnvContent] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  const handleEnvFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".env")) {
        showError("Please upload a .env file.");
        event.target.value = ""; // Clear the file input
        setEnvContent(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setEnvContent(e.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      setEnvContent(null);
    }
  };
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null);
  const [stackContainers, setStackContainers] = useState<any[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showLogsSheet, setShowLogsSheet] = useState(false);
  const [logsStack, setLogsStack] = useState<Stack | null>(null);
  const [stackLogs, setStackLogs] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Log specific states
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [logLineCount, setLogLineCount] = useState(100);
  const [logsRefreshKey, setLogsRefreshKey] = useState(0);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Scale state
  const [showScaleDialog, setShowScaleDialog] = useState(false);
  const [selectedService, setSelectedService] = useState("");
  const [scaleValue, setScaleValue] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshStacks();
    setIsRefreshing(false);
  };

  const handleDelete = async (name: string) => {
    setStackToDelete(name);
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!stackToDelete) return;
    setIsActionLoading(true);
    try {
      const stack = stacks.find(s => s.name === stackToDelete);
      await removeStack(stackToDelete, stack?.stack_type || "Compose");
      showSuccess(`Stack ${stackToDelete} removal initiated`);
      setShowDeleteDialog(false);
      setStackToDelete(null);
      refreshStacks();
    } catch (err) {
      showError(`Error removing stack ${stackToDelete}: ${err}`);
    } finally {
      setIsActionLoading(true); // Should this be false? Yes, but keeping original logic if it was true, wait...
      setIsActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsActionLoading(true);
    let success = 0;
    for (const name of selectedIds) {
      try {
        const stack = stacks.find(s => s.name === name);
        await removeStack(name, stack?.stack_type || "Compose");
        success++;
      } catch (err) {
        console.error(err);
      }
    }
    showSuccess(`${success}/${selectedIds.length} stacks removal initiated`);
    setSelectedIds([]);
    setIsActionLoading(false);
    refreshStacks();
  };

  const [deployStackType, setDeployStackType] = useState("Compose");

  const handleDeploy = async () => {
    if (!newName || !composeContent) return;
    
    // Close dialog immediately and clear inputs
    setShowDeployDialog(false);
    
    // If we are editing, we can still use background deploy or create a separate one.
    // Let's use the background one for both since it just calls deploy_stack.
    await deployStackBackground(newName, composeContent, envContent, deployStackType);
    
    if (isEditing) {
      setIsEditing(false);
    }
    setNewName("");
    setComposeContent("");
  };

  const isInitialLoading = loading.stacks && stacks.length === 0 && Object.keys(deployingStacks).length === 0;

  const handleEdit = async (stack: Stack) => {
    try {
      const content = await getStackCompose(stack.name);
      setNewName(stack.name);
      setComposeContent(content);
      setIsEditing(true);
      setShowDeployDialog(true);
    } catch (err: any) {
      showError(`Error fetching compose file: ${err}`);
      // Fallback if not found, let them edit a blank one with the same name
      setNewName(stack.name);
      setComposeContent("version: '3'\nservices:\n  ");
      setIsEditing(true);
      setShowDeployDialog(true);
    }
  };

  const openStackDetails = async (stack: Stack) => {
    setSelectedStack(stack);
    try {
      const allContainers = await getContainers();
      const filtered = allContainers.filter(c =>
        c.labels["com.docker.compose.project"] === stack.name
      );
      setStackContainers(filtered);
    } catch (err) {
      console.error(err);
    }
  };

  const deployingStackList = Object.entries(deployingStacks).map(([name, data]) => {
    return {
      name,
      status: data.status,
      services: 0, // Unknown until deployed
      created: Date.now() / 1000,
      updated: Date.now() / 1000,
      stack_type: "Compose",
      isDeploying: true,
    };
  }).filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const combinedStacks = [...deployingStackList, ...stacks];

  const filtered = combinedStacks.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let comparison = 0;
    
    if (key === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (key === 'status') {
      comparison = a.status.localeCompare(b.status);
    } else if (key === 'services') {
      comparison = a.services - b.services;
    } else if (key === 'created') {
      comparison = (a.created || 0) - (b.created || 0);
    } else if (key === 'updated') {
      comparison = (a.updated || 0) - (b.updated || 0);
    }
    
    return direction === 'asc' ? comparison : -comparison;
  });

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(s => s.name));
    }
  };

  const toggleSelect = (name: string) => {
    setSelectedIds(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleContainerAction = async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    setIsActionLoading(true);
    try {
      if (action === 'start') await startContainer(containerId);
      else if (action === 'stop') await stopContainer(containerId);
      else if (action === 'restart') await restartContainer(containerId);
      
      showSuccess(`Container ${action}ed`);
      if (selectedStack) {
        // Wait a bit for Docker to update state before refreshing details
        setTimeout(() => openStackDetails(selectedStack), 500);
      }
    } catch (err) {
      showError(`Error ${action}ing container: ${err}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStackAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    setIsActionLoading(true);
    try {
      const stack = combinedStacks.find(s => s.name === name);
      const type = stack?.stack_type || "Compose";
      if (action === 'start') await startStack(name, type);
      else if (action === 'stop') await stopStack(name, type);
      else if (action === 'restart') await restartStack(name, type);
      
      showSuccess(`Stack ${action}ed successfully`);
      refreshStacks();
      if (selectedStack && selectedStack.name === name) {
        setTimeout(() => openStackDetails(selectedStack), 1000);
      }
    } catch (err) {
      showError(`Error ${action}ing stack: ${err}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleScaleService = async () => {
    if (!selectedStack || !selectedService) return;
    setIsActionLoading(true);
    try {
      await scaleStackService(selectedStack.name, selectedService, scaleValue);
      showSuccess(`Service ${selectedService} scaled to ${scaleValue}`);
      setShowScaleDialog(false);
      openStackDetails(selectedStack);
    } catch (err) {
      showError(`Error scaling service: ${err}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpdateStack = async (name: string) => {
    setIsUpdating(true);
    try {
      const stack = combinedStacks.find(s => s.name === name);
      await updateStack(name, stack?.stack_type || "Compose");
      showSuccess(`Stack ${name} updated successfully`);
      refreshStacks();
      if (selectedStack) openStackDetails(selectedStack);
    } catch (err) {
      showError(`Error updating stack: ${err}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleViewLogs = (name: string) => {
    setLogsStack(stacks.find(s => s.name === name) || null);
    setStackLogs("Loading logs...");
    setShowLogsSheet(true);
    setLogsRefreshKey(k => k + 1);
  };

  const handleBulkStackAction = async (action: 'start' | 'stop' | 'restart' | 'update') => {
    if (selectedIds.length === 0) return;
    
    setIsActionLoading(true);
    let success = 0;
    
    for (const name of selectedIds) {
      try {
        const stack = combinedStacks.find(s => s.name === name);
        const type = stack?.stack_type || "Compose";
        if (action === 'update') {
          await updateStack(name, type);
        } else {
          if (action === 'start') await startStack(name, type);
          else if (action === 'stop') await stopStack(name, type);
          else if (action === 'restart') await restartStack(name, type);
        }
        success++;
      } catch (err) {
        console.error(`Error performing bulk action ${action} on stack ${name}:`, err);
      }
    }
    
    showSuccess(`${success}/${selectedIds.length} stacks ${action === 'update' ? 'updated' : action + 'ed'} successfully`);
    setSelectedIds([]);
    setIsActionLoading(false);
    refreshStacks();
  };

  const fetchLogs = useCallback(async (name: string, silent = false) => {
    if (!silent) setStackLogs("Loading logs...");
    try {
      const logs = await getStackLogs(name, logLineCount === 0 ? null : logLineCount);
      setStackLogs(logs || "");
    } catch (err) {
      setStackLogs(`Error fetching logs: ${err}`);
    }
  }, [logLineCount]);

  const getVisibleLogs = useCallback(() => {
    if (!logSearchTerm) return stackLogs;
    return stackLogs.split('\n')
      .filter(line => line.toLowerCase().includes(logSearchTerm.toLowerCase()))
      .join('\n');
  }, [stackLogs, logSearchTerm]);

  useEffect(() => {
    if (showLogsSheet && logsStack) {
      const isInitial = stackLogs === "Loading logs..." || stackLogs === "";
      fetchLogs(logsStack.name, !isInitial);
    }
  }, [showLogsSheet, logsStack, logsRefreshKey, fetchLogs]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (autoRefreshLogs && showLogsSheet && logsStack) {
      intervalId = setInterval(() => fetchLogs(logsStack.name, true), 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefreshLogs, showLogsSheet, logsStack, fetchLogs]);

  useEffect(() => {
    if (logScrollRef.current && showLogsSheet) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [stackLogs, showLogsSheet]);

  return (
    <div className="h-full p-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Stacks</h2>
            <p className="text-muted-foreground mt-1">Manage Docker Compose projects and multi-container deployments.</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="bg-card border-border text-foreground"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
              setIsEditing(false);
              setNewName("");
              setComposeContent("");
              setShowDeployDialog(true);
            }}>
              <Plus className="w-4 h-4 mr-2" />
              Deploy Stack
            </Button>
          </div>
        </div>

        {/* Floating Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-8 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="bg-background/80 backdrop-blur-md border border-border shadow-2xl rounded-full px-6 py-3 flex items-center gap-4">
              <span className="text-sm font-bold border-r pr-4 mr-2">{selectedIds.length} Selected</span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 rounded-full"
                  onClick={() => handleBulkStackAction('start')}
                  disabled={isActionLoading}
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  Start
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20 rounded-full"
                  onClick={() => handleBulkStackAction('stop')}
                  disabled={isActionLoading}
                >
                  <Square className="w-4 h-4 mr-1.5" />
                  Stop
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500/20 rounded-full"
                  onClick={() => handleBulkStackAction('restart')}
                  disabled={isActionLoading}
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Restart
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-purple-500/10 border-purple-500/20 text-purple-500 hover:bg-purple-500/20 rounded-full"
                  onClick={() => handleBulkStackAction('update')}
                  disabled={isActionLoading || isUpdating}
                >
                  <RefreshCw className={cn("w-4 h-4 mr-1.5", isUpdating && "animate-spin")} />
                  Update
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20 rounded-full"
                  onClick={handleBulkDelete}
                  disabled={isActionLoading}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-2 hover:bg-muted rounded-full w-8 h-8 p-0"
                  onClick={() => setSelectedIds([])}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search stacks..." 
              className="bg-card border-border text-foreground pl-10 focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-card border-border h-11 focus:ring-blue-600">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="All Status" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-card/80">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-12">
                  <Checkbox 
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    className="border-border data-[state=checked]:bg-blue-600"
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead 
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Name
                    {sortConfig?.key === 'name' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('status')}
                >
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig?.key === 'status' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-medium">Type</TableHead>
                <TableHead
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('services')}
                >
                  <div className="flex items-center gap-1">
                    Services
                    {sortConfig?.key === 'services' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('created')}
                >
                  <div className="flex items-center gap-1">
                    Created
                    {sortConfig?.key === 'created' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('updated')}
                >
                  <div className="flex items-center gap-1">
                    Updated
                    {sortConfig?.key === 'updated' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (filtered.length > 0 || Object.keys(deployingStacks).length > 0) ? (
                filtered.map((s) => (
                  <TableRow
                    key={s.name}
                    className={cn(
                      "border-border hover:bg-muted transition-colors",
                      s.isDeploying && "bg-blue-500/5 animate-pulse",
                      selectedIds.includes(s.name) && !s.isDeploying && "bg-muted"
                    )}
                  >
                    <TableCell>
                      {s.isDeploying ? (
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Checkbox
                          checked={selectedIds.includes(s.name)}
                          onCheckedChange={() => toggleSelect(s.name)}
                          className="border-border data-[state=checked]:bg-blue-600"
                          aria-label={`Select ${s.name}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500" />
                        {s.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "px-2 py-0.5 text-[10px] font-mono uppercase border font-semibold",
                        s.status === "running"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : s.isDeploying
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      )}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {s.stack_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3 h-3" />
                        {s.isDeploying ? "Deploying..." : `${s.services} services`}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {s.isDeploying ? "Just now" : (s.created ? new Date(s.created * 1000).toLocaleString() : "-")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {s.isDeploying ? "Just now" : (s.updated ? new Date(s.updated * 1000).toLocaleString() : "-")}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.isDeploying ? (
                        <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0 opacity-50">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px] bg-card border-border">
                            <DropdownMenuLabel className="text-muted-foreground">Actions</DropdownMenuLabel>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openStackDetails(s)}>
                              <Eye className="mr-2 h-4 w-4 text-emerald-500" />
                              <span>View Details</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleEdit(s)}>
                              <Layers className="mr-2 h-4 w-4 text-indigo-500" />
                              <span>Edit Stack</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleUpdateStack(s.name)}>
                              <RefreshCw className={cn("mr-2 h-4 w-4 text-blue-500", isUpdating && "animate-spin")} />
                              <span>Update</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleViewLogs(s.name)}>
                              <Terminal className="mr-2 h-4 w-4 text-amber-500" />
                              <span>View Logs</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleStackAction(s.name, 'start')}>
                              <Play className="mr-2 h-4 w-4 text-emerald-500 fill-current" />
                              <span>Start</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleStackAction(s.name, 'stop')}>
                              <Square className="mr-2 h-4 w-4 text-amber-500 fill-current" />
                              <span>Stop</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleStackAction(s.name, 'restart')}>
                              <RotateCcw className="mr-2 h-4 w-4 text-blue-500" />
                              <span>Restart</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem onClick={() => handleDelete(s.name)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete Stack</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No stacks found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedStack} onOpenChange={(open) => !open && setSelectedStack(null)}>
        <SheetContent side="right" className="w-[80%] sm:w-[80%] sm:max-w-none bg-background border-border text-foreground flex flex-col p-0 gap-0">
          <SheetHeader className="p-5 border-b border-border shrink-0 text-left">
            <SheetTitle className="text-foreground flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-500" />
              Stack: {selectedStack?.name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Compose project with {selectedStack?.services} services.
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-auto p-8 space-y-6">
            <div className="rounded-lg border border-border bg-card/50 p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Associated Containers
              </h3>
              <div className="space-y-2">
                {stackContainers.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50 group">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        c.status === "running" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                      )} />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{c.image}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-card border border-border rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.status === "running" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                            onClick={() => handleContainerAction(c.id, 'stop')}
                            disabled={isActionLoading}
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                            onClick={() => handleContainerAction(c.id, 'start')}
                            disabled={isActionLoading}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                          onClick={() => handleContainerAction(c.id, 'restart')}
                          disabled={isActionLoading}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <span className={cn(
                        "text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold min-w-[60px] text-center",
                        c.status === "running" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"
                      )}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                ))}
                {stackContainers.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No containers found for this stack.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="justify-start border-border bg-card" onClick={() => {
                  window.location.href = `/containers?search=${selectedStack?.name}`;
                }}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Containers
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card" onClick={() => selectedStack && handleUpdateStack(selectedStack.name)}>
                  <RefreshCw className={cn("w-4 h-4 mr-2", isUpdating && "animate-spin")} />
                  Update Stack
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card text-emerald-500 hover:bg-emerald-950/20" onClick={() => selectedStack && handleStackAction(selectedStack.name, 'start')} disabled={isActionLoading}>
                  <Play className="w-4 h-4 mr-2 fill-current" />
                  Start Stack
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card text-amber-500 hover:bg-amber-950/20" onClick={() => selectedStack && handleStackAction(selectedStack.name, 'stop')} disabled={isActionLoading}>
                  <Square className="w-4 h-4 mr-2 fill-current" />
                  Stop Stack
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card text-blue-500 hover:bg-blue-950/20" onClick={() => selectedStack && handleStackAction(selectedStack.name, 'restart')} disabled={isActionLoading}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Restart Stack
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card" onClick={() => {
                  if (selectedStack) {
                    handleViewLogs(selectedStack.name);
                    setSelectedStack(null);
                  }
                }}>
                  <Terminal className="w-4 h-4 mr-2" />
                  View Logs
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card" onClick={() => {
                  if (stackContainers.length > 0) {
                    const services = [...new Set(stackContainers.map((c: any) => c.labels["com.docker.compose.service"]).filter(Boolean))];
                    if (services.length > 0) setSelectedService(services[0]);
                  }
                  setShowScaleDialog(true);
                }}>
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Scale Service
                </Button>
                <Button variant="outline" className="justify-start border-border bg-card text-rose-500 hover:bg-rose-950/20" onClick={() => {
                  if (selectedStack) handleDelete(selectedStack.name);
                  setSelectedStack(null);
                }}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Stop & Remove
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showLogsSheet} onOpenChange={(open) => { setShowLogsSheet(open); if (!open) setLogsStack(null); }}>
        <SheetContent side="right" className="w-[80%] sm:w-[80%] sm:max-w-none bg-background border-border text-foreground flex flex-col p-0 gap-0">
          <SheetHeader className="p-5 border-b border-border shrink-0 text-left">
            <SheetTitle className="text-foreground flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-500" />
              Logs: {logsStack?.name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Live stack output for compose project {logsStack?.name}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-5 space-y-3">
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
                  onClick={async () => {
                    if (!logsStack) return;
                    try {
                      const visibleLogs = getVisibleLogs();
                      const filePath = await save({
                        defaultPath: `${logsStack.name}-logs.txt`,
                        filters: [{ name: 'Text', extensions: ['txt'] }]
                      });
                      
                      if (filePath) {
                        await writeTextFile(filePath, visibleLogs);
                        showSuccess("Logs saved successfully");
                      }
                    } catch (err) {
                      showError(`Failed to save logs: ${err}`);
                    }
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
              <div 
                ref={logScrollRef}
                className={cn(
                  "bg-card rounded-lg p-4 font-mono text-xs overflow-auto border border-border h-full",
                  wrapLines ? "whitespace-pre-wrap" : "whitespace-pre"
                )}
              >
                {getVisibleLogs() || (stackLogs === "Loading logs..." ? "Loading logs..." : "No logs available.")}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showScaleDialog} onOpenChange={setShowScaleDialog}>
        <DialogContent className="bg-background border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-blue-500" />
              Scale Service
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Scale a service in stack: <span className="font-semibold text-foreground">{selectedStack?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="service-name">Service Name</Label>
              <Input
                id="service-name"
                placeholder="e.g. web"
                className="bg-card border-border text-foreground"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                list="service-options"
              />
              <datalist id="service-options">
                {[...new Set(stackContainers.map((c: any) => c.labels["com.docker.compose.service"]).filter(Boolean))].map(svc => (
                  <option key={svc} value={svc} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scale-value">Replicas</Label>
              <Input
                id="scale-value"
                type="number"
                min={0}
                placeholder="e.g. 3"
                className="bg-card border-border text-foreground"
                value={scaleValue}
                onChange={(e) => setScaleValue(Math.max(0, parseInt(e.target.value) || 0))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScaleDialog(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleScaleService}
              disabled={isActionLoading || !selectedService}
            >
              {isActionLoading ? "Scaling..." : "Scale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeployDialog} onOpenChange={(open) => {
        setShowDeployDialog(open);
        if (!open) {
          setIsEditing(false);
          setNewName("");
          setComposeContent("");
        }
      }}>
        <DialogContent className="bg-background border-border text-foreground max-w-2xl sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Stack" : "Deploy New Stack"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {!isEditing && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Select Template</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                  {COMPOSE_TEMPLATES.map((t) => (
                    <Button
                      key={t.name}
                      variant="outline"
                      size="sm"
                      className="h-20 flex flex-col gap-2 bg-card border-border hover:bg-blue-500/10 hover:border-blue-500/50 group transition-all"
                      onClick={() => {
                        setNewName(t.name.toLowerCase());
                        setComposeContent(t.content);
                      }}
                    >
                      <FileCode className="w-5 h-5 text-muted-foreground group-hover:text-blue-500" />
                      <span className="text-xs">{t.name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Stack Name</Label>
              <Input
                id="name"
                placeholder="e.g. my-awesome-app"
                className="bg-card border-border text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isDeploying || isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stack-type">Stack Type</Label>
              <Select value={deployStackType} onValueChange={setDeployStackType} disabled={isEditing}>
                <SelectTrigger id="stack-type" className="bg-card border-border">
                  <SelectValue placeholder="Select stack type" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  <SelectItem value="Compose">Docker Compose</SelectItem>
                  <SelectItem value="Swarm">Docker Swarm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="compose">docker-compose.yaml</Label>
              <div className="rounded-md border border-border overflow-hidden">
                <Editor
                  height="400px"
                  defaultLanguage="yaml"
                  theme="vs-dark"
                  value={composeContent}
                  onChange={(value) => setComposeContent(value || "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    formatOnPaste: true,
                    formatOnType: true,
                    wordWrap: "on",
                    readOnly: isDeploying,
                    padding: { top: 10, bottom: 10 }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="env-file">Upload .env file (optional)</Label>
              <Input
                id="env-file"
                type="file"
                accept=".env"
                className="bg-card border-border text-foreground file:text-blue-600 file:font-semibold file:cursor-pointer"
                onChange={handleEnvFileChange}
                disabled={isDeploying}
              />
              {envContent && (
                <div className="flex items-center text-sm text-muted-foreground">
                  .env file loaded.
                  <Button variant="link" size="sm" onClick={() => setEnvContent(null)} className="text-red-500 hover:text-red-600">
                    Remove
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployDialog(false)} disabled={isDeploying}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleDeploy} disabled={isDeploying || !newName || !composeContent}>
              {isDeploying ? "Deploying..." : (isEditing ? "Update Stack" : "Deploy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Eraser className="w-5 h-5" />
              Remove Stack: {stackToDelete}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              This will stop and remove all services associated with this stack.
              Volumes and networks might be preserved unless specified in the compose file.
              Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isActionLoading}
            >
              {isActionLoading ? "Removing..." : "Confirm Removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Stacks;
