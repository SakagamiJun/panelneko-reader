export type LocaleMode = "system" | "manual";
export type Locale = "zh-CN" | "en" | "ja";
export type ThemeMode = "system" | "light" | "dark";
export type ReaderDirection = "rtl" | "ltr";
export type ReaderSpreadMode = "auto" | "single" | "double";
export type ReaderFitMode = "contain" | "width" | "height" | "original";
export type ReaderFilter = "none" | "invert" | "sepia" | "high-contrast";

export interface AppSettings {
  libraryRoot: string;
  localeMode: LocaleMode;
  locale: Locale;
  themeMode: ThemeMode;
  readerScrollCachePages: number;
  autoRestoreReaderProgress: boolean;
  readerDirection: ReaderDirection;
  readerSpreadMode: ReaderSpreadMode;
  readerCoverSolo: boolean;
  readerFitMode: ReaderFitMode;
  readerFilter: ReaderFilter;
  shortcuts: Record<string, string>;
}

export interface LibraryManga {
  id: string;
  title: string;
  sourceURL: string;
  relativePath: string;
  parentPath?: string;
  isCollection?: boolean;
  mangaCount?: number;
  coverImageURL: string;
  chapterCount: number;
  pageCount: number;
  lastUpdated: string;
  isPinned?: boolean;
  pinnedAt?: string;
}

export interface ReaderManifest {
  mangaID: string;
  title: string;
  coverImageURL: string;
  totalPages: number;
  chapters: ReaderChapter[];
}

export interface ReaderChapter {
  id: string;
  title: string;
  number: number;
  startPage: number;
  pageCount: number;
  pages: ReaderPage[];
  localPath: string;
  completedAt: string;
}

export interface ReaderPage {
  id: string;
  chapterID: string;
  chapterTitle: string;
  pageIndex: number;
  fileName: string;
  sourceURL: string;
}

export interface ReaderProgress {
  mangaID: string;
  chapterID: string;
  page: number;
  updatedAt: string;
}

export const EVENTS = {
  SETTINGS_UPDATED: "settings:updated",
  THEME_RESOLVED: "theme:resolved",
  LOCALE_RESOLVED: "locale:resolved",
  LIBRARY_UPDATED: "library:updated",
} as const;
