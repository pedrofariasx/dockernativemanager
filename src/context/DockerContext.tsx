import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  getContainers, 
  getStacks, 
  getImages, 
  getVolumes, 
  getNetworks, 
  getSystemInfo,
  Container,
  Stack,
  Image,
  Volume,
  Network,
  SystemInfo
} from '@/lib/docker';
import { useDockerEvent } from '@/hooks/use-docker-events';

interface DockerContextType {
  containers: Container[];
  stacks: Stack[];
  images: Image[];
  volumes: Volume[];
  networks: Network[];
  systemInfo: SystemInfo | null;
  loading: Record<string, boolean>;
  refreshAll: () => Promise<void>;
  refreshContainers: () => Promise<void>;
  refreshStacks: () => Promise<void>;
  refreshImages: () => Promise<void>;
  refreshVolumes: () => Promise<void>;
  refreshNetworks: () => Promise<void>;
  refreshSystemInfo: () => Promise<void>;
}

const DockerContext = createContext<DockerContextType | undefined>(undefined);

export const DockerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [images, setImages] = useState<Image[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
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
      setContainers(data);
    } finally {
      setLoading(prev => ({ ...prev, containers: false }));
    }
  }, []);

  const refreshStacks = useCallback(async () => {
    try {
      const data = await getStacks();
      setStacks(data);
    } finally {
      setLoading(prev => ({ ...prev, stacks: false }));
    }
  }, []);

  const refreshImages = useCallback(async () => {
    try {
      const data = await getImages();
      setImages(data);
    } finally {
      setLoading(prev => ({ ...prev, images: false }));
    }
  }, []);

  const refreshVolumes = useCallback(async () => {
    try {
      const data = await getVolumes();
      setVolumes(data);
    } finally {
      setLoading(prev => ({ ...prev, volumes: false }));
    }
  }, []);

  const refreshNetworks = useCallback(async () => {
    try {
      const data = await getNetworks();
      setNetworks(data);
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
    await Promise.all([
      refreshContainers(),
      refreshStacks(),
      refreshImages(),
      refreshVolumes(),
      refreshNetworks(),
      refreshSystemInfo(),
    ]);
  }, [refreshContainers, refreshStacks, refreshImages, refreshVolumes, refreshNetworks, refreshSystemInfo]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useDockerEvent('all', () => {
    refreshAll();
  });

  return (
    <DockerContext.Provider value={{
      containers,
      stacks,
      images,
      volumes,
      networks,
      systemInfo,
      loading,
      refreshAll,
      refreshContainers,
      refreshStacks,
      refreshImages,
      refreshVolumes,
      refreshNetworks,
      refreshSystemInfo,
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
