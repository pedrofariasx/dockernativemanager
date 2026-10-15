/*
 * File: main.tsx
 * Project: docker-native-manager
 * Created: 2026-03-16
 *
 * Last Modified: Mon Mar 16 2026
 * Modified By: Pedro Farias
 *
 */

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { ThemeProvider } from "next-themes";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <App />
  </ThemeProvider>,
);
