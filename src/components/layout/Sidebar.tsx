/*
 * File: Sidebar.tsx
 * Project: docker-native-manager
 * Created: 2026-03-14
 * Author: Pedro Farias
 * 
 * Last Modified: Thu Mar 19 2026
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
  Plus
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
  type DockerContext
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
  const { isConnected, manageService, refreshAll } = useDocker();
  const [isPruning, setIsPruning] = useState(false);
  const [isManagingService, setIsManagingService] = useState(false);
  const [showPruneDialog, setShowPruneDialog] = useState(false);
  const [showClusterSettings, setShowClusterSettings] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [contexts, setContexts] = useState<DockerContext[]>([]);
  const [isRefreshingContexts, setIsRefreshingContexts] = useState(false);
  const [isCreatingContext, setIsCreatingContext] = useState(false);
  const [newContext, setNewContext] = useState({ name: '', host: '' });

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
  }, [showClusterSettings]);

  const handleSwitchContext = async (name: string) => {
    try {
      await useDockerContext(name);
      showSuccess(`Switched to context: ${name}`);
      await fetchContexts();
      // Trigger app-wide refresh
      await refreshAll();
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
      await createDockerContext(newContext.name, newContext.host);
      showSuccess(`Context ${newContext.name} created`);
      setNewContext({ name: '', host: '' });
      await fetchContexts();
    } catch (err) {
      showError(`Error creating context: ${err}`);
    } finally {
      setIsCreatingContext(false);
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
          <div>
            <h1 className="text-sidebar-foreground font-bold text-lg leading-none">Docker NM</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{appVersion ? `${appVersion}` : ""}</p>
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
              <Circle className={cn(
                "w-3 h-3 animate-pulse",
                isConnected ? "text-emerald-500 fill-emerald-500" : "text-rose-500 fill-rose-500"
              )} />
              <div className="flex-1 overflow-hidden">
                <p className="text-xs text-sidebar-foreground font-medium">Daemon Status</p>
                <div className="flex items-center gap-1 overflow-hidden">
                  <p className={cn(
                    "text-[10px] truncate font-semibold transition-colors shrink-0",
                    isConnected ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {isConnected ? "Connected" : "Disconnected"}
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
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 bg-background/50 hover:bg-primary/20 hover:text-primary ml-auto"
                    onClick={() => setShowClusterSettings(true)}
                    title="Cluster Configuration"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 w-full gap-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20"
                  onClick={() => handleServiceAction('start')}
                  disabled={isManagingService}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">Start Daemon</span>
                </Button>
              )}
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
                    onChange={(e) => setNewContext(prev => ({ ...prev, host: e.target.value }))}
                    className="h-9 bg-muted/30 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <Button
                  className="w-full gap-2 mt-2 h-10 font-bold"
                  variant="outline"
                  onClick={handleCreateContext}
                  disabled={isCreatingContext || !newContext.name || !newContext.host}
                >
                  {isCreatingContext ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Context
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground italic">
                Remote SSH management is recommended for better security.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowClusterSettings(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Sidebar;
