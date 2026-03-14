"use client";

import Sidebar from "./Sidebar";
import { X, Minus, Square } from "lucide-react";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className="flex h-screen bg-background border border-border/50 rounded-xl overflow-hidden shadow-2xl transition-colors duration-300"
    >
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden relative">
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

        <div className="flex-1 overflow-auto relative">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;