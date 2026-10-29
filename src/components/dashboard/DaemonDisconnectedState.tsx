/*
 * File: DaemonDisconnectedState.tsx
 * Project: docker-native-manager
 * Created: 2026-10-27
 *
 */

import { useState } from "react";
import { Loader2, Play, RotateCw, Unplug } from "lucide-react";
import { useDocker } from "@/context/DockerContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DaemonDisconnectedState = () => {
  const { manageService, serviceAction, isManagingService, connectionError } = useDocker();
  const isStarting = serviceAction === "start";
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center text-center py-24 animate-in fade-in duration-500">
      <div className="w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center mb-5">
        <Unplug aria-hidden="true" className="w-6 h-6 text-rose-500" />
      </div>
      <h3 className="text-xl font-semibold text-foreground">Docker isn't running</h3>
      <p className="text-muted-foreground mt-2 max-w-sm">
        Start the daemon to see your containers, images, and system stats.
      </p>

      <div className="flex items-center gap-3 mt-6">
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => manageService("start")}
          disabled={isManagingService}
          title="Executes 'systemctl start docker' to bring the service online"
        >
          {isStarting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
          {isStarting ? "Starting…" : "Start daemon"}
        </Button>
        <Button
          variant="outline"
          onClick={() => manageService("reconnect")}
          disabled={isManagingService}
          title="Attempts to reconnect to the Docker socket without restarting the system service"
        >
          <RotateCw aria-hidden="true" className={cn(serviceAction === "reconnect" && "animate-spin")} />
          Retry
        </Button>
      </div>

      <button
        type="button"
        className="mt-5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
        aria-expanded={showDetails}
        onClick={() => setShowDetails((v) => !v)}
      >
        {showDetails ? "Hide details" : "Show details"}
      </button>
      {showDetails && (
        <pre className="mt-3 max-w-xl whitespace-pre-wrap break-all rounded-md border border-border bg-muted/50 px-4 py-3 text-left font-mono text-xs text-muted-foreground">
          {connectionError ?? "No error details available."}
        </pre>
      )}
    </div>
  );
};

export default DaemonDisconnectedState;
