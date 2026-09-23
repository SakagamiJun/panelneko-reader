import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytesPerSecond(value: number) {
  if (!value || value <= 0) {
    return "0 B/s";
  }

  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatBytes(value: number) {
  if (!value || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDateTime(value: string) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
function getRelativeTimeFormat(locale?: string): Intl.RelativeTimeFormat {
  const key = locale || "default";
  let rtf = rtfCache.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" });
    rtfCache.set(key, rtf);
  }
  return rtf;
}

export function formatSmartDate(value: string, locale?: string, now: Date = new Date()): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const nowDate = now.getDate();

  const parsedYear = parsed.getFullYear();
  const parsedMonth = parsed.getMonth();
  const parsedDate = parsed.getDate();

  // Same calendar day: show HH:mm
  if (nowYear === parsedYear && nowMonth === parsedMonth && nowDate === parsedDate) {
    const hh = String(parsed.getHours()).padStart(2, "0");
    const mm = String(parsed.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // Yesterday
  const yesterday = new Date(nowYear, nowMonth, nowDate - 1);
  if (
    yesterday.getFullYear() === parsedYear &&
    yesterday.getMonth() === parsedMonth &&
    yesterday.getDate() === parsedDate
  ) {
    try {
      return getRelativeTimeFormat(locale).format(-1, "day");
    } catch {
      const loc = locale ?? "zh-CN";
      return loc.startsWith("en") ? "Yesterday" : loc.startsWith("ja") ? "昨日" : "昨天";
    }
  }

  const mm = String(parsedMonth + 1).padStart(2, "0");
  const dd = String(parsedDate).padStart(2, "0");

  // Same year: MM-DD
  if (nowYear === parsedYear) {
    return `${mm}-${dd}`;
  }

  // Different year: YYYY-MM
  return `${parsedYear}-${mm}`;
}

