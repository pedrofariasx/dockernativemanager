/*
 * File: Swarm.tsx
 * Project: docker-native-manager
 * Created: 2026-03-19
 * Author: Pedro Farias
 * 
 * Copyright (c) 2026 Pedro Farias
 * License: MIT
 */

"use client";

import { useEffect, useState } from "react";
import {
  getSwarmInfo,
  listNodes,
  listServices,
  inspectService,
  inspectNode,
  initSwarm,
  leaveSwarm,
  SwarmInfo,
  NodeInfo,
  ServiceInfo
} from "@/lib/docker";
import { useDocker } from "@/context/DockerContext";
import { cn } from "@/lib/utils";
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
  Network,
  Server,
  Activity,
  Shield,
  Search,
  RefreshCw,
  Eye,
  Info,
  Layers,
  Cpu,
  Database,
  Loader2,
  LogOut,
  Component,
  ComponentIcon,
  Waypoints,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { showSuccess, showError } from "@/utils/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Swarm = () => {
  const { isConnected } = useDocker();
  const [swarmInfo, setSwarmInfo] = useState<SwarmInfo | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [inspectData, setInspectData] = useState<string | null>(null);
  const [inspectTitle, setInspectTitle] = useState("");
  const [isManagingSwarm, setIsManagingSwarm] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [advertiseAddr, setAdvertiseAddr] = useState("");

  const fetchData = async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const info = await getSwarmInfo();
      setSwarmInfo(info);
      if (info) {
        const [n, s] = await Promise.all([listNodes(), listServices()]);
        setNodes(n);
        setServices(s);
      }
    } catch (err) {
      showError(`Error fetching swarm data: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isConnected]);

  const handleInspectService = async (id: string, name: string) => {
    try {
      const data = await inspectService(id);
      setInspectData(data);
      setInspectTitle(`Service: ${name}`);
    } catch (err) {
      showError(`Error inspecting service: ${err}`);
    }
  };

  const handleInspectNode = async (id: string, hostname: string) => {
    try {
      const data = await inspectNode(id);
      setInspectData(data);
      setInspectTitle(`Node: ${hostname}`);
    } catch (err) {
      showError(`Error inspecting node: ${err}`);
    }
  };

  const handleInitSwarm = async () => {
    setIsManagingSwarm(true);
    try {
      await initSwarm(advertiseAddr);
      showSuccess("Swarm initialized successfully");
      fetchData();
    } catch (err) {
      showError(`Error initializing swarm: ${err}`);
    } finally {
      setIsManagingSwarm(false);
    }
  };

  const handleLeaveSwarm = async () => {
    setIsManagingSwarm(true);
    setShowLeaveDialog(false);
    try {
      await leaveSwarm(true);
      showSuccess("Left swarm successfully");
      setSwarmInfo(null);
      fetchData();
    } catch (err) {
      showError(`Error leaving swarm: ${err}`);
    } finally {
      setIsManagingSwarm(false);
    }
  };

  const filteredNodes = nodes.filter(n => 
    n.hostname.toLowerCase().includes(search.toLowerCase()) || 
    n.id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.id.toLowerCase().includes(search.toLowerCase()) ||
    s.stack.toLowerCase().includes(search.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <Waypoints className="w-16 h-16 opacity-20" />
        <p>Connect to Docker to manage Swarm Cluster</p>
      </div>
    );
  }

  if (loading && !swarmInfo) {
    return (
      <div className="flex flex-col h-full gap-6 p-6 overflow-hidden">
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="w-64 h-10" />
            <Skeleton className="w-10 h-10" />
            <Skeleton className="w-32 h-10" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border rounded-xl p-4 flex items-center gap-4">
              <Skeleton className="w-11 h-11 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-6 w-8" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden mt-4">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="flex-1 border rounded-md overflow-hidden">
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!loading && !swarmInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 p-8 max-w-2xl mx-auto">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="p-4 rounded-full bg-primary/10 text-primary">
            <Waypoints className="w-12 h-12" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Swarm Mode is Inactive</h2>
          <p className="text-muted-foreground text-lg">
            This Docker engine is not part of a Swarm cluster.
            Initialize a swarm cluster to orchestrate services across multiple nodes.
          </p>
        </div>

        <div className="w-full bg-card border rounded-xl p-6 shadow-sm space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Advertise Address (Optional)
              </label>
              <Input
                placeholder="e.g. 192.168.1.10 or eth0"
                value={advertiseAddr}
                onChange={(e) => setAdvertiseAddr(e.target.value)}
                className="bg-muted/30 border-muted-foreground/20 h-11 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <p className="text-xs text-muted-foreground italic">
                The address that other nodes in the swarm can use to reach this node.
                Required if your system has multiple network interfaces.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={handleInitSwarm}
              className="w-full h-11 text-base font-bold gap-2 shadow-lg shadow-primary/20"
              disabled={isManagingSwarm}
            >
              {isManagingSwarm ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Initializing Swarm...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Initialize Swarm Cluster
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground uppercase tracking-widest font-medium">Or join an existing cluster</p>
          <div className="bg-muted px-4 py-2 rounded-md font-mono text-sm border border-border">
            docker swarm join --token {"<token>"} {"<manager-ip>"}:2377
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6 p-6 overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Waypoints className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Swarm Cluster</h1>
            <p className="text-muted-foreground text-sm">Manage nodes and services in your cluster</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search cluster..."
              className="pl-9 bg-muted/50 border-muted-foreground/20 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-2"
            onClick={() => setShowLeaveDialog(true)}
            disabled={isManagingSwarm}
          >
            {isManagingSwarm ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Leave Swarm
          </Button>
        </div>
      </div>

      {swarmInfo && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
          <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-500">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Nodes</p>
              <p className="text-2xl font-bold">{swarmInfo.nodes}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Managers</p>
              <p className="text-2xl font-bold">{swarmInfo.managers}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Services</p>
              <p className="text-2xl font-bold">{services.length}</p>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-500">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Status</p>
              <p className="text-sm font-bold text-emerald-500">Active</p>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="services" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="shrink-0">
          <TabsTrigger value="services" className="gap-2">
            <Layers className="w-4 h-4" /> Services
          </TabsTrigger>
          <TabsTrigger value="nodes" className="gap-2">
            <Server className="w-4 h-4" /> Nodes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="flex-1 mt-4 overflow-hidden border rounded-md">
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead>Service Name</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Replicas</TableHead>
                  <TableHead>Stack</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredServices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No services found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredServices.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className="font-medium">{service.name}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={service.image}>
                        {service.image}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {service.replicas}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {service.stack ? (
                          <Badge variant="secondary">{service.stack}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{service.ports || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleInspectService(service.id, service.name)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="nodes" className="flex-1 mt-4 overflow-hidden border rounded-md">
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredNodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No nodes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{node.hostname}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{node.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={node.role === 'manager' ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {node.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            node.status.toLowerCase().includes('ready') ? "bg-emerald-500" : "bg-rose-500"
                          )} />
                          <span className="capitalize">{node.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{node.availability}</TableCell>
                      <TableCell className="font-mono text-xs">{node.ip_address}</TableCell>
                      <TableCell className="text-xs">{node.engine_version}</TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleInspectNode(node.id, node.hostname)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will cause this node to leave the Swarm cluster.
              Any services running on this node will be terminated or migrated.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleLeaveSwarm();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Swarm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!inspectData} onOpenChange={() => setInspectData(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{inspectTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/50 rounded-md p-4 mt-2">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {inspectData}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Swarm;
