import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import Containers from "./pages/Containers";
import Stacks from "./pages/Stacks";
import Images from "./pages/Images";
import Volumes from "./pages/Volumes";
import Networks from "./pages/Networks";
import Swarm from "./pages/Swarm";
import AppLayout from "./components/layout/AppLayout";
import { DockerProvider } from "@/context/DockerContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <DockerProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/containers" element={<Containers />} />
              <Route path="/stacks" element={<Stacks />} />
              <Route path="/images" element={<Images />} />
              <Route path="/volumes" element={<Volumes />} />
              <Route path="/networks" element={<Networks />} />
              <Route path="/swarm" element={<Swarm />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </TooltipProvider>
    </DockerProvider>
  </QueryClientProvider>
);

export default App;
