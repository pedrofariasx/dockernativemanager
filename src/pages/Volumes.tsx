/*
 * File: Volumes.tsx
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
import { useEffect, useState, useCallback } from "react";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn, formatBytes } from "@/lib/utils";
import { deleteVolume, createVolume, Volume, inspectVolume, pruneVolumes, getVolumeContainers } from "@/lib/docker";
import { 
  Table,
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
  Database,
  Search,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  Filter,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Eraser,
  Calendar,
  Tag,
  Copy,
  ExternalLink,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const Volumes = () => {
  const {
    volumes,
    loading,
    refreshVolumes
  } = useDocker();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPruneDialog, setShowPruneDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("local");
  const [isCreating, setIsCreating] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [newLabels, setNewLabels] = useState<{ key: string, value: string }[]>([]);
  const [selectedVolume, setSelectedVolume] = useState<Volume | null>(null);
  const [inspectData, setInspectData] = useState("");
  const [usingContainers, setUsingContainers] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshVolumes();
    setIsRefreshing(false);
  };

  const handleDelete = async (name: string) => {
    try {
      await deleteVolume(name);
      showSuccess(`Volume ${name} deleted`);
      setTimeout(refreshVolumes, 500);
    } catch (err) {
      showError(`Error deleting volume ${name}: ${err}`);
    }
  };

  const isInitialLoading = loading.volumes && volumes.length === 0;

  const handleCreate = async () => {
    if (!newName) return;
    setIsCreating(true);
    try {
      const labels: Record<string, string> = {};
      newLabels.forEach(l => {
        if (l.key.trim()) labels[l.key.trim()] = l.value.trim();
      });

      await createVolume(newName, newDriver, labels);
      showSuccess(`Volume ${newName} created`);
      setShowCreateDialog(false);
      setNewName("");
      setNewDriver("local");
      setNewLabels([]);
      setTimeout(refreshVolumes, 500);
    } catch (err) {
      showError(`Error creating volume: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePrune = async () => {
    setIsPruning(true);
    try {
      const result = await pruneVolumes();
      showSuccess(result);
      setShowPruneDialog(false);
      refreshVolumes();
    } catch (err) {
      showError(`Error pruning volumes: ${err}`);
    } finally {
      setIsPruning(false);
    }
  };

  const openInspect = async (volume: Volume) => {
    setSelectedVolume(volume);
    setInspectData("Loading inspection data...");
    setUsingContainers([]);
    try {
      const [data, containers] = await Promise.all([
        inspectVolume(volume.name),
        getVolumeContainers(volume.name)
      ]);
      setInspectData(data);
      setUsingContainers(containers);
    } catch (err) {
      setInspectData("Error loading inspection data.");
    }
  };

  const filtered = volumes.filter(v => {
    const searchLower = search.toLowerCase();
    const matchesSearch = v.name.toLowerCase().includes(searchLower) ||
                          v.driver.toLowerCase().includes(searchLower) ||
                          Object.entries(v.labels || {}).some(([k, val]) => 
                            k.toLowerCase().includes(searchLower) || 
                            val.toLowerCase().includes(searchLower)
                          );
    const matchesDriver = driverFilter === "all" || v.driver === driverFilter;
    return matchesSearch && matchesDriver;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let comparison = 0;
    
    if (key === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (key === 'driver') {
      comparison = a.driver.localeCompare(b.driver);
    } else if (key === 'created_at') {
      comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (key === 'size') {
      comparison = a.size - b.size;
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

  const drivers = Array.from(new Set(volumes.map(v => v.driver)));

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(v => v.name));
    }
  };

  const toggleSelect = (name: string) => {
    setSelectedIds(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    let successCount = 0;
    setIsRefreshing(true);
    for (const name of selectedIds) {
      try {
        await deleteVolume(name);
        successCount++;
      } catch (err) {
        console.error(`Failed to delete volume ${name}:`, err);
      }
    }
    setIsRefreshing(false);
    showSuccess(`${successCount}/${count} volumes deleted`);
    setSelectedIds([]);
    refreshVolumes();
  };

  return (
    <div className="p-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Volumes</h2>
            <p className="text-muted-foreground mt-1">Manage persistent data storage for your containers.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="bg-card border-border text-foreground hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20"
              onClick={() => setShowPruneDialog(true)}
            >
              <Eraser className="w-4 h-4 mr-2" />
              Prune
            </Button>
            <Button
              variant="outline"
              className="bg-card border-border text-foreground"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Volume
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
                  className="bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20 rounded-full"
                  onClick={handleBulkDelete}
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
              placeholder="Search volumes..."
              className="bg-card border-border text-foreground pl-10 focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-[180px] bg-card border-border h-11 focus:ring-blue-600">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="All Drivers" />
                </div>
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  onClick={() => requestSort('driver')}
                >
                  <div className="flex items-center gap-1">
                    Driver
                    {sortConfig?.key === 'driver' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('created_at')}
                >
                  <div className="flex items-center gap-1">
                    Created
                    {sortConfig?.key === 'created_at' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead 
                  className="text-muted-foreground font-medium cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => requestSort('size')}
                >
                  <div className="flex items-center gap-1">
                    Size
                    {sortConfig?.key === 'size' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-medium">Used By</TableHead>
                <TableHead className="text-muted-foreground font-medium">Mountpoint</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length > 0 ? (
                filtered.map((v) => (
                  <TableRow
                    key={v.name}
                    className={cn(
                      "border-border hover:bg-muted transition-colors",
                      selectedIds.includes(v.name) && "bg-muted"
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(v.name)}
                        onCheckedChange={() => toggleSelect(v.name)}
                        className="border-border data-[state=checked]:bg-blue-600"
                      />
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-blue-500" />
                          {v.name}
                        </div>

                        {/* Removi aqui, fiquei olhando uns 5 min e enjoei, muita info... */}

                        {/* {Object.keys(v.labels).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(v.labels).slice(0, 2).map(([key, value]) => (
                              <Badge key={key} variant="outline" className="text-[9px] px-1 py-0 h-4 bg-blue-500/5 text-blue-400 border-blue-500/20 max-w-[120px] truncate">
                                {key}: {value}
                              </Badge>
                            ))}
                            {Object.keys(v.labels).length > 2 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-muted text-muted-foreground border-border">
                                +{Object.keys(v.labels).length - 2}
                              </Badge>
                            )}
                          </div>
                        )} */}

                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded border border-border font-mono">
                        {v.driver}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono">
                      {v.size >= 0 ? formatBytes(v.size) : "N/A"}
                    </TableCell>
                    <TableCell>
                      {v.usage_count >= 0 ? (
                        <Badge variant="outline" className={cn(
                          "text-[10px] px-1.5 py-0 h-5",
                          v.usage_count > 0 ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/20" : "bg-orange-500/5 text-orange-500 border-orange-500/20"
                        )}>
                          {v.usage_count} {v.usage_count === 1 ? "container" : "containers"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs font-mono max-w-xs truncate">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{v.mountpoint}</span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-card border-border text-foreground text-xs font-mono max-w-md break-all">
                            {v.mountpoint}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[160px] bg-card border-border">
                          <DropdownMenuLabel className="text-muted-foreground">Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openInspect(v)}>
                            <Eye className="mr-2 h-4 w-4 text-emerald-500" />
                            <span>Inspect</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="hover:bg-muted focus:bg-muted cursor-pointer" 
                            onClick={() => {
                              navigator.clipboard.writeText(v.name);
                              showSuccess("Volume name copied to clipboard");
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4 text-blue-500" />
                            <span>Copy Name</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="hover:bg-muted focus:bg-muted cursor-pointer" 
                            onClick={() => {
                              navigator.clipboard.writeText(v.mountpoint);
                              showSuccess("Mountpoint copied to clipboard");
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4 text-orange-500" />
                            <span>Copy Mountpoint</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem onClick={() => handleDelete(v.name)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    No volumes found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedVolume} onOpenChange={(open) => !open && setSelectedVolume(null)}>
        <SheetContent side="right" className="w-[80%] sm:w-[80%] sm:max-w-none bg-background border-border text-foreground flex flex-col p-0 gap-0">
          <SheetHeader className="p-5 border-b border-border shrink-0 text-left">
            <SheetTitle className="text-foreground flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-500" />
              Inspect Volume: {selectedVolume?.name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Detailed configuration for volume {selectedVolume?.name}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Properties</h4>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Driver</span>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded border border-border w-fit">{selectedVolume?.driver}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Created At</span>
                    <span className="text-sm font-mono bg-muted px-2 py-1 rounded border border-border w-fit">
                      {selectedVolume?.created_at ? new Date(selectedVolume.created_at).toLocaleString() : "N/A"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Mountpoint</span>
                    <span className="text-xs font-mono bg-muted px-2 py-1 rounded border border-border break-all">{selectedVolume?.mountpoint}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Labels</h4>
                {selectedVolume && Object.keys(selectedVolume.labels).length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(selectedVolume.labels).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="bg-blue-500/5 text-blue-400 border-blue-500/20 px-2 py-0.5 font-mono">
                          {key}
                        </Badge>
                        <span className="text-muted-foreground">=</span>
                        <span className="text-foreground font-mono break-all bg-card border border-border px-2 py-0.5 rounded">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No labels defined for this volume.</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Used By</h4>
              {usingContainers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {usingContainers.map((name) => (
                    <Badge key={name} className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1">
                      {name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic text-emerald-500/60">This volume is currently not in use by any container.</p>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Raw Inspection Data</h4>
              <div className="bg-card rounded-lg p-4 font-mono text-xs whitespace-pre-wrap border border-border text-foreground">
                {inspectData}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Create New Volume</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Create a new persistent storage volume.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Volume Name</Label>
              <Input 
                id="name"
                placeholder="e.g. my-data-volume" 
                className="bg-card border-border text-foreground"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver">Driver</Label>
              <Select value={newDriver} onValueChange={setNewDriver} disabled={isCreating}>
                <SelectTrigger id="driver" className="w-full bg-card border-border h-10 focus:ring-blue-600">
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="local">local</SelectItem>
                  {drivers.filter(d => d !== "local").map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Labels</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  className="h-7 px-2 text-[10px]"
                  onClick={() => setNewLabels([...newLabels, { key: "", value: "" }])}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Label
                </Button>
              </div>
              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                {newLabels.map((label, index) => (
                  <div key={index} className="flex gap-2 items-center animate-in fade-in slide-in-from-top-1">
                    <Input
                      placeholder="key"
                      className="h-8 text-xs bg-card border-border"
                      value={label.key}
                      onChange={(e) => {
                        const updated = [...newLabels];
                        updated[index].key = e.target.value;
                        setNewLabels(updated);
                      }}
                    />
                    <Input
                      placeholder="value"
                      className="h-8 text-xs bg-card border-border"
                      value={label.value}
                      onChange={(e) => {
                        const updated = [...newLabels];
                        updated[index].value = e.target.value;
                        setNewLabels(updated);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      onClick={() => setNewLabels(newLabels.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {newLabels.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic text-center py-2">No labels added.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleCreate} disabled={isCreating || !newName}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPruneDialog} onOpenChange={setShowPruneDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Eraser className="w-5 h-5" />
              Prune Volumes
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will remove all unused local volumes. Unused volumes are those that are not referenced by any containers. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowPruneDialog(false)} disabled={isPruning}>
              Cancel
            </Button>
            <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={handlePrune} disabled={isPruning}>
              {isPruning ? "Pruning..." : "Confirm Prune"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Volumes;
