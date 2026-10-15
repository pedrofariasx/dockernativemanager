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
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<DockerEventPayload>("docker-event", (event) => {
        if (type === "all" || event.payload.Type === type) {
          callback(event.payload);
        }
      });
    };

    setup().catch((e) => console.error("Error setting up docker event listener:", e));
    return () => {
      if (unlisten) unlisten();
    };
  }, [type, callback]);
}
