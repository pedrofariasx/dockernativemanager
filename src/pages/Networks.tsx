/*
 * File: Networks.tsx
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
import { useState, useEffect, useCallback, useMemo } from "react";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";
import { deleteNetwork, createNetwork, Network, inspectNetwork, pruneNetworks, connectContainerToNetwork, disconnectContainerFromNetwork, getContainers } from "@/lib/docker";
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
  Share2,
  Search,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  ChevronUp,
  ChevronDown,
  Filter,
  MoreVertical,
  Eraser,
  Link,
  Unlink,
  Settings2,
  Container,
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const Networks = () => {
  const {
    networks,
    loading,
    refreshNetworks,
    containers
  } = useDocker();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("bridge");
  const [newInternal, setNewInternal] = useState(false);
  const [newAttachable, setNewAttachable] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isPruning, setIsPruning] = useState(false);
  const [showPruneDialog, setShowPruneDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [connectingNetwork, setConnectingNetwork] = useState<Network | null>(null);
  const [selectedContainerToConnect, setSelectedContainerToConnect] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);
  const [inspectData, setInspectData] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteNetwork(id);
      showSuccess(`Network ${name} deleted`);
      setTimeout(refreshNetworks, 500);
    } catch (err) {
      showError(`Error deleting network ${name}: ${err}`);
    }
  };

  const isInitialLoading = loading.networks && networks.length === 0;

  const handleCreate = async () => {
    if (!newName) return;
    setIsCreating(true);
    try {
      await createNetwork(newName, newDriver, newInternal, newAttachable, {});
      showSuccess(`Network ${newName} created`);
      setShowCreateDialog(false);
      setNewName("");
      setNewDriver("bridge");
      setNewInternal(false);
      setNewAttachable(true);
      setTimeout(refreshNetworks, 500);
    } catch (err) {
      showError(`Error creating network: ${err}`);
    } finally {
      setIsCreating(false);
    }
  };

  const openInspect = async (network: Network) => {
    setSelectedNetwork(network);
    setInspectData("Loading inspection data...");
    try {
      const data = await inspectNetwork(network.id);
      setInspectData(data);
    } catch (err) {
      setInspectData("Error loading inspection data.");
    }
  };

  const filtered = networks.filter(n => {
    const matchesSearch = n.name.toLowerCase().includes(search.toLowerCase()) ||
                          n.driver.toLowerCase().includes(search.toLowerCase());
    const matchesDriver = driverFilter === "all" || n.driver === driverFilter;
    return matchesSearch && matchesDriver;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    let comparison = 0;
    
    if (key === 'name') {
      comparison = a.name.localeCompare(b.name);
    } else if (key === 'id') {
      comparison = a.id.localeCompare(b.id);
    } else if (key === 'driver') {
      comparison = a.driver.localeCompare(b.driver);
    } else if (key === 'scope') {
      comparison = a.scope.localeCompare(b.scope);
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

  const drivers = Array.from(new Set(networks.map(n => n.driver)));

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(n => n.id));
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
    
    for (const id of selectedIds) {
      try {
        await deleteNetwork(id);
        successCount++;
      } catch (err) {
        console.error(`Failed to delete network ${id}:`, err);
      }
    }
    
    showSuccess(`${successCount}/${count} networks deleted`);
    setSelectedIds([]);
    refreshNetworks();
  };

  const handlePrune = async () => {
    setIsPruning(true);
    setShowPruneDialog(false);
    try {
      const result = await pruneNetworks();
      showSuccess(result);
      refreshNetworks();
    } catch (err) {
      showError(`Error pruning networks: ${err}`);
    } finally {
      setIsPruning(false);
    }
  };

  const handleConnect = async () => {
    if (!connectingNetwork || !selectedContainerToConnect) return;
    setIsConnecting(true);
    try {
      await connectContainerToNetwork(connectingNetwork.id, selectedContainerToConnect);
      showSuccess(`Container connected to ${connectingNetwork.name}`);
      setShowConnectDialog(false);
      setSelectedContainerToConnect("");
      refreshNetworks();
    } catch (err) {
      showError(`Error connecting container: ${err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (networkId: string, containerId: string, networkName: string) => {
    try {
      await disconnectContainerFromNetwork(networkId, containerId);
      showSuccess(`Container disconnected from ${networkName}`);
      refreshNetworks();
      if (selectedNetwork?.id === networkId) {
        openInspect(selectedNetwork);
      }
    } catch (err) {
      showError(`Error disconnecting container: ${err}`);
    }
  };

  const parsedInspectData = useMemo(() => {
    if (!inspectData || inspectData.startsWith("Loading") || inspectData.startsWith("Error")) return null;
    try {
      return JSON.parse(inspectData);
    } catch (e) {
      return null;
    }
  }, [inspectData]);

  return (
    <div className="p-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Networks</h2>
            <p className="text-muted-foreground mt-1">Manage virtual networks for container communication.</p>
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
              onClick={refreshNetworks}
              disabled={loading.networks}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", loading.networks && "animate-spin")} />
              {loading.networks ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Network
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
              placeholder="Search networks..."
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
                  onClick={() => requestSort('id')}
                >
                  <div className="flex items-center gap-1">
                    Network ID
                    {sortConfig?.key === 'id' && (
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
                  onClick={() => requestSort('scope')}
                >
                  <div className="flex items-center gap-1">
                    Scope
                    {sortConfig?.key === 'scope' && (
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
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length > 0 ? (
              filtered.map((n) => (
                <TableRow
                  key={n.id}
                  className={cn(
                    "border-border hover:bg-muted transition-colors",
                    selectedIds.includes(n.id) && "bg-muted"
                  )}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(n.id)}
                      onCheckedChange={() => toggleSelect(n.id)}
                      className="border-border data-[state=checked]:bg-blue-600"
                    />
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-emerald-500" />
                      {n.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{n.id}</TableCell>
                  <TableCell>
                    <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded border border-border font-mono">
                      {n.driver}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs capitalize">{n.scope}</TableCell>
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
                        <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openInspect(n)}>
                          <Eye className="mr-2 h-4 w-4 text-emerald-500" />
                          <span>Inspect</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => {
                          setConnectingNetwork(n);
                          setShowConnectDialog(true);
                        }}>
                          <Link className="mr-2 h-4 w-4 text-blue-500" />
                          <span>Connect</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem onClick={() => handleDelete(n.id, n.name)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
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
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No networks found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={!!selectedNetwork} onOpenChange={(open) => !open && setSelectedNetwork(null)}>
        <SheetContent side="right" className="w-[80%] sm:w-[80%] sm:max-w-none bg-background border-border text-foreground flex flex-col p-0 gap-0">
          <SheetHeader className="p-5 border-b border-border shrink-0 text-left">
            <SheetTitle className="text-foreground flex items-center gap-2">
              <Eye className="w-5 h-5 text-emerald-500" />
              Inspect Network: {selectedNetwork?.name}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              Detailed configuration for network {selectedNetwork?.id}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-8 space-y-8">
            {parsedInspectData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Driver</p>
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-blue-500" />
                      <p className="text-lg font-semibold">{parsedInspectData[0]?.Driver || parsedInspectData.Driver}</p>
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Scope</p>
                    <p className="text-lg font-semibold capitalize">{parsedInspectData[0]?.Scope || parsedInspectData.Scope}</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Internal</p>
                    <Badge variant={parsedInspectData[0]?.Internal ? "destructive" : "secondary"}>
                      {String(parsedInspectData[0]?.Internal || parsedInspectData.Internal)}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Container className="w-5 h-5 text-blue-500" />
                    <h3 className="text-lg font-semibold">Connected Containers</h3>
                  </div>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent border-border">
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">IPv4 Address</TableHead>
                          <TableHead className="text-xs">MAC Address</TableHead>
                          <TableHead className="text-xs text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries((parsedInspectData[0]?.Containers || parsedInspectData.Containers) || {}).map(([id, info]: [string, any]) => (
                          <TableRow key={id} className="border-border hover:bg-muted/50">
                            <TableCell className="font-medium">{info.Name}</TableCell>
                            <TableCell className="font-mono text-xs">{info.IPv4Address || "N/A"}</TableCell>
                            <TableCell className="font-mono text-xs">{info.MacAddress || "N/A"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                onClick={() => handleDisconnect(selectedNetwork!.id, id, selectedNetwork!.name)}
                              >
                                <Unlink className="w-3.5 h-3.5 mr-1" />
                                Disconnect
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {Object.keys((parsedInspectData[0]?.Containers || parsedInspectData.Containers) || {}).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="h-20 text-center text-muted-foreground text-sm">
                              No containers connected to this network.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-lg font-semibold">Raw Inspection</h3>
                  </div>
                  <div className="bg-card rounded-xl p-6 font-mono text-xs whitespace-pre-wrap border border-border text-foreground shadow-sm">
                    {inspectData}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-card rounded-xl p-6 font-mono text-xs whitespace-pre-wrap border border-border text-foreground">
                {inspectData}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Create New Network</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Network Name</Label>
              <Input
                id="name"
                placeholder="e.g. my-app-network"
                className="bg-card border-border text-foreground h-10"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isCreating}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver">Driver</Label>
                <Select value={newDriver} onValueChange={setNewDriver} disabled={isCreating}>
                  <SelectTrigger id="driver" className="w-full bg-card border-border h-10 focus:ring-blue-600">
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="bridge">bridge</SelectItem>
                    <SelectItem value="host">host</SelectItem>
                    <SelectItem value="overlay">overlay</SelectItem>
                    <SelectItem value="ipvlan">ipvlan</SelectItem>
                    <SelectItem value="macvlan">macvlan</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="internal">Internal</Label>
                    <p className="text-[10px] text-muted-foreground">Restrict external access</p>
                  </div>
                  <Switch
                    id="internal"
                    checked={newInternal}
                    onCheckedChange={setNewInternal}
                    disabled={isCreating}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="attachable">Attachable</Label>
                    <p className="text-[10px] text-muted-foreground">Manual container attachment</p>
                  </div>
                  <Switch
                    id="attachable"
                    checked={newAttachable}
                    onCheckedChange={setNewAttachable}
                    disabled={isCreating}
                  />
                </div>
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

      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Connect Container to {connectingNetwork?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="container">Select Container</Label>
              <Select value={selectedContainerToConnect} onValueChange={setSelectedContainerToConnect} disabled={isConnecting}>
                <SelectTrigger id="container" className="w-full bg-card border-border h-10 focus:ring-blue-600">
                  <SelectValue placeholder="Select a container..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {containers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.id.substring(0, 8)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border text-foreground" onClick={() => setShowConnectDialog(false)} disabled={isConnecting}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleConnect} disabled={isConnecting || !selectedContainerToConnect}>
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPruneDialog} onOpenChange={setShowPruneDialog}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Eraser className="w-5 h-5" />
              Prune Unused Networks
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              This will remove all networks not used by at least one container.
              This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowPruneDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePrune}
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

export default Networks;
