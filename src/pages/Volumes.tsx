"use client";

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";
import { getVolumes, deleteVolume, createVolume, Volume, inspectVolume } from "@/lib/docker";
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
  MoreVertical
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/utils/toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";

const Volumes = () => {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedVolume, setSelectedVolume] = useState<Volume | null>(null);
  const [inspectData, setInspectData] = useState("");

  const refreshVolumes = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getVolumes();
      setVolumes(data);
    } catch (err) {
      showError("Failed to fetch volumes.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshVolumes();
  }, [refreshVolumes]);

  useDockerEvent("volume", refreshVolumes);

  const handleDelete = async (name: string) => {
    try {
      await deleteVolume(name);
      showSuccess(`Volume ${name} deleted`);
      refreshVolumes();
    } catch (err) {
      showError(`Error deleting volume ${name}: ${err}`);
    }
  };

  const handleCreate = async () => {
    if (!newName) return;
    setIsCreating(true);
    try {
      await createVolume(newName);
      showSuccess(`Volume ${newName} created`);
      setShowCreateDialog(false);
      setNewName("");
      refreshVolumes();
    } catch (err) {
      showError(`Error creating volume: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const openInspect = async (volume: Volume) => {
    setSelectedVolume(volume);
    setInspectData("Loading inspection data...");
    try {
      const data = await inspectVolume(volume.name);
      setInspectData(data);
    } catch (err) {
      setInspectData("Error loading inspection data.");
    }
  };

  const filtered = volumes.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
                          v.driver.toLowerCase().includes(search.toLowerCase());
    const matchesDriver = driverFilter === "all" || v.driver === driverFilter;
    return matchesSearch && matchesDriver;
  });

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
            {selectedIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="bg-rose-500/10 border-rose-500/20 text-rose-500 hover:bg-rose-500/20 animate-in fade-in slide-in-from-right-4"
                onClick={handleBulkDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedIds.length})
              </Button>
            )}
            <Button
              variant="outline"
              className="bg-card border-border text-foreground"
              onClick={refreshVolumes}
              disabled={isRefreshing}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Volume
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search volumes..."
              className="bg-card border-border text-foreground pl-10 focus-visible:ring-blue-600 h-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 h-11">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="bg-transparent text-foreground text-sm outline-none cursor-pointer h-full py-2 min-w-[120px]"
            >
              <option value="all" className="bg-background">All Drivers</option>
              {drivers.map(d => (
                <option key={d} value={d} className="bg-background">{d}</option>
              ))}
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
                <TableHead className="text-muted-foreground font-medium">Name</TableHead>
                <TableHead className="text-muted-foreground font-medium">Driver</TableHead>
                <TableHead className="text-muted-foreground font-medium">Mountpoint</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
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
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      {v.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded border border-border font-mono">
                      {v.driver}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono max-w-md truncate">{v.mountpoint}</TableCell>
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
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem onClick={() => handleDelete(v.name)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
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
          <div className="flex-1 overflow-auto p-8">
            <div className="bg-card rounded-lg p-4 font-mono text-xs whitespace-pre-wrap border border-border text-foreground">
              {inspectData}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Create New Volume</DialogTitle>
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
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-rose-900/50 text-rose-500 hover:bg-rose-950/30 hover:text-rose-400" onClick={() => setShowCreateDialog(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleCreate} disabled={isCreating || !newName}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Volumes;
