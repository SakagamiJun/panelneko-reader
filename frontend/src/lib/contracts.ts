export type LocaleMode = "system" | "manual";
export type Locale = "zh-CN" | "en" | "ja";
export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  libraryRoot: string;
  localeMode: LocaleMode;
  locale: Locale;
  themeMode: ThemeMode;
  readerScrollCachePages: number;
  autoRestoreReaderProgress: boolean;
}

export interface LibraryManga {
  id: string;
  title: string;
  sourceURL: string;
  relativePath: string;
  coverImageURL: string;
  chapterCount: number;
  pageCount: number;
  lastUpdated: string;
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
} as const;
