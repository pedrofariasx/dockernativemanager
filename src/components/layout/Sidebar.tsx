"use client";

import { cn } from "@/lib/utils";
import { 
  LayoutDashboard,
  Box, 
  Layers, 
  Database, 
  Network as NetworkIcon, 
  Settings,
  Circle,
  Trash,
  Loader2,
  Moon,
  Sun,
  Images,
  ImageIcon,
  FileImage,
  ImagePlayIcon,
  Disc,
  Disc2
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { dockerSystemPrune } from "@/lib/docker";
import { showSuccess, showError } from "@/utils/toast";
import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { AvatarImage, Image } from "@radix-ui/react-avatar";

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard },
  { name: "Containers", path: "/containers", icon: Box },
  { name: "Stacks", path: "/stacks", icon: Layers },
  { name: "Images", path: "/images", icon: Disc2 },
  { name: "Volumes", path: "/volumes", icon: Database },
  { name: "Networks", path: "/networks", icon: NetworkIcon },
];

const Sidebar = () => {
  const location = useLocation();
  const [isPruning, setIsPruning] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);
  const { theme, setTheme } = useTheme();

  const handlePrune = async () => {
    if (!confirm("Are you sure you want to prune your Docker system? This will remove all stopped containers, unused networks, and dangling images.")) {
      return;
    }

    setIsPruning(true);
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

  return (
    <div className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col h-screen shrink-0">
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
          onClick={handlePrune}
          disabled={isPruning}
        >
          {isPruning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
          <span className="text-sm font-medium">System Prune</span>
        </Button>

        <div className="bg-sidebar-accent/50 rounded-lg p-3 flex items-center gap-3">
          <Circle className="w-3 h-3 text-emerald-500 fill-emerald-500 animate-pulse" />
          <div className="flex-1 overflow-hidden">
            <p className="text-xs text-sidebar-foreground font-medium">Daemon Status</p>
            <p className="text-[10px] text-muted-foreground truncate">Connected: /var/run/docker.sock</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
