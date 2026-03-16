/*
 * File: AppLayout.tsx
 * Project: docker-native-manager
 * Created: 2026-03-13
 * 
 * Last Modified: Mon Mar 16 2026
 * Modified By: Pedro Farias
 * 
 */

"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import { X, Minus, Square } from "lucide-react";
import { useLocation } from "react-router-dom";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [pathname]);

  useEffect(() => {
    let unlisten: () => void;
    
    const setupListener = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      
      const updateMaximized = async () => {
        const maximized = await win.isMaximized();
        setIsMaximized(maximized);
        if (maximized) {
          document.documentElement.classList.add("maximized");
        } else {
          document.documentElement.classList.remove("maximized");
        }
      };

      // Initial state
      await updateMaximized();

      // Listen for resize events to detect maximization
      const unlistenResized = await win.onResized(async () => {
        await updateMaximized();
      });
      
      unlisten = unlistenResized;
    };

    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div
      id="root-container"
      className="flex h-full w-full bg-background overflow-hidden transition-colors duration-300 relative"
    >
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        {/* Full Header Drag Handle */}
        <div
          data-tauri-drag-region
          className="h-12 border-b border-border/50 bg-background/50 flex items-center justify-between px-4 select-none shrink-0 cursor-default backdrop-blur-md"
          onDoubleClick={async () => {
            const { getCurrentWindow } = await import("@tauri-apps/api/window");
            await getCurrentWindow().toggleMaximize();
          }}
          onPointerDown={async (e) => {
            // Only drag on left click and avoid triggering on buttons
            if (e.buttons === 1 && (e.target as HTMLElement).closest('button') === null) {
              try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().startDragging();
              } catch (err) {
                console.error("Failed to start dragging", err);
              }
            }
          }}
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Docker Native Manager</span>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().minimize();
              }}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground relative z-50"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().toggleMaximize();
              }}
              className="p-1.5 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground relative z-50"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().close();
              }}
              className="p-1.5 hover:bg-destructive/20 hover:text-destructive rounded-md transition-colors text-muted-foreground relative z-50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;