"use client";

import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { cn } from "@/lib/utils";
import { getImages, deleteImage, pullImage, Image, inspectImage } from "@/lib/docker";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";

interface PullProgressPayload {
  status?: string;
  progress?: string;
  progressDetail?: {
    current?: number;
    total?: number;
  };
}

const Images = () => {
  const [images, setImages] = useState<Image[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullImageUrl, setPullImageUrl] = useState("");
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const [inspectData, setInspectData] = useState("");
  const [pullStatus, setPullStatus] = useState<string>("");
  const [pullProgress, setPullProgress] = useState<number | null>(null);

  const refreshImages = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await getImages();
      setImages(data);
    } catch (err) {
      showError("Failed to fetch images.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshImages();
  }, [refreshImages]);

  useDockerEvent("image", refreshImages);

  const handleDelete = async (id: string, repo: string) => {
    try {
      await deleteImage(id);
      showSuccess(`Image ${repo} deleted`);
      refreshImages();
    } catch (err) {
      showError(`Error deleting image ${repo}`);
    }
  };

  const handlePull = async () => {
    if (!pullImageUrl) return;
    setIsPulling(true);
    setPullStatus("Starting pull...");
    setPullProgress(null);

    let unlisten: (() => void) | undefined;
    
    try {
      // Generate the expected full name for event listening
      const fullImageName = pullImageUrl.includes(':') ? pullImageUrl : `${pullImageUrl}:latest`;
      
      unlisten = await listen<PullProgressPayload>(`pull-progress-${fullImageName}`, (event) => {
        const { status, progressDetail } = event.payload;
        if (status) setPullStatus(status);
        
        if (progressDetail?.current && progressDetail?.total) {
          const percent = Math.round((progressDetail.current / progressDetail.total) * 100);
          setPullProgress(percent);
        }
      });

      await pullImage(pullImageUrl);
      showSuccess(`Image ${pullImageUrl} pulled successfully`);
      setShowPullDialog(false);
      setPullImageUrl("");
      refreshImages();
    } catch (err) {
      showError(`Failed to pull image: ${err}`);
    } finally {
      setIsPulling(false);
      setPullStatus("");
      setPullProgress(null);
      if (unlisten) unlisten();
    }
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

  const filtered = images.filter(img =>
    img.repository.toLowerCase().includes(search.toLowerCase()) ||
    img.tag.toLowerCase().includes(search.toLowerCase())
  );

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

  return (
    <div className="p-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Images</h2>
            <p className="text-muted-foreground mt-1">Manage local Docker images and pull new ones.</p>
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
              onClick={refreshImages}
              disabled={isRefreshing}
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", isRefreshing && "animate-spin")} />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowPullDialog(true)}>
              <Download className="w-4 h-4 mr-2" />
              Pull Image
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search images..." 
            className="bg-card border-border text-foreground pl-10 focus-visible:ring-blue-600 h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                <TableHead className="text-muted-foreground font-medium">Repository</TableHead>
                <TableHead className="text-muted-foreground font-medium">Tag</TableHead>
                <TableHead className="text-muted-foreground font-medium">Image ID</TableHead>
                <TableHead className="text-muted-foreground font-medium">Size</TableHead>
                <TableHead className="text-muted-foreground font-medium text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                  <TableCell className="font-semibold text-foreground">{img.repository}</TableCell>
                  <TableCell>
                    <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded border border-border font-mono">
                      {img.tag}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{img.id}</TableCell>
                  <TableCell className="text-muted-foreground text-xs flex items-center gap-2">
                    <HardDrive className="w-3 h-3 text-muted-foreground" />
                    {img.size}
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
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

      <Dialog open={showPullDialog} onOpenChange={(open) => {
        if (!isPulling) setShowPullDialog(open);
      }}>
        <DialogContent className="bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Pull New Image</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Input
              placeholder="e.g. nginx:latest or ubuntu"
              className="bg-card border-border text-foreground"
              value={pullImageUrl}
              onChange={(e) => setPullImageUrl(e.target.value)}
              disabled={isPulling}
            />
            
            {isPulling && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{pullStatus}</span>
                  {pullProgress !== null && <span className="text-blue-400 font-mono">{pullProgress}%</span>}
                </div>
                {pullProgress !== null ? (
                  <Progress value={pullProgress} className="h-1.5" />
                ) : (
                  <Progress value={100} className="h-1.5 animate-pulse" />
                )}
              </div>
            )}
            
            {!isPulling && (
              <p className="text-xs text-muted-foreground mt-2">
                Enter the image name and tag to pull from Docker Hub.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-rose-900/50 text-rose-500 hover:bg-rose-950/30 hover:text-rose-400" onClick={() => setShowPullDialog(false)} disabled={isPulling}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-foreground" onClick={handlePull} disabled={isPulling || !pullImageUrl}>
              {isPulling ? "Pulling..." : "Pull Image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Images;
