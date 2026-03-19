/*
 * File: Images.tsx
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
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import { deleteImage, Image, inspectImage, createContainer, pruneImages } from "@/lib/docker";
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
  Download,
  Trash2,
  Search,
  RotateCcw,
  HardDrive,
  Eye,
  MoreVertical,
  Play,
  ChevronUp,
  ChevronDown,
  Copy,
  Eraser,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Progress } from "@/components/ui/progress";



const Images = () => {
  const {
    images,
    containers,
    loading,
    refreshImages,
    pullingImages,
    pullImageBackground,
  } = useDocker();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullImageUrl, setPullImageUrl] = useState("");
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const [inspectData, setInspectData] = useState("");
  const [showPruneDialog, setShowPruneDialog] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [showRunContainerDialog, setShowRunContainerDialog] = useState(false);
  const [selectedImageToRun, setSelectedImageToRun] = useState<Image | null>(null);
  const [containerName, setContainerName] = useState("");
  const [containerPorts, setContainerPorts] = useState("");
  const [containerEnvs, setContainerEnvs] = useState("");
  const [containerVolumes, setContainerVolumes] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterInUse, setFilterInUse] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshImages();
    setIsRefreshing(false);
  };

  const handleDelete = async (id: string, repo: string) => {
    try {
      await deleteImage(id);
      showSuccess(`Image ${repo} deleted`);
      // Give Docker a moment to process the deletion
      setTimeout(refreshImages, 500);
    } catch (err) {
      showError(`Error deleting image ${repo}`);
    }
  };

  const isInitialLoading = loading.images && images.length === 0;

  const handlePull = async () => {
    if (!pullImageUrl) return;
    setShowPullDialog(false);
    await pullImageBackground(pullImageUrl);
    setPullImageUrl("");
  };

  const openInspect = async (image: Image) => {
    setSelectedImage(image);
    setInspectData("Loading inspection data...");
    try {
      const data = await inspectImage(image.id);
      setInspectData(data);
    } catch (err) {
      setInspectData("Error loading inspection data.");
    }
  };

  const filtered = images.filter(img => {
    const matchesSearch = img.repository.toLowerCase().includes(search.toLowerCase()) ||
                          img.tag.toLowerCase().includes(search.toLowerCase()) ||
                          img.id.toLowerCase().includes(search.toLowerCase());
    
    if (filterInUse) {
      const isInUse = containers.some(c => c.image.includes(img.repository) || c.image.includes(img.id));
      return matchesSearch && isInUse;
    }
    
    return matchesSearch;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let comparison = 0;
    
    if (key === 'created_at') {
      comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else if (key === 'repository') {
      comparison = a.repository.localeCompare(b.repository);
    } else if (key === 'size') {
      // Basic size comparison logic (could be improved)
      comparison = parseFloat(a.size) - parseFloat(b.size);
    }
    
    return direction === 'asc' ? comparison : -comparison;
  });

  const pullingList = Object.entries(pullingImages).map(([name, data]) => {
    const [repo, tag] = name.split(':');
    return {
      id: `pulling-${name}`,
      repository: repo,
      tag: tag || 'latest',
      size: 'Pulling...',
      created_at: new Date().toISOString(),
      isPulling: true,
      status: data.status,
      progress: data.progress
    };
  }).filter(img => 
    img.repository.toLowerCase().includes(search.toLowerCase()) ||
    img.tag.toLowerCase().includes(search.toLowerCase())
  );

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
      setSelectedIds(filtered.map(img => img.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    const count = selectedIds.length;
    let successCount = 0;
    
    setIsRefreshing(true);
    for (const id of selectedIds) {
      try {
        await deleteImage(id);
        successCount++;
      } catch (err) {
        console.error(`Failed to delete image ${id}:`, err);
      }
    }
    setIsRefreshing(false);
    
    showSuccess(`${successCount}/${count} images deleted`);
    setSelectedIds([]);
    refreshImages();
  };

  const handlePruneImages = async () => {
    setIsPruning(true);
    setShowPruneDialog(false);
    try {
      const result = await pruneImages();
      showSuccess(result);
      refreshImages();
    } catch (err) {
      showError(`Failed to prune images: ${err}`);
    } finally {
      setIsPruning(false);
    }
  };

  const openRunContainerDialog = (image: Image) => {
    setSelectedImageToRun(image);
    setContainerName(`${image.repository.replace(/[^a-zA-Z0-9_.-]/g, '')}-${image.tag.replace(/[^a-zA-Z0-9_.-]/g, '')}-${Date.now().toString().slice(-4)}`);
    setContainerPorts("");
    setContainerEnvs("");
    setContainerVolumes("");
    setShowRunContainerDialog(true);
  };

  const handleRunContainer = async () => {
    if (!selectedImageToRun || !containerName) return;

    try {
      const ports = containerPorts.split(',').map(p => p.trim()).filter(p => p);
      const envs = containerEnvs.split('\n').map(e => e.trim()).filter(e => e);
      const volumes = containerVolumes.split('\n').map(v => v.trim()).filter(v => v);

      await createContainer(containerName, `${selectedImageToRun.repository}:${selectedImageToRun.tag}`, ports, envs, volumes);
      showSuccess(`Container ${containerName} created from image ${selectedImageToRun.repository}:${selectedImageToRun.tag}`);
      setShowRunContainerDialog(false);
      refreshImages(); // Refresh images to reflect container usage
    } catch (err) {
      showError(`Failed to create container: ${err}`);
    }
  };

  return (
    <div className="p-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Images</h2>
            <p className="text-muted-foreground mt-1">Manage local Docker images and pull new ones.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="bg-card border-border text-foreground hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/20"
              onClick={() => setShowPruneDialog(true)}
              disabled={isPruning}
            >
              <Eraser className={cn("w-4 h-4 mr-2", isPruning && "animate-pulse")} />
              {isPruning ? "Pruning..." : "Prune"}
            </Button>
            <Button
              variant="outline"
              className="bg-card border-border text-foreground"
              onClick={refreshImages}
              disabled={isRefreshing}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowPullDialog(true)}>
              <Download className="w-4 h-4 mr-2" />
              Pull Image
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
              placeholder="Search images by name, tag or ID..." 
              className="bg-card border-border text-foreground pl-10 focus-visible:ring-0 focus-visible:ring-offset-0 h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 h-11 shrink-0">
            <Checkbox 
              id="filter-in-use" 
              checked={filterInUse} 
              onCheckedChange={(checked) => setFilterInUse(!!checked)}
              className="border-border data-[state=checked]:bg-blue-600"
            />
            <label htmlFor="filter-in-use" className="text-sm font-medium text-foreground cursor-pointer select-none">
              Only In Use
            </label>
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
                  onClick={() => requestSort('repository')}
                >
                  <div className="flex items-center gap-1">
                    Repository
                    {sortConfig?.key === 'repository' && (
                      sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground font-medium">Tag</TableHead>
                <TableHead className="text-muted-foreground font-medium">Image ID</TableHead>
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
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isInitialLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (pullingList.length > 0 || filtered.length > 0) ? (
                <>
                  {pullingList.map((img) => (
                    <TableRow key={img.id} className="border-border bg-blue-500/5 animate-pulse">
                      <TableCell>
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      </TableCell>
                      <TableCell className="font-semibold text-blue-400">{img.repository}</TableCell>
                      <TableCell>
                        <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-0.5 rounded border border-blue-500/20 font-mono">
                          {img.tag}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono italic">Pulling...</TableCell>
                      <TableCell className="text-muted-foreground text-xs italic">Pending</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        <div className="flex flex-col gap-1 w-full max-w-[150px]">
                          <span className="text-[10px] text-blue-400 truncate">{img.status}</span>
                          {img.progress !== null && <Progress value={img.progress} className="h-1" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0 opacity-50">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.map((img) => (
                    <TableRow
                      key={img.id}
                      className={cn(
                        "border-border hover:bg-muted transition-colors",
                        selectedIds.includes(img.id) && "bg-muted"
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(img.id)}
                          onCheckedChange={() => toggleSelect(img.id)}
                          className="border-border data-[state=checked]:bg-blue-600"
                        />
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {img.repository}
                            {containers.some(c => c.image.includes(img.repository) || c.image.includes(img.id)) && (
                              <span className="bg-blue-500/10 text-blue-500 text-[10px] px-1.5 py-0.5 rounded border border-blue-500/20 font-medium">
                                In Use
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded border border-border font-mono">
                          {img.tag}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{img.id}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-3 h-3 text-muted-foreground" />
                        {img.size}
                      </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {dayjs(img.created_at).fromNow()}
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
                            <DropdownMenuLabel className="text-muted-foreground">Actions</DropdownMenuLabel>
                             <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openInspect(img)}>
                              <Eye className="mr-2 h-4 w-4 text-emerald-500" />
                              <span>Inspect</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openRunContainerDialog(img)}>
                              <Play className="mr-2 h-4 w-4 text-blue-500" />
                              <span>Run</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => {
                              navigator.clipboard.writeText(img.id);
                              showSuccess("Image ID copied to clipboard");
                            }}>
                              <Copy className="mr-2 h-4 w-4 text-muted-foreground" />
                              <span>Copy ID</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-border" />
                            <DropdownMenuItem onClick={() => handleDelete(img.id, img.repository)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Delete</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No images found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <SheetContent side="right" className="w-[80%] sm:w-[80%] sm:max-w-none bg-background border-border text-foreground flex flex-col p-0 gap-0">
          <SheetHeader className="p-5 border-b border-border shrink-0 text-left">
            <SheetTitle className="text-foreground flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-500" />
              Inspect Image: {selectedImage?.repository}:{selectedImage?.tag}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Detailed configuration for image {selectedImage?.id}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-8">
            <div className="bg-card rounded-lg p-4 font-mono text-xs whitespace-pre-wrap border border-border text-foreground">
              {inspectData}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showPullDialog} onOpenChange={setShowPullDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Pull New Image</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input
              placeholder="e.g. nginx:latest or ubuntu"
              className="bg-card border-border text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              value={pullImageUrl}
              onChange={(e) => setPullImageUrl(e.target.value)}
              disabled={Object.keys(pullingImages).some(name => name === (pullImageUrl.includes(':') ? pullImageUrl : `${pullImageUrl}:latest`))}
            />
            
            {Object.entries(pullingImages).map(([imageName, { status, progress }]) => (
              <div key={imageName} className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Pulling {imageName}: {status}</span>
                  {progress !== null && <span className="text-blue-400 font-mono">{progress}%</span>}
                </div>
                {progress !== null ? (
                  <Progress value={progress} className="h-1.5" />
                ) : (
                  <Progress value={100} className="h-1.5 animate-pulse" />
                )}
              </div>
            ))}
            
            {!Object.keys(pullingImages).length && (
              <p className="text-xs text-muted-foreground mt-2">
                Enter the image name and tag to pull from Docker Hub.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPullDialog(false)} disabled={Object.keys(pullingImages).length > 0}>
              Cancel
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white" 
              onClick={handlePull} 
              disabled={!pullImageUrl || Object.keys(pullingImages).some(name => name === (pullImageUrl.includes(':') ? pullImageUrl : `${pullImageUrl}:latest`))}
            >
              {Object.keys(pullingImages).some(name => name === (pullImageUrl.includes(':') ? pullImageUrl : `${pullImageUrl}:latest`)) ? "Pulling..." : "Pull Image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRunContainerDialog} onOpenChange={setShowRunContainerDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Run Container from Image: {selectedImageToRun?.repository}:{selectedImageToRun?.tag}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="containerName" className="mb-2 block text-sm font-medium">Container Name</Label>
              <Input
                id="containerName"
                placeholder="e.g. my-nginx-container"
                className="bg-card border-border text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="containerPorts" className="mb-2 block text-sm font-medium">Port Mappings (e.g. 8080:80, 8443:443)</Label>
              <Input
                id="containerPorts"
                placeholder="HostPort:ContainerPort, ..."
                className="bg-card border-border text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                value={containerPorts}
                onChange={(e) => setContainerPorts(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="containerEnvs" className="mb-2 block text-sm font-medium">Environment Variables (one per line, e.g. MY_VAR=value)</Label>
              <textarea
                id="containerEnvs"
                rows={3}
                placeholder="KEY=VALUE"
                className="flex h-auto w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 "
                value={containerEnvs}
                onChange={(e) => setContainerEnvs(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="containerVolumes" className="mb-2 block text-sm font-medium">Volume Mappings (one per line, e.g. /host/path:/container/path)</Label>
              <textarea
                id="containerVolumes"
                rows={3}
                placeholder="/host/path:/container/path"
                className="flex h-auto w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                value={containerVolumes}
                onChange={(e) => setContainerVolumes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRunContainerDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleRunContainer} disabled={!containerName || !selectedImageToRun}>
              Run Container
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPruneDialog} onOpenChange={setShowPruneDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Eraser className="w-5 h-5" />
              Prune Unused Images
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              This will remove all dangling images and images not used by at least one container.
              This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowPruneDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePruneImages}
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={isPruning}
            >
              {isPruning ? "Pruning..." : "Confirm Prune"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Images;
