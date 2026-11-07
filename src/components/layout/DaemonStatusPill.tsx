/*
 * File: DaemonStatusPill.tsx
 * Project: docker-native-manager
 * Created: 2026-10-27
 *
 */

import { cn } from "@/lib/utils";
import type { DaemonState } from "@/context/DockerContext";

const STATUS: Record<DaemonState, { label: string; dot: string }> = {
  connecting: { label: "Connecting…", dot: "bg-amber-500 animate-pulse" },
  connected: { label: "Connected", dot: "bg-emerald-500" },
  disconnected: { label: "Disconnected", dot: "bg-rose-500" },
};

const DaemonStatusPill = ({ state, contextName }: { state: DaemonState; contextName?: string }) => {
  const { label, dot } = STATUS[state];

  return (
    <span role="status" className="flex items-center gap-2 min-w-0 text-sm text-sidebar-foreground">
      <span aria-hidden="true" className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
      <span className="font-medium shrink-0">{label}</span>
      {contextName && <span className="text-xs text-muted-foreground truncate">· {contextName}</span>}
    </span>
  );
};

export default DaemonStatusPill;
