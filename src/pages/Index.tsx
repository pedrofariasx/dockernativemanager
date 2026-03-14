"use client";

import { useState } from "react";
import { useDocker } from "@/context/DockerContext";
import { useDockerEvent } from "@/hooks/use-docker-events";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box, Layers, Activity, Info, Network, Database } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const Index = () => {
  const { systemInfo: info, volumes, networks, loading, refreshAll } = useDocker();
  const [events, setEvents] = useState<{ time: Date; type: string; action: string; id: string }[]>([]);

  useDockerEvent("all", (event) => {
    refreshAll();
    if (event) {
      setEvents((prev) => {
        const newEvents = [{
          time: new Date(),
          type: event.Type || "system",
          action: event.Action || "unknown",
          id: (event.Actor?.ID || "").substring(0, 12)
        }, ...prev];
        return newEvents.slice(0, 20); // keep last 20
      });
    }
  });

  const chartData = info ? [
    { name: "Running", value: info.containers_running, color: "#10b981" },
    { name: "Stopped", value: info.containers_stopped, color: "#f43f5e" },
    { name: "Paused", value: info.containers_paused, color: "#f59e0b" },
  ].filter(d => d.value > 0) : [];

  const isInitialLoading = loading.systemInfo && !info;

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">System overview and Docker daemon status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Containers"
          value={info?.containers}
          subtext={`${info?.containers_running} running, ${info?.containers_stopped} stopped`}
          icon={<Box className="w-5 h-5 text-blue-500" />}
          loading={isInitialLoading}
        />
        <StatCard
          title="Images"
          value={info?.images}
          subtext="Total images on disk"
          icon={<Layers className="w-5 h-5 text-emerald-500" />}
          loading={isInitialLoading}
        />
        <StatCard
          title="Volumes"
          value={volumes.length}
          subtext="Local storage volumes"
          icon={<Database className="w-5 h-5 text-amber-500" />}
          loading={loading.volumes && volumes.length === 0}
        />
        <StatCard
          title="Networks"
          value={networks.length}
          subtext="Docker networks"
          icon={<Network className="w-5 h-5 text-purple-500" />}
          loading={loading.networks && networks.length === 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card/50 border-border text-card-foreground lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-400" />
              Daemon Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Docker Version</p>
                {isInitialLoading ? <Skeleton className="h-6 w-24" /> : <p className="text-foreground font-mono text-lg">{info?.version}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Operating System</p>
                {isInitialLoading ? <Skeleton className="h-6 w-48" /> : <p className="text-foreground text-lg">{info?.operating_system}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">CPU Cores</p>
                {isInitialLoading ? <Skeleton className="h-6 w-16" /> : <p className="text-foreground text-lg">{info?.ncpu} Cores</p>}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Total RAM</p>
                {isInitialLoading ? <Skeleton className="h-6 w-24" /> : <p className="text-foreground text-lg">{info ? formatBytes(info.mem_total) : ""}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border text-card-foreground flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-400" />
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
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground h-full">
                <Box className="w-12 h-12 mb-2 opacity-20" />
                <p>No containers found</p>
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
            <div className="space-y-3">
              {events.map((e, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.time.toLocaleTimeString()}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-muted text-foreground text-xs font-semibold uppercase">
                      {e.type}
                    </span>
                    <span className="text-foreground font-medium">
                      {e.action}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.id}
                  </span>
                </div>
              ))}
            </div>
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
}

const StatCard = ({ title, value, subtext, icon, loading }: StatCardProps) => (
  <Card className="bg-card border-border">
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
      <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </CardTitle>
      {icon}
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-8 w-16 mb-1" />
      ) : (
        <div className="text-2xl font-bold text-foreground">
          {value !== undefined ? value : "0"}
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-1">
        {loading ? <Skeleton className="h-3 w-32" /> : subtext}
      </div>
    </CardContent>
  </Card>
);

export default Index;
