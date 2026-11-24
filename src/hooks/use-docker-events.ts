import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export interface DockerEventPayload {
  Type?: string;
  Action?: string;
  Actor?: {
    ID?: string;
    Attributes?: Record<string, string>;
  };
  From?: string;
  from?: string;
  status?: string;
  Status?: string;
}

export function useDockerEvent(
  type: "container" | "image" | "volume" | "network" | "all",
  callback: (event?: DockerEventPayload) => void,
) {
  useEffect(() => {
    const unlistenPromise = listen<DockerEventPayload>("docker-event", (event) => {
      if (type === "all" || event.payload.Type === type) {
        callback(event.payload);
      }
    }).catch((e) => {
      console.error("Error setting up docker event listener:", e);
      return undefined;
    });

    return () => {
      void unlistenPromise.then((unlisten) => {
        unlisten?.();
      });
    };
  }, [type, callback]);
}
