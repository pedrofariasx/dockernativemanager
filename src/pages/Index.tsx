/*
 * File: Index.tsx
 * Project: docker-native-manager
 * Created: 2026-03-14
 * Author: Pedro Farias
 *
 * Last Modified: Mon Mar 16 2026
 * Modified By: Pedro Farias
 *
 * Copyright (c) 2026 Pedro Farias
 * License: MIT
 */

import { useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useDocker } from "@/context/DockerContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/utils";
import {
  Box,
  Layers,
  Activity,
  Info,
  Network,
  Database,
  Cpu,
  HardDrive,
  MemoryStick,
  Disc2,
  Container,
  AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, LineChart, Line } from "recharts";

const Index = () => {
  const {
    systemInfo: info,
    volumes,
    networks,
    events,
    hostStats,
    hostStatsHistory,
    isConnected,
    loading,
    hasLoadedOnce,
    manageService,
  } = useDocker();

  const containersIcon = useMemo(() => <Box className="w-5 h-5 text-blue-500" />, []);
  const imagesIcon = useMemo(() => <Disc2 className="w-5 h-5 text-emerald-500" />, []);
  const volumesIcon = useMemo(() => <Database className="w-5 h-5 text-amber-500" />, []);
  const networksIcon = useMemo(() => <Network className="w-5 h-5 text-purple-500" />, []);

  const cpuIcon = useMemo(() => <Cpu className="w-5 h-5 text-orange-500" />, []);
  const memIcon = useMemo(() => <MemoryStick className="w-5 h-5 text-cyan-500" />, []);
  const diskIcon = useMemo(() => <HardDrive className="w-5 h-5 text-pink-500" />, []);
  const netIcon = useMemo(() => <Network className="w-5 h-5 text-indigo-500" />, []);

  const chartData = info
    ? [
        { name: "Running", value: info.containers_running, color: "#10b981" },
        { name: "Stopped", value: info.containers_stopped, color: "#f43f5e" },
        { name: "Paused", value: info.containers_paused, color: "#f59e0b" },
      ].filter((d) => d.value > 0)
    : [];

  const isInitialLoading = isConnected && loading.systemInfo && !info;

  const cpuChartData = useMemo(() => hostStatsHistory.map((h) => ({ val: h.cpu_usage })), [hostStatsHistory]);
  const memoryChartData = useMemo(() => hostStatsHistory.map((h) => ({ val: h.memory_used })), [hostStatsHistory]);
  const diskChartData = useMemo(
    () => hostStatsHistory.map((h) => ({ read: h.disk_read_bytes, write: h.disk_write_bytes })),
    [hostStatsHistory],
  );
  const netChartData = useMemo(
    () => hostStatsHistory.map((h) => ({ down: h.net_rx_bytes, up: h.net_tx_bytes })),
    [hostStatsHistory],
  );

  const cpuSeries = useMemo(() => [{ key: "val", color: "#f97316" }], []);
  const memorySeries = useMemo(() => [{ key: "val", color: "#06b6d4" }], []);
  const diskSeries = useMemo(
    () => [
      { key: "read", color: "#10b981" },
      { key: "write", color: "#f43f5e" },
    ],
    [],
  );
  const netSeries = useMemo(
    () => [
      { key: "down", color: "#3b82f6" },
      { key: "up", color: "#a855f7" },
    ],
    [],
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground mt-1">System overview and Docker daemon status.</p>
        </div>
      </div>

      {hasLoadedOnce && !isConnected && (
        <Alert
          variant="destructive"
          className="bg-destructive/10 dark:bg-destructive/20 border-destructive/20 dark:border-destructive/40 animate-in fade-in slide-in-from-top-4 duration-500 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md"
        >
          <div className="flex gap-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive dark:text-rose-500" />
            <div>
              <AlertTitle className="text-destructive dark:text-rose-500 font-bold text-base">
                Docker Daemon Disconnected
              </AlertTitle>
              <AlertDescription className="text-destructive/90 dark:text-rose-400 font-semibold">
                The application is unable to connect to the Docker daemon. Please ensure Docker is running and the
                socket is accessible.
              </AlertDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="default"
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-none shadow-sm shadow-emerald-900/20 font-bold"
              onClick={() => manageService("start")}
              title="Executes 'systemctl start docker' to bring the service online"
            >
              Start Service
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-background/50 dark:bg-background/20 border-destructive/30 dark:border-rose-500/30 hover:bg-background text-destructive dark:text-rose-400 font-bold"
              onClick={() => manageService("reconnect")}
              title="Attempts to reconnect to the Docker socket without restarting the system service"
            >
              Refresh Connection
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Containers"
          value={isConnected ? info?.containers : 0}
          subtext={
            isConnected
              ? `${info?.containers_running} running, ${info?.containers_stopped} stopped`
              : "0 running, 0 stopped"
          }
          icon={containersIcon}
          loading={isInitialLoading}
          to="/containers"
        />
        <StatCard
          title="Images"
          value={isConnected ? info?.images : 0}
          subtext="Total images on disk"
          icon={imagesIcon}
          loading={isInitialLoading}
          to="/images"
        />
        <StatCard
          title="Volumes"
          value={isConnected ? volumes.length : 0}
          subtext="Local storage volumes"
          icon={volumesIcon}
          loading={isConnected && loading.volumes && volumes.length === 0}
          to="/volumes"
        />
        <StatCard
          title="Networks"
          value={isConnected ? networks.length : 0}
          subtext="Docker networks"
          icon={networksIcon}
          loading={isConnected && loading.networks && networks.length === 0}
          to="/networks"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="CPU Usage"
          value={isConnected && hostStats ? `${hostStats.cpu_usage.toFixed(1)}%` : "0%"}
          subtext={isConnected ? `${info?.ncpu} Cores active` : "Monitoring suspended"}
          icon={cpuIcon}
          loading={isConnected && !hostStats && isInitialLoading}
          chartData={cpuChartData}
          series={cpuSeries}
        />
        <StatCard
          title="Memory"
          value={isConnected && hostStats ? formatBytes(hostStats.memory_used) : "0 B"}
          subtext={
            isConnected ? `of ${hostStats ? formatBytes(hostStats.memory_total) : "0 B"}` : "Monitoring suspended"
          }
          icon={memIcon}
          loading={isConnected && !hostStats && isInitialLoading}
          chartData={memoryChartData}
          series={memorySeries}
        />
        <StatCard
          title="Disk I/O"
          value={
            isConnected && hostStats
              ? `${formatBytes(hostStats.disk_read_bytes + hostStats.disk_write_bytes)}/s`
              : "0 B/s"
          }
          subtext={useMemo(
            () => (
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">
                  R: {isConnected && hostStats ? formatBytes(hostStats.disk_read_bytes) : "0 B"}/s
                </span>
                <span className="text-rose-400">
                  W: {isConnected && hostStats ? formatBytes(hostStats.disk_write_bytes) : "0 B"}/s
                </span>
              </div>
            ),
            [hostStats, isConnected],
          )}
          icon={diskIcon}
          loading={isConnected && !hostStats && isInitialLoading}
          chartData={diskChartData}
          series={diskSeries}
        />
        <StatCard
          title="Network"
          value={
            isConnected && hostStats ? `${formatBytes(hostStats.net_rx_bytes + hostStats.net_tx_bytes)}/s` : "0 B/s"
          }
          subtext={useMemo(
            () => (
              <div className="flex items-center gap-2">
                <span className="text-blue-400">
                  ↓ {isConnected && hostStats ? formatBytes(hostStats.net_rx_bytes) : "0 B"}/s
                </span>
                <span className="text-purple-400">
                  ↑ {isConnected && hostStats ? formatBytes(hostStats.net_tx_bytes) : "0 B"}/s
                </span>
              </div>
            ),
            [hostStats, isConnected],
          )}
          icon={netIcon}
          loading={isConnected && !hostStats && isInitialLoading}
          chartData={netChartData}
          series={netSeries}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card/50 border-border text-card-foreground lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-400" />
              System & Runtime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Docker Version</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <p className="text-foreground font-mono text-lg">{isConnected ? info?.version : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Operating System</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-48" />
                ) : (
                  <p className="text-foreground text-lg">{isConnected ? info?.operating_system : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Kernel Version</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-32" />
                ) : (
                  <p className="text-foreground text-lg font-mono">{isConnected ? info?.kernel_version : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Storage Driver</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <p className="text-foreground text-lg">{isConnected ? info?.storage_driver : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">CPU Cores</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  <p className="text-foreground text-lg">{isConnected ? `${info?.ncpu} Cores` : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total RAM</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <p className="text-foreground text-lg">{isConnected && info ? formatBytes(info.mem_total) : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Architecture</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <p className="text-foreground text-lg uppercase">{isConnected ? info?.architecture : "N/A"}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Logging Driver</p>
                {isInitialLoading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  <p className="text-foreground text-lg">{isConnected ? info?.logging_driver : "N/A"}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border text-card-foreground flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Container className="w-5 h-5 text-rose-400" />
              Containers Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center min-h-[250px]">
            {isInitialLoading ? (
              <Skeleton className="w-[200px] h-[200px] rounded-full" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <Box className="w-12 h-12 mb-2 opacity-20" />
                <p>{isConnected ? "No containers found" : "Service Disconnected"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border text-card-foreground">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            Recent System Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Activity className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">No recent events detected</p>
            </div>
          ) : (
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-3">
                {events.map((e, i) => {
                  const getActionColor = (action: string) => {
                    const a = action.toLowerCase();
                    if (["start", "create", "pull", "online", "mount"].includes(a)) return "text-emerald-400";
                    if (["stop", "die", "kill", "destroy", "delete", "remove", "offline", "unmount"].includes(a))
                      return "text-rose-400";
                    if (["pause", "unpause", "resize", "rename", "update", "tag", "untag"].includes(a))
                      return "text-amber-400";
                    return "text-indigo-400";
                  };

                  const getTypeColor = (type: string) => {
                    const t = type.toLowerCase();
                    if (t === "container") return "text-blue-400";
                    if (t === "image") return "text-emerald-400";
                    if (t === "network") return "text-purple-400";
                    if (t === "volume") return "text-amber-400";
                    return "text-muted-foreground";
                  };

                  const shortId = e.id.substring(0, 12);
                  const displayName = e.attributes?.name || e.from || shortId;

                  const getTypeIcon = (type: string) => {
                    const t = type.toLowerCase();
                    if (t === "container") return <Box className="w-4 h-4" />;
                    if (t === "image") return <Layers className="w-4 h-4" />;
                    if (t === "network") return <Network className="w-4 h-4" />;
                    if (t === "volume") return <Database className="w-4 h-4" />;
                    return <Activity className="w-4 h-4" />;
                  };

                  return (
                    <div
                      key={i}
                      className="flex gap-4 p-4 rounded-lg border border-border bg-background/50 text-sm transition-all hover:bg-background/80 group relative overflow-hidden"
                    >
                      {/* Left color bar based on action */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${getActionColor(e.action).replace("text-", "bg-").split(" ")[0]}`}
                      />

                      <div className="flex-shrink-0 flex flex-col items-center justify-center w-12 text-center border-r border-border pr-4">
                        <span className="font-mono text-[10px] text-muted-foreground leading-none mb-1">
                          {e.time.getHours()}:{e.time.getMinutes().toString().padStart(2, "0")}
                        </span>
                        <div className={getTypeColor(e.type)}>{getTypeIcon(e.type)}</div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`font-bold uppercase text-[11px] tracking-wider ${getActionColor(e.action)}`}
                          >
                            {e.action}
                          </span>
                          <span className="text-foreground font-bold truncate group-hover:text-indigo-400 transition-colors">
                            {displayName}
                          </span>
                          {shortId && (
                            <span className="font-mono text-[10px] text-muted-foreground opacity-40 ml-1">
                              #{shortId}
                            </span>
                          )}
                        </div>

                        {e.attributes && Object.keys(e.attributes).length > 0 && (
                          <div className="flex flex-wrap gap-y-1 gap-x-3 mt-1.5">
                            {Object.entries(e.attributes).map(([key, value]) => {
                              if (key === "name") return null;
                              const interestingKeys = [
                                "image",
                                "exitCode",
                                "driver",
                                "type",
                                "com.docker.compose.project",
                                "com.docker.compose.service",
                              ];
                              if (!interestingKeys.includes(key) && !key.startsWith("net.")) return null;

                              let label = key;
                              if (key === "com.docker.compose.project") label = "stack";
                              if (key === "com.docker.compose.service") label = "service";

                              return (
                                <div key={key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <span className="font-semibold opacity-60 uppercase tracking-tighter">{label}:</span>
                                  <span className="text-foreground/80 truncate max-w-[250px]">{value}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0 self-center opacity-20 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted uppercase border border-border">
                          {e.type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number | undefined;
  subtext: string | React.ReactNode;
  icon: React.ReactNode;
  loading: boolean;
  chartData?: Record<string, number>[];
  series?: { key: string; color: string }[];
  to?: string;
}

const StatCard = memo(({ title, value, subtext, icon, loading, chartData, series, to }: StatCardProps) => {
  const navigate = useNavigate();
  const clickable = Boolean(to);

  const handleClick = () => {
    if (to) navigate(to);
  };

  return (
    <Card
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`bg-card border-border overflow-hidden relative group transition-colors hover:border-border/80${
        clickable ? " cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
      }`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10 bg-transparent">
        <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
          {title}
        </CardTitle>
        <div className="opacity-40 group-hover:opacity-100 transition-opacity duration-300">{icon}</div>
      </CardHeader>
      <CardContent className="relative z-10 bg-transparent">
        {loading ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <div className="text-2xl font-black text-foreground tracking-tight">{value !== undefined ? value : "0"}</div>
        )}
        <div className="text-[11px] text-muted-foreground mt-1 font-medium">
          {loading ? <Skeleton className="h-3 w-32" /> : subtext}
        </div>
      </CardContent>

      {!loading && chartData && chartData.length > 1 && series && (
        <div className="absolute bottom-0 left-0 right-0 h-12 opacity-10 group-hover:opacity-25 transition-opacity duration-500 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
});

StatCard.displayName = "StatCard";

export default Index;
