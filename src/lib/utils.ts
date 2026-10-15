/*
 * File: utils.ts
 * Project: docker-native-manager
 * Created: 2026-03-13
 *
 * Last Modified: Mon Mar 16 2026
 * Modified By: Pedro Farias
 *
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals: number = 2) {
  if (bytes === 0) return "0 Bytes";
  if (bytes < 0) return "N/A";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
