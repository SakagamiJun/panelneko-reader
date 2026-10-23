export type LocaleMode = "system" | "manual";
export type Locale = "zh-CN" | "en" | "ja";
export type ThemeMode = "system" | "light" | "dark";
export type ReaderDirection = "rtl" | "ltr";
export type ReaderSpreadMode = "auto" | "single" | "double";
export type ReaderFitMode = "contain" | "width" | "height" | "original";
export type ReaderFilter = "none" | "invert" | "sepia" | "high-contrast";
export type ReaderSideClickMode = "right_next" | "follow" | "left_next";

export type SourceType = "local" | "smb" | "webdav";
export type SourceStatus = "online" | "offline" | "disabled" | "syncing";

export interface LibrarySource {
  id: string;
  name: string;
  type: SourceType;
  path: string;
  enabled: boolean;
  readOnly?: boolean;
  status?: SourceStatus;
  errorMessage?: string;
  mangaCount?: number;
  lastScanned?: string;
}

export type ThumbnailQuality = "off" | "low" | "medium" | "high";

export interface AppSettings {
  libraryRoot: string;
  librarySources?: LibrarySource[];
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
  readerSideClickMode?: ReaderSideClickMode;
  readerClickCenterZoom?: boolean;
  readerDoubleClickZoom?: boolean;
  shortcuts: Record<string, string>;
  autoCheckUpdates?: boolean;
  enableThumbnailCache?: boolean;
  thumbnailQuality?: ThumbnailQuality;
  enableFileLogging?: boolean;
  downloader?: DownloaderSettings;
}

export interface DownloaderSettings {
  enableCopyManga: boolean;
  copyMangaApiDomain?: string;
  copyMangaUsername?: string;
  copyMangaPasswordEncrypted?: string;
  copyMangaToken?: string;
  enableRawManga: boolean;
  rawMangaBaseUrl?: string;
  downloadDir?: string;
  targetSourceId?: string;
  downloadSubPath?: string;
  copyMangaCdnMode?: "official" | "striped";
  copyMangaCustomCdns?: string[] | null;
  downloadFormat?: "cbz" | "folder";
  maxConcurrentDownloads?: number;
  maxImageConcurrency?: number;
  chapterIntervalSec?: number;
  autoCheckComicUpdates?: boolean;
  autoFollowPolicy?: "latest_only" | "fill_gaps";
}

export interface OnlineMangaItem {
  id: string;
  source: "copymanga" | "klz9" | string;
  title: string;
  author: string;
  coverURL: string;
  status: "ongoing" | "completed" | string;
  description?: string;
  updateTime?: string;
  totalChapters?: number;
}

export interface OnlineMangaChapter {
  id: string;
  mangaID: string;
  source: string;
  title: string;
  number: number;
  ordered?: number;
  group?: string;
  groupPathWord?: string;
  releaseDate?: string;
}

export interface OnlineSearchResult {
  items: OnlineMangaItem[];
  totalItems: number;
  page: number;
  totalPages: number;
}

export type DownloadTaskStatus = "pending" | "downloading" | "paused" | "waiting_source" | "completed" | "failed";

export interface DownloadTask {
  id: string;
  source: string;
  mangaID: string;
  mangaTitle: string;
  mangaCoverURL?: string;
  chapterID: string;
  chapterTitle: string;
  chapterNumber: number;
  chapterGroup?: string;
  targetSourceID?: string;
  status: DownloadTaskStatus;
  totalPages: number;
  downloadedPages: number;
  speed?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadProgress {
  activeTasks: number;
  totalTasks: number;
  downloadedPages: number;
  totalPages: number;
  speedFormatted: string;
  bytesPerSec: number;
}

export interface CreateDownloadTaskInput {
  source: string;
  mangaID: string;
  mangaTitle: string;
  mangaCoverURL?: string;
  chapterID: string;
  chapterTitle: string;
  chapterNumber: number;
  chapterGroup?: string;
  targetSourceID?: string;
}

export interface MangaOnlineLink {
  mangaId: string;
  onlineSource: string;
  onlineComicId: string;
  onlineTitle: string;
  autoFollow: boolean;
  followPolicy: "latest_only" | "fill_gaps";
  lastCheckedAt?: string;
  lastNotifiedChapter?: string;
  targetGroup?: string;
  baselineChapterNumber?: number;
  baselineChapterTitle?: string;
}

export interface MangaLinkPreviewInput {
  mangaId: string;
  onlineSource: string;
  onlineComicId: string;
  targetGroup?: string;
  followPolicy?: string;
}

export interface MangaLinkPreviewItem {
  mangaId: string;
  mangaTitle: string;
  localLatestTitle: string;
  localLatestNumber: number;
  onlineLatestTitle: string;
  onlineLatestNumber: number;
  diffType: "in_sync" | "online_ahead" | "local_ahead";
  diffCount: number;
  pendingChapters: string[];
  recommendedPolicy: "latest_only" | "fill_gaps";
  errorMessage?: string;
}

export interface LibraryManga {
  id: string;
  sourceID?: string;
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
  isAvailable?: boolean;
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

export interface AppVersionInfo {
  version: string;
  commit?: string;
}

import * as BindingsEvents from "@bindings/events";

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseURL: string;
  releaseNotes?: string;
  publishedAt?: string;
  isHomebrew?: boolean;
}

export interface FollowedUpdateCheckProgress {
  checking: boolean;
  current: number;
  total: number;
  queued: number;
}

export const EVENTS = {
  SETTINGS_UPDATED: BindingsEvents.SettingsUpdated,
  THEME_RESOLVED: BindingsEvents.ThemeResolved,
  LOCALE_RESOLVED: BindingsEvents.LocaleResolved,
  LIBRARY_UPDATED: BindingsEvents.LibraryUpdated,
  FILES_DROPPED: BindingsEvents.FilesDropped,
  FILES_OPENED: BindingsEvents.FilesOpened,
  DOWNLOAD_PROGRESS: BindingsEvents.DownloadProgress,
  DOWNLOAD_TASKS_UPDATED: BindingsEvents.DownloadTasksUpdated,
  FOLLOWED_UPDATE_CHECK_PROGRESS:
    (BindingsEvents as Record<string, string>).FollowedUpdateCheckProgress ??
    "followed_update:check_progress",
} as const;

export interface CopyMangaLoginResult {
  success: boolean;
  username?: string;
  token?: string;
  isDevMode: boolean;
  message?: string;
}

export interface DevInfo {
  isDevMode: boolean;
  keySource: string;
  keyFingerprint: string;
  machineId?: string;
  accountCount: number;
}

export interface CopyMangaAccount {
  username: string;
  password?: string;
  token: string;
  limitedAt: number;
  lastCheckedAt: number;
  platform?: string;
}

