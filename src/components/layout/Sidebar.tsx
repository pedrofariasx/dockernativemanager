/*
 * File: Sidebar.tsx
 * Project: docker-native-manager
 * Created: 2026-03-14
 * Author: Pedro Farias
 * 
 * Last Modified: Tue Mar 31 2026
 * Modified By: Pedro Farias
 * 
 * Copyright (c) 2026 Pedro Farias
 * License: MIT
 */

"use client";

import { cn } from "@/lib/utils";
import { useDocker } from "@/context/DockerContext";
import {
  LayoutDashboard,
  Box, 
  Layers, 
  Database, 
  Network as NetworkIcon, 
  Settings,
  Circle,
  Trash,
  Eraser,
  Loader2,
  Moon,
  Sun,
  Images,
  ImageIcon,
  FileImage,
  ImagePlayIcon,
  Disc,
  Disc2,
  Container,
  EraserIcon,
  Play,
  Square as SquareIcon,
  RotateCw,
  Blocks,
  BlocksIcon,
  Waypoints,
  Settings2,
  Plus,
  Github,
  ExternalLink,
  Download,
  Sparkles,
  Package,
  Info,
  Wifi,
  KeyRound
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  dockerSystemPrune,
  getSwarmInfo,
  initSwarm,
  leaveSwarm,
  listDockerContexts,
  useDockerContext,
  createDockerContext,
  removeDockerContext,
  testDockerConnection,
  listSshKeys,
  configureSshHost,
  openExternalLink,
  downloadUpdate,
  type DockerContext,
  type SshKeyInfo
} from "@/lib/docker";
import { showSuccess, showError } from "@/utils/toast";
import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Containers", path: "/containers", icon: Container },
  { name: "Stacks", path: "/stacks", icon: Layers },
  { name: "Swarm", path: "/swarm", icon: Waypoints },
  { name: "Images", path: "/images", icon: Disc2 },
  { name: "Volumes", path: "/volumes", icon: Database },
  { name: "Networks", path: "/networks", icon: NetworkIcon },
];

