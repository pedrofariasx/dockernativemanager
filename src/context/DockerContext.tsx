/*
 * File: DockerContext.tsx
 * Project: docker-native-manager
 * Created: 2026-03-14
 * Author: Pedro Farias
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 * Copyright (c) 2026 Pedro Farias
 * License: MIT
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { showSuccess, showError } from '@/utils/toast';
import { 
  getContainers, 
  getStacks, 
  getImages, 
  getVolumes, 
  getNetworks, 
  getSystemInfo,
  pullImage,
  deployStack,
  manageDockerService,
  Container,
  Stack,
  Image,
  Volume,
  Network,
  SystemInfo
} from '@/lib/docker';
import { useDockerEvent } from '@/hooks/use-docker-events';

export interface DockerEvent {
  time: Date;
  type: string;
  action: string;
  id: string;
  from?: string;
  status?: string;
  attributes?: Record<string, string>;
}

export interface HostStats {
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  disk_read_bytes: number;
  disk_write_bytes: number;
  net_rx_bytes: number;
  net_tx_bytes: number;
}

interface DockerContextType {
  containers: Container[];
  stacks: Stack[];
  images: Image[];
  volumes: Volume[];
  networks: Network[];
  systemInfo: SystemInfo | null;
  events: DockerEvent[];
  hostStats: HostStats | null;
  hostStatsHistory: HostStats[];
  isConnected: boolean;
  isManagingService: boolean;
  loading: Record<string, boolean>;
  refreshAll: () => Promise<void>;
  refreshContainers: () => Promise<void>;
  refreshStacks: () => Promise<void>;
  refreshImages: () => Promise<void>;
  refreshVolumes: () => Promise<void>;
  refreshNetworks: () => Promise<void>;
  refreshSystemInfo: () => Promise<void>;
  pullingImages: Record<string, { status: string; progress: number | null }>;
  pullImageBackground: (imageName: string) => Promise<void>;
  deployingStacks: Record<string, { status: string }>;
  deployStackBackground: (name: string, composeContent: string, envContent: string | null, stackType?: string) => Promise<void>;
  manageService: (action: 'start' | 'stop' | 'restart' | 'reconnect') => Promise<void>;
}

const DockerContext = createContext<DockerContextType | undefined>(undefined);

export const DockerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const [hostStats, setHostStats] = useState<HostStats | null>(null);
  const [hostStatsHistory, setHostStatsHistory] = useState<HostStats[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isManagingService, setIsManagingService] = useState<boolean>(false);
  const [pullingImages, setPullingImages] = useState<Record<string, { status: string; progress: number | null }>>({});
  const [deployingStacks, setDeployingStacks] = useState<Record<string, { status: string }>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({
    containers: true,
    stacks: true,
    images: true,
    volumes: true,
    networks: true,
    systemInfo: true,
  });

  const refreshContainers = useCallback(async () => {
    try {
      const data = await getContainers();
      // Only update if data actually changed
      setContainers(prev => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(data);
        if (prevJson === newJson) return prev;
        return data;
      });
    } finally {
      setLoading(prev => ({ ...prev, containers: false }));
    }
  }, []);

  const refreshStacks = useCallback(async () => {
    try {
      const data = await getStacks();
      // Only update if data actually changed
      setStacks(prev => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(data);
        if (prevJson === newJson) return prev;
        return data;
      });
    } finally {
      setLoading(prev => ({ ...prev, stacks: false }));
    }
  }, []);

  const refreshImages = useCallback(async () => {
    try {
      const data = await getImages();
      // Only update if data actually changed
      setImages(prev => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(data);
        if (prevJson === newJson) return prev;
        return data;
      });
    } finally {
      setLoading(prev => ({ ...prev, images: false }));
    }
  }, []);

  const refreshVolumes = useCallback(async () => {
    try {
      const data = await getVolumes();
      // Only update if data actually changed
      setVolumes(prev => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(data);
        if (prevJson === newJson) return prev;
        return data;
      });
    } finally {
      setLoading(prev => ({ ...prev, volumes: false }));
    }
  }, []);

  const refreshNetworks = useCallback(async () => {
    try {
      const data = await getNetworks();
      // Only update if data actually changed
      setNetworks(prev => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(data);
        if (prevJson === newJson) return prev;
        return data;
      });
    } finally {
      setLoading(prev => ({ ...prev, networks: false }));
    }
  }, []);

  const refreshSystemInfo = useCallback(async () => {
    try {
      const data = await getSystemInfo();
      setSystemInfo(data);
    } finally {
      setLoading(prev => ({ ...prev, systemInfo: false }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    // We check state directly here without making it a dependency of the hook
    // to avoid infinite loops when state changes.
    // However, to keep it simple and reactive we'll keep the dependencies
    // but remove the useEffect that calls it blindly.

    try {
      await Promise.all([
        refreshContainers().catch(() => {}),
        refreshStacks().catch(() => {}),
        refreshImages().catch(() => {}),
        refreshVolumes().catch(() => {}),
        refreshNetworks().catch(() => {}),
        refreshSystemInfo().catch(() => {}),
      ]);
    } catch (err) {
      console.error("Error refreshing Docker data:", err);
    }
  }, [refreshContainers, refreshStacks, refreshImages, refreshVolumes, refreshNetworks, refreshSystemInfo]);

  const pullImageBackground = useCallback(async (imageName: string) => {
    const fullImageName = imageName.includes(':') ? imageName : `${imageName}:latest`;
    
    // Check if already pulling
    if (pullingImages[fullImageName]) return;

    setPullingImages(prev => ({
      ...prev,
      [fullImageName]: { status: 'Starting...', progress: null }
    }));

    let unlisten: (() => void) | undefined;

    try {
      unlisten = await listen<{ status?: string; progressDetail?: { current?: number; total?: number } }>(
        `pull-progress-${fullImageName}`,
        (event) => {
          const { status, progressDetail } = event.payload;
          setPullingImages(prev => ({
            ...prev,
            [fullImageName]: {
              status: status || prev[fullImageName]?.status || 'Pulling...',
              progress: (progressDetail?.current && progressDetail?.total) 
                ? Math.round((progressDetail.current / progressDetail.total) * 100)
                : prev[fullImageName]?.progress
            }
          }));
        }
      );

      await pullImage(imageName);
      showSuccess(`Image ${imageName} pulled successfully`);
      refreshImages();
    } catch (err) {
      showError(`Failed to pull image ${imageName}: ${err}`);
    } finally {
      if (unlisten) unlisten();
      setPullingImages(prev => {
        const next = { ...prev };
        delete next[fullImageName];
        return next;
      });
    }
  }, [pullingImages, refreshImages]);

  const deployStackBackground = useCallback(async (name: string, composeContent: string, envContent: string | null, stackType: string = "Compose") => {
    if (deployingStacks[name]) return;

    setDeployingStacks(prev => ({
      ...prev,
      [name]: { status: 'Deploying...' }
    }));

    try {
      await deployStack(name, composeContent, envContent, stackType);
      showSuccess(`Stack ${name} deployed successfully`);
      refreshStacks();
    } catch (err) {
      showError(`Failed to deploy stack ${name}: ${err}`);
    } finally {
      setDeployingStacks(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }, [deployingStacks, refreshStacks]);

  const manageService = useCallback(async (action: 'start' | 'stop' | 'restart' | 'reconnect') => {
    setIsManagingService(true);
    setLoading(prev => ({ ...prev, systemInfo: true }));
    try {
      const result = await manageDockerService(action);
      showSuccess(result);
      
      if (action === 'stop') {
        setIsConnected(false);
        // Clear data immediately
        setContainers([]);
        setStacks([]);
        setImages([]);
        setVolumes([]);
        setNetworks([]);
        setSystemInfo(null);
        setHostStats(null);
        setHostStatsHistory([]);
      } else {
        // Only refresh if starting, restarting or reconnecting
        const delay = action === 'reconnect' ? 500 : 3000;
        setTimeout(refreshAll, delay);
      }
    } catch (err) {
      showError(`Failed to ${action} Docker service: ${err}`);
      setLoading(prev => ({ ...prev, systemInfo: false }));
    } finally {
      setIsManagingService(false);
    }
  }, [refreshAll]);

  useEffect(() => {
    // Initial load
    refreshAll();
  }, []); // Only once on mount

  useDockerEvent('all', useCallback((event) => {
    // Optimization: Don't refresh EVERYTHING for every event immediately.
    // Maybe only refresh relevant parts based on event.Type
    const type = event?.Type?.toLowerCase();
    
    if (type === 'container') {
      refreshContainers();
      refreshSystemInfo();
    } else if (type === 'image') {
      refreshImages();
      refreshSystemInfo();
    } else if (type === 'volume') {
      refreshVolumes();
      refreshSystemInfo();
    } else if (type === 'network') {
      refreshNetworks();
    } else {
      refreshAll();
    }

    if (event) {
      setEvents((prev) => {
        const newEvents = [{
          time: new Date(),
          type: event.Type || "system",
          action: event.Action || "unknown",
          id: event.Actor?.ID || "",
          from: event.From || event.from, // Handle different casing just in case
          status: event.status || event.Status,
          attributes: event.Actor?.Attributes || {}
        }, ...prev];
        return newEvents.slice(0, 20); // keep last 20
      });
    }
  }, [refreshContainers, refreshImages, refreshVolumes, refreshNetworks, refreshSystemInfo, refreshAll]));

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<HostStats>("host-stats", (event) => {
        setHostStats(event.payload);
        setHostStatsHistory(prev => {
          const newHistory = [...prev, event.payload];
          if (newHistory.length > 30) return newHistory.slice(1);
          return newHistory;
        });
      });
    };

    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await listen<boolean>("docker-connection-status", (event) => {
        const newStatus = event.payload;
        
        setIsConnected(prev => {
          if (prev === false && newStatus === true) {
            // Only refresh when transitioned from disconnected to connected
            refreshAll();
          }
          return newStatus;
        });

        if (!newStatus) {
          // Clear data on disconnect to reflect status accurately
          setContainers([]);
          setStacks([]);
          setImages([]);
          setVolumes([]);
          setNetworks([]);
          setSystemInfo(null);
          setHostStats(null);
          setHostStatsHistory([]);
        }
      });
    };

    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshAll]);

  return (
    <DockerContext.Provider value={{
      containers,
      stacks,
      images,
      volumes,
      networks,
      systemInfo,
      events,
      hostStats,
      hostStatsHistory,
      isConnected,
      isManagingService,
      loading,
      refreshAll,
      refreshContainers,
      refreshStacks,
      refreshImages,
      refreshVolumes,
      refreshNetworks,
      refreshSystemInfo,
      pullingImages,
      pullImageBackground,
      deployingStacks,
      deployStackBackground,
      manageService,
    }}>
      {children}
    </DockerContext.Provider>
  );
};

export const useDocker = () => {
  const context = useContext(DockerContext);
  if (context === undefined) {
    throw new Error('useDocker must be used within a DockerProvider');
  }
  return context;
};
