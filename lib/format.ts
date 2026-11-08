import { createElement } from "react";
import {
  Archive,
  File,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
} from "lucide-react";
import type { FileCategory, ItemDTO } from "@/lib/types";

export function formatBytesClient(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : decimals)} ${units[exponent]}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

export function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || value;
}

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function categoryIcon(category: FileCategory, className = "h-5 w-5") {
  switch (category) {
    case "image":
      return createElement(FileImage, { className });
    case "video":
      return createElement(FileVideo, { className });
    case "audio":
      return createElement(FileAudio, { className });
    case "archive":
      return createElement(Archive, { className });
    case "document":
      return createElement(FileText, { className });
    default:
      return createElement(File, { className });
  }
}

export function itemIcon(item: ItemDTO, className = "h-5 w-5") {
  if (item.type === "folder") return createElement(Folder, { className });
  if (item.extension === "xls" || item.extension === "xlsx" || item.extension === "ods" || item.extension === "csv") {
    return createElement(FileSpreadsheet, { className });
  }
  if (item.extension === "ppt" || item.extension === "pptx" || item.extension === "odp") {
    return createElement(Presentation, { className });
  }
  if (item.extension === "doc" || item.extension === "docx" || item.extension === "odt" || item.extension === "pdf" || item.extension === "txt" || item.extension === "md") {
    return createElement(FileText, { className });
  }
  return categoryIcon(item.category, className);
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