const Sidebar = () => {
  const location = useLocation();
  const { isConnected, manageService, refreshAll, loading } = useDocker();
  const [isPruning, setIsPruning] = useState(false);
  const [isManagingService, setIsManagingService] = useState(false);
  const [showPruneDialog, setShowPruneDialog] = useState(false);
  const [showClusterSettings, setShowClusterSettings] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [contexts, setContexts] = useState<DockerContext[]>([]);
  const [isRefreshingContexts, setIsRefreshingContexts] = useState(false);
  const [isCreatingContext, setIsCreatingContext] = useState(false);
  const [newContext, setNewContext] = useState({ name: '', host: '' });
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [contributors, setContributors] = useState<any[]>([]);
  const [isLoadingContributors, setIsLoadingContributors] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [latestRelease, setLatestRelease] = useState<any>(null);
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sshKeys, setSshKeys] = useState<SshKeyInfo[]>([]);
  const [selectedSshKey, setSelectedSshKey] = useState<string>('');
  const [showSshConfig, setShowSshConfig] = useState(false);

  const handleDownload = async (asset: any) => {
    setDownloadingAsset(asset.id);
    try {
      const path = await downloadUpdate(asset.browser_download_url, asset.name);
      showSuccess(`File downloaded to: ${path}`);
    } catch (err) {
      showError(`Download failed: ${err}`);
    } finally {
      setDownloadingAsset(null);
    }
  };

  const compareVersions = (v1: string, v2: string) => {
    const cleanV1 = v1.replace(/^v/, '');
    const cleanV2 = v2.replace(/^v/, '');
    const parts1 = cleanV1.split('.').map(Number);
    const parts2 = cleanV2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  };

  const checkForUpdates = async (silent = true, forceOpen = false) => {
    setIsCheckingUpdates(true);
    try {
      const response = await fetch('https://api.github.com/repos/pedrofariasx/dockernativemanager/releases/latest');
      if (response.ok) {
        const data = await response.json();
        const latest = data.tag_name;
        setLatestVersion(latest);
        setLatestRelease(data);
        
        if (appVersion && compareVersions(latest, appVersion) > 0) {
          if (forceOpen) setShowUpdateDialog(true);
        } else if (!silent) {
          showSuccess("You are on the latest version!");
        }
      }
    } catch (err) {
      console.error("Error checking for updates:", err);
      if (!silent) showError("Failed to check for updates");
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  useEffect(() => {
    if (appVersion) {
      checkForUpdates(true, true);
    }
  }, [appVersion]);

  const fetchContributors = async () => {
    setIsLoadingContributors(true);
    try {
      const response = await fetch('https://api.github.com/repos/pedrofariasx/dockernativemanager/contributors');
      if (response.ok) {
        const data = await response.json();
        setContributors(data);
      }
    } catch (err) {
      console.error("Error fetching contributors:", err);
    } finally {
      setIsLoadingContributors(false);
    }
  };

  useEffect(() => {
    if (showAboutDialog) {
      if (contributors.length === 0) fetchContributors();
      checkForUpdates(true, false);
    }
  }, [showAboutDialog]);

  const fetchContexts = async () => {
    setIsRefreshingContexts(true);
    try {
      const data = await listDockerContexts();
      setContexts(data);
    } catch (err) {
      showError(`Error listing contexts: ${err}`);
    } finally {
      setIsRefreshingContexts(false);
    }
  };

  useEffect(() => {
    fetchContexts();
    // Fetch SSH keys when cluster settings dialog opens
    if (showClusterSettings) {
      listSshKeys().then(setSshKeys).catch(() => setSshKeys([]));
    }
  }, [showClusterSettings]);

  const handleSwitchContext = async (name: string) => {
    try {
      await useDockerContext(name);
      showSuccess(`Switched to context: ${name}`);
      await fetchContexts();
      // Trigger reconnect to re-establish connection with the new context
      await manageService('reconnect');
    } catch (err) {
      showError(`Error switching context: ${err}`);
    }
  };

  const handleCreateContext = async () => {
    if (!newContext.name || !newContext.host) {
      showError("Name and Host are required");
      return;
    }
    setIsCreatingContext(true);
    try {
      // If SSH host and a key is selected, configure SSH first
      if (newContext.host.startsWith('ssh://') && selectedSshKey) {
        try {
          // Parse user@host from ssh://user@host URL
          const sshPart = newContext.host.replace('ssh://', '');
          const [user, ...hostParts] = sshPart.split('@');
          const hostWithPort = hostParts.join('@');
          const [hostname, portStr] = hostWithPort.split(':');
          const port = portStr ? parseInt(portStr, 10) : null;
          
          if (hostname && user) {
            await configureSshHost(hostname, user, port, selectedSshKey);
          }
        } catch (sshErr) {
          showError(`Warning: Could not configure SSH key: ${sshErr}`);
          // Continue anyway - the context might still work if SSH agent has the key
        }
      }
      
      await createDockerContext(newContext.name, newContext.host);
      showSuccess(`Context ${newContext.name} created`);
      setNewContext({ name: '', host: '' });
      setSelectedSshKey('');
      setConnectionTestResult(null);
      setShowSshConfig(false);
      await fetchContexts();
    } catch (err) {
      showError(`Error creating context: ${err}`);
    } finally {
      setIsCreatingContext(false);
    }
  };

  const handleTestConnection = async () => {
    if (!newContext.host) {
      showError("Host URL is required to test connection");
      return;
    }
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const hostname = await testDockerConnection(newContext.host, selectedSshKey || undefined);
      setConnectionTestResult({ success: true, message: `Connected to: ${hostname}` });
      showSuccess(`Connection successful! Host: ${hostname}`);
    } catch (err) {
      setConnectionTestResult({ success: false, message: `${err}` });
      showError(`Connection failed: ${err}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleRemoveContext = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    try {
      await removeDockerContext(name);
      showSuccess(`Context ${name} removed`);
      await fetchContexts();
    } catch (err) {
      showError(`Error removing context: ${err}`);
    }
  };

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);
  const { theme, setTheme } = useTheme();

  const handlePrune = async () => {
    setIsPruning(true);
    setShowPruneDialog(false);
    try {
      const result = await dockerSystemPrune();
      showSuccess("System pruned successfully");
      console.log(result);
    } catch (err) {
      showError(`Error pruning system: ${err}`);
    } finally {
      setIsPruning(false);
    }
  };

  const handleServiceAction = async (action: 'start' | 'stop' | 'restart') => {
    setIsManagingService(true);
    try {
      await manageService(action);
    } finally {
      setIsManagingService(false);
    }
  };


  return (
    <>
      <div className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-sidebar-border flex items-center gap-3">
          <img src="/dnm-icon.png" alt="DNM Icon" className="w-12 h-12" />
          <div className="flex-1 cursor-pointer" onClick={() => setShowAboutDialog(true)}>
            <h1 className="text-sidebar-foreground font-bold text-lg leading-none">Docker NM</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1 hover:text-primary transition-colors">{appVersion ? `${appVersion}` : "v0.0.0"}</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-2 rounded-md transition-colors",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 space-y-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Appearance</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground hover:text-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>

          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground hover:text-rose-400 hover:bg-rose-500/10"
            onClick={() => setShowPruneDialog(true)}
            disabled={isPruning}
          >
            {isPruning ? <Loader2 className="w-4 h-4 animate-spin" /> : <EraserIcon className="w-4 h-4" />}
            <span className="text-sm font-medium">System Prune</span>
          </Button>

          <div className="bg-sidebar-accent/50 rounded-lg p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {isManagingService && !isConnected ? (
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
              ) : (
                <Circle className={cn(
                  "w-3 h-3 animate-pulse",
                  isConnected ? "text-emerald-500 fill-emerald-500" : "text-rose-500 fill-rose-500"
                )} />
              )}
              <div className="flex-1 overflow-hidden">
                <p className="text-xs text-sidebar-foreground font-medium">Daemon Status</p>
                <div className="flex items-center gap-1 overflow-hidden">
                  <p className={cn(
                    "text-[10px] truncate font-semibold transition-colors shrink-0",
                    isManagingService && !isConnected ? "text-amber-500" :
                    isConnected ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {isManagingService && !isConnected ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
                  </p>
                  {isConnected && contexts.find(c => c.is_active) && (
                    <>
                      <span className="text-[8px] text-muted-foreground">•</span>
                      <span className="text-[10px] text-primary font-bold truncate">
                        {contexts.find(c => c.is_active)?.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 bg-background/50 hover:bg-rose-500/20 hover:text-rose-500"
                    onClick={() => handleServiceAction('stop')}
                    disabled={isManagingService}
                    title="Stop Docker Service"
                  >
                    <SquareIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 bg-background/50 hover:bg-amber-500/20 hover:text-amber-500"
                    onClick={() => handleServiceAction('restart')}
                    disabled={isManagingService}
                    title="Restart Docker Service"
                  >
                    <RotateCw className={cn("w-3.5 h-3.5", isManagingService && "animate-spin")} />
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 flex-1 gap-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20"
                  onClick={() => handleServiceAction('start')}
                  disabled={isManagingService}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">Start Daemon</span>
                </Button>
              )}
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/50 hover:bg-primary/20 hover:text-primary ml-auto shrink-0"
                onClick={() => setShowClusterSettings(true)}
                title="Cluster Configuration"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showPruneDialog} onOpenChange={setShowPruneDialog}>
        <DialogContent className="bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Eraser className="w-5 h-5" />
              System Prune
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              This will remove all stopped containers, unused networks, and dangling images.
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

      <Dialog open={showClusterSettings} onOpenChange={setShowClusterSettings}>
        <DialogContent className="bg-background border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Cluster Configuration
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Manage your Docker clusters and remote connections.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Available Contexts</h4>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchContexts} disabled={isRefreshingContexts}>
                  <RotateCw className={cn("w-3 h-3", isRefreshingContexts && "animate-spin")} />
                </Button>
              </div>
              
              <div className="grid gap-2">
                {contexts.map((ctx) => (
                  <div key={ctx.name} className="relative group">
                    <Button
                      variant={ctx.is_active ? "outline" : "ghost"}
                      className={cn(
                        "w-full justify-start gap-3 h-14 border-primary/20",
                        ctx.is_active && "bg-primary/5 border-primary/30"
                      )}
                      onClick={() => !ctx.is_active && handleSwitchContext(ctx.name)}
                    >
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        ctx.is_active ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-muted-foreground/30"
                      )} />
                      <div className="flex flex-col items-start overflow-hidden">
                        <span className="text-sm font-bold truncate">{ctx.name}</span>
                        <span className="text-[10px] text-muted-foreground truncate w-full">
                          {ctx.docker_endpoint}
                        </span>
                      </div>
                    </Button>
                    {!ctx.is_active && ctx.name !== 'default' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => handleRemoveContext(e, ctx.name)}
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add New Remote Context</h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Context Name</label>
                  <Input
                    placeholder="e.g. production-server"
                    value={newContext.name}
                    onChange={(e) => setNewContext(prev => ({ ...prev, name: e.target.value }))}
                    className="h-9 bg-muted/30 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Remote Host (URL)</label>
                  <Input
                    placeholder="e.g. ssh://user@host or tcp://host:2376"
                    value={newContext.host}
                    onChange={(e) => {
                      setNewContext(prev => ({ ...prev, host: e.target.value }));
                      setConnectionTestResult(null);
                      // Auto-show SSH config when SSH URL is entered
                      if (e.target.value.startsWith('ssh://')) {
                        setShowSshConfig(true);
                      }
                    }}
                    className="h-9 bg-muted/30 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                {newContext.host.startsWith('ssh://') && (
                  <Collapsible open={showSshConfig} onOpenChange={setShowSshConfig}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between h-8 px-2 text-muted-foreground hover:text-foreground">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-semibold uppercase">SSH Key Configuration</span>
                        </div>
                        {showSshConfig ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">SSH Private Key</label>
                        {sshKeys.length > 0 ? (
                          <div className="grid gap-1.5">
                            {sshKeys.map((key) => (
                              <Button
                                key={key.path}
                                variant={selectedSshKey === key.path ? "outline" : "ghost"}
                                className={cn(
                                  "w-full justify-start gap-2 h-9 text-xs",
                                  selectedSshKey === key.path && "bg-primary/5 border-primary/30"
                                )}
                                onClick={() => setSelectedSshKey(selectedSshKey === key.path ? '' : key.path)}
                              >
                                <KeyRound className={cn("w-3 h-3", selectedSshKey === key.path ? "text-primary" : "text-muted-foreground")} />
                                <span className="font-mono truncate">{key.name}</span>
                                {key.has_public_key && (
                                  <span className="text-[9px] text-muted-foreground ml-auto">.pub ✓</span>
                                )}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted-foreground p-2 text-center">
                            No SSH keys found in ~/.ssh/
                          </p>
                        )}
                      </div>
                      {selectedSshKey && (
                        <div className="text-[10px] text-primary bg-primary/5 border border-primary/20 rounded-md p-2">
                          Selected: <span className="font-mono font-bold">{selectedSshKey}</span>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2 mt-2 h-10 font-bold"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection || !newContext.host}
                  >
                    {isTestingConnection ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    Test
                  </Button>
                  <Button
                    className="flex-1 gap-2 mt-2 h-10 font-bold"
                    variant="outline"
                    onClick={handleCreateContext}
                    disabled={isCreatingContext || !newContext.name || !newContext.host}
                  >
                    {isCreatingContext ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Context
                  </Button>
                </div>
                {connectionTestResult && (
                  <div className={cn(
                    "text-[11px] p-2 rounded-md mt-1",
                    connectionTestResult.success
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                  )}>
                    {connectionTestResult.message}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-center text-muted-foreground italic mt-2">
                For SSH connections, select your private key above. The app will configure ~/.ssh/config automatically.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClusterSettings(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAboutDialog} onOpenChange={setShowAboutDialog}>
        <DialogContent className="bg-background border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img src="/dnm-icon.png" alt="DNM Icon" className="w-8 h-8" />
              About Docker NM
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              A native, fast, and lightweight Docker manager for Linux.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Project</span>
                <div className="flex items-center gap-2">
                  {latestVersion && appVersion && compareVersions(latestVersion, appVersion) > 0 && (
                    <span className="text-[10px] font-bold text-blue-500 animate-pulse bg-blue-500/10 px-2 py-0.5 rounded">Update Available</span>
                  )}
                  <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">{appVersion || "v0.0.0"}</span>
                </div>
              </div>
              <div className="grid gap-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-between gap-2 h-11 border-primary/20 hover:bg-primary/5 hover:border-primary/40"
                  onClick={() => openExternalLink('https://github.com/pedrofariasx/dockernativemanager')}
                >
                  <div className="flex items-center gap-3">
                    <Github className="w-4 h-4" />
                    <span className="text-sm font-bold">GitHub Repository</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
                
                {latestVersion && appVersion && compareVersions(latestVersion, appVersion) > 0 ? (
                  <Button 
                    variant="outline" 
                    className="w-full justify-between gap-2 h-11 border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500 animate-in fade-in slide-in-from-bottom-1"
                    onClick={() => {
                      setShowAboutDialog(false);
                      setShowUpdateDialog(true);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-bold text-blue-500">Download Update</span>
                    </div>
                    <Download className="w-3.5 h-3.5 text-blue-500" />
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full justify-between gap-2 h-11 border-sidebar-border hover:bg-sidebar-accent/50"
                    onClick={() => checkForUpdates(false, false)}
                    disabled={isCheckingUpdates}
                  >
                    <div className="flex items-center gap-3">
                      {isCheckingUpdates ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <RotateCw className="w-4 h-4 text-primary" />}
                      <span className="text-sm font-bold">Check for Updates</span>
                    </div>
                  </Button>
                )}
              </div>
            </div>

            <Collapsible className="space-y-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent group">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Contributors</h4>
                  <div className="flex items-center gap-2">
                    {isLoadingContributors && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                    <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-all duration-300 CollapsibleTrigger:open:rotate-180" />
                  </div>
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="animate-in fade-in slide-in-from-top-2">
                <ScrollArea className="h-[180px] w-full rounded-md border border-sidebar-border p-2 bg-muted/10">
                  <div className="grid gap-2">
                    {contributors.map((contributor) => (
                      <div 
                        key={contributor.id} 
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent/30 transition-colors cursor-pointer group/item"
                        onClick={() => openExternalLink(contributor.html_url)}
                      >
                        <Avatar className="h-8 w-8 border border-sidebar-border shrink-0">
                          <AvatarImage src={contributor.avatar_url} />
                          <AvatarFallback>{contributor.login.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-bold truncate">{contributor.login}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {contributor.contributions} contributions
                          </span>
                        </div>
                        <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      </div>
                    ))}
                    {contributors.length === 0 && !isLoadingContributors && (
                      <p className="text-xs text-center text-muted-foreground py-4 italic">
                        No contributors found.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>

    
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAboutDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent className="bg-background border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-blue-500">
              <Sparkles className="w-6 h-6" />
              New version available!
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              A new version of Docker Native Manager is ready. Download the latest release to get the latest features and fixes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-5">
            <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Latest</span>
                <span className="text-xl font-black text-blue-500">{latestVersion}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold text-right">Current</span>
                <span className="text-sm font-bold text-muted-foreground">{appVersion}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                <Package className="w-3 h-3" />
                Available Formats
              </div>
              
              <div className="flex flex-wrap gap-2">
                {latestRelease?.assets?.map((asset: any) => {
                  const name = asset.name.toLowerCase();
                  let extension = "";
                  
                  if (name.endsWith('.appimage')) extension = "AppImage";
                  else if (name.endsWith('.deb')) extension = "DEB";
                  else if (name.endsWith('.rpm')) extension = "RPM";
                  else if (name.endsWith('.tar.gz')) extension = "TAR.GZ";
                  else if (name.endsWith('.zip')) extension = "ZIP";
                  else extension = asset.name.split('.').pop()?.toUpperCase() || "FILE";

                  return (
                    <Button 
                      key={asset.id} 
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 px-3 gap-2 border-sidebar-border hover:border-blue-500/50 hover:bg-blue-500/5 transition-all",
                        downloadingAsset === asset.id && "border-blue-500 bg-blue-500/10 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
                      )}
                      onClick={() => downloadingAsset !== asset.id && handleDownload(asset)}
                      disabled={downloadingAsset !== null && downloadingAsset !== asset.id}
                      title={asset.name}
                    >
                      {downloadingAsset === asset.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                      ) : (
                        <Download className="w-3 h-3 text-blue-500" />
                      )}
                      <span className="text-[11px] font-bold">{extension}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="text-muted-foreground" onClick={() => setShowUpdateDialog(false)}>
              Remind me later
            </Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 font-bold"
              onClick={() => openExternalLink(latestRelease?.html_url)}
            >
              View on GitHub
              <ExternalLink className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Sidebar;
