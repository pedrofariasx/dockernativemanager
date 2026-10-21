/*
 * File: AppLayout.tsx
 * Project: docker-native-manager
 * Created: 2026-03-13
 *
 * Last Modified: Thu Jul 17 2026
 * Modified By: Pedro Farias
 *
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./Sidebar";
import { X, Minus, Square } from "lucide-react";
import { useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Resize handle configuration
const RESIZE_EDGE_SIZE = 6; // px - thickness of edge resize handles
const RESIZE_CORNER_SIZE = 12; // px - size of corner resize handles

type ResizeDirection = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";

const RESIZE_HANDLES: { direction: ResizeDirection; style: React.CSSProperties }[] = [
  // Edges
  {
    direction: "North",
    style: {
      top: 0,
      left: RESIZE_CORNER_SIZE,
      right: RESIZE_CORNER_SIZE,
      height: RESIZE_EDGE_SIZE,
      cursor: "n-resize",
    },
  },
  {
    direction: "South",
    style: {
      bottom: 0,
      left: RESIZE_CORNER_SIZE,
      right: RESIZE_CORNER_SIZE,
      height: RESIZE_EDGE_SIZE,
      cursor: "s-resize",
    },
  },
  {
    direction: "West",
    style: {
      left: 0,
      top: RESIZE_CORNER_SIZE,
      bottom: RESIZE_CORNER_SIZE,
      width: RESIZE_EDGE_SIZE,
      cursor: "w-resize",
    },
  },
  {
    direction: "East",
    style: {
      right: 0,
      top: RESIZE_CORNER_SIZE,
      bottom: RESIZE_CORNER_SIZE,
      width: RESIZE_EDGE_SIZE,
      cursor: "e-resize",
    },
  },
  // Corners
  {
    direction: "NorthWest",
    style: { top: 0, left: 0, width: RESIZE_CORNER_SIZE, height: RESIZE_CORNER_SIZE, cursor: "nw-resize" },
  },
  {
    direction: "NorthEast",
    style: { top: 0, right: 0, width: RESIZE_CORNER_SIZE, height: RESIZE_CORNER_SIZE, cursor: "ne-resize" },
  },
  {
    direction: "SouthWest",
    style: { bottom: 0, left: 0, width: RESIZE_CORNER_SIZE, height: RESIZE_CORNER_SIZE, cursor: "sw-resize" },
  },
  {
    direction: "SouthEast",
    style: { bottom: 0, right: 0, width: RESIZE_CORNER_SIZE, height: RESIZE_CORNER_SIZE, cursor: "se-resize" },
  },
];

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const lastPointerRef = useRef(0);

  const handleResizeDrag = useCallback(async (direction: ResizeDirection, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await getCurrentWindow().startResizeDragging(direction);
    } catch (err) {
      console.error(`Failed to start resize dragging (${direction})`, err);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [pathname]);

  useEffect(() => {
    let unlisten: () => void;

    const setupListener = async () => {
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
      {/* Programmatic resize handles for Wayland compatibility (KDE Plasma 6, etc.) */}
      {!isMaximized &&
        RESIZE_HANDLES.map(({ direction, style }) => (
          <div
            key={direction}
            style={{
              position: "fixed",
              zIndex: 9999,
              background: "transparent",
              ...style,
            }}
            onPointerDown={(e) => handleResizeDrag(direction, e)}
          />
        ))}

      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        {/* Full Header Drag Handle */}
        <div
          className="h-12 border-b border-border/50 bg-background/50 flex items-center justify-between px-4 select-none shrink-0 cursor-default backdrop-blur-md"
          onPointerDown={async (e) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest("button") !== null) return;

            const now = Date.now();
            const isDouble = now - lastPointerRef.current < 300 && lastPointerRef.current !== 0;
            lastPointerRef.current = now;

            if (isDouble) {
              await getCurrentWindow()[isMaximized ? "unmaximize" : "maximize"]();
              return;
            }

            const startX = e.clientX;
            const startY = e.clientY;
            let dragged = false;

            const onMove = (me: PointerEvent) => {
              if (dragged) return;
              const dx = Math.abs(me.clientX - startX);
              const dy = Math.abs(me.clientY - startY);
              if (dx > 5 || dy > 5) {
                dragged = true;
                getCurrentWindow().startDragging().catch(console.error);
                onUp();
              }
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
            };

            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
        >
          <div className="flex items-center gap-2 pointer-events-none">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
              Docker Native Manager
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
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
