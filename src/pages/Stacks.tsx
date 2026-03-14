"use client";

import { useEffect, useState, useCallback } from "react";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";
import { getStacks, deployStack, removeStack, getStackCompose, Stack, getContainers } from "@/lib/docker";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";

const Stacks = () => {
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeployDialog, setShowDeployDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [composeContent, setComposeContent] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null);
  const [stackContainers, setStackContainers] = useState<unknown[]>([]);

  const refreshStacks = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const data = await getStacks();
      setStacks(data);
    } catch (err) {
      if (manual) showError("Failed to fetch stacks.");
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshStacks();
    // Maintain a fallback interval just in case
    const interval = setInterval(() => refreshStacks(false), 60000);
    return () => clearInterval(interval);
  }, [refreshStacks]);

  useDockerEvent("all", () => refreshStacks(false));

  const handleDelete = async (name: string) => {
    try {
      await removeStack(name);
      showSuccess(`Stack ${name} removal initiated`);
      refreshStacks(true);
    } catch (err) {
      showError(`Error removing stack ${name}: ${err}`);
    }
  };

  const handleDeploy = async () => {
    if (!newName || !composeContent) return;
    setIsDeploying(true);
    try {
      await deployStack(newName, composeContent);
      showSuccess(`Stack ${newName} deployment initiated`);
      setShowDeployDialog(false);
      setNewName("");
      setComposeContent("");
      refreshStacks(true);
    } catch (err) {
      showError(`Error deploying stack: ${err}`);
    } finally {
      setIsDeploying(false);
    }
  };

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

  const filtered = stacks.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8">
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
              onClick={() => refreshStacks(true)}
              disabled={isRefreshing}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowDeployDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Deploy Stack
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search stacks..." 
            className="bg-card border-border text-foreground pl-10 focus-visible:ring-blue-600 h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-card/80">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground font-medium">Name</TableHead>
                <TableHead className="text-muted-foreground font-medium">Status</TableHead>
                <TableHead className="text-muted-foreground font-medium">Services</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.name} className="border-border hover:bg-muted transition-colors">
                  <TableCell className="font-semibold text-foreground">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      {s.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono uppercase border",
                      s.status === "running" 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                        : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    )}>
                      {s.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3 h-3" />
                      {s.services} services
                    </div>
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
                        <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => openStackDetails(s)}>
                          <Eye className="mr-2 h-4 w-4 text-emerald-500" />
                          <span>View Details</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-muted focus:bg-muted cursor-pointer" onClick={() => handleEdit(s)}>
                          <Layers className="mr-2 h-4 w-4 text-indigo-500" />
                          <span>Edit Stack</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem onClick={() => handleDelete(s.name)} className="text-rose-500 focus:text-rose-500 focus:bg-rose-500/10 hover:bg-rose-500/10 cursor-pointer">
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete Stack</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
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
                  <div key={c.id} className="flex items-center justify-between p-2 rounded border border-border bg-background/50">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-foreground">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{c.image}</span>
                    </div>
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold",
                      c.status === "running" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted-500/10 text-muted-foreground border-muted-500/20"
                    )}>
                      {c.status}
                    </span>
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

      <Dialog open={showDeployDialog} onOpenChange={(open) => {
        setShowDeployDialog(open);
        if (!open) {
          setIsEditing(false);
          setNewName("");
          setComposeContent("");
        }
      }}>
        <DialogContent className="bg-background border-border text-foreground max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Stack" : "Deploy New Stack"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Stack Name</Label>
              <Input
                id="name"
                placeholder="e.g. my-awesome-app"
                className="bg-card border-border text-foreground"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={isDeploying || isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compose">docker-compose.yaml</Label>
              <Textarea 
                id="compose"
                placeholder="version: '3'..." 
                className="bg-card border-border text-foreground font-mono text-xs min-h-[300px]"
                value={composeContent}
                onChange={(e) => setComposeContent(e.target.value)}
                disabled={isDeploying}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-rose-900/50 text-rose-500 hover:bg-rose-950/30 hover:text-rose-400" onClick={() => setShowDeployDialog(false)} disabled={isDeploying}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handleDeploy} disabled={isDeploying || !newName || !composeContent}>
              {isDeploying ? "Deploying..." : (isEditing ? "Update Stack" : "Deploy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Stacks;
