import type {
  AppSettings,
  AppVersionInfo,
  CreateDownloadTaskInput,
  DownloadProgress,
  DownloadTask,
  LibraryManga,
  LibrarySource,
  OnlineMangaChapter,
  OnlineSearchResult,
  ReaderManifest,
  ReaderProgress,
  UpdateCheckResult,
} from "@/lib/contracts";

export interface SelectDirectoryOptions {
  title?: string;
  defaultDirectory?: string;
}

export interface AppAdapter {
  readonly mode: "mock" | "wails";
  getSettings(): Promise<AppSettings>;
  updateSettings(input: AppSettings): Promise<AppSettings>;
  listLibraryManga(): Promise<LibraryManga[]>;
  getReaderManifest(mangaID: string): Promise<ReaderManifest>;
  getReaderProgress(mangaID: string): Promise<ReaderProgress>;
  updateReaderProgress(input: ReaderProgress): Promise<ReaderProgress>;
  getAppVersion(): Promise<AppVersionInfo>;
  selectDirectory(options?: SelectDirectoryOptions): Promise<string>;
  togglePin(mangaID: string): Promise<boolean>;
  toggleCollection(mangaID: string): Promise<boolean>;
  openDirectory(mangaID: string): Promise<void>;
  subscribe(eventName: string, callback: (payload: unknown) => void): () => void;
  checkForUpdates(): Promise<UpdateCheckResult>;
  openURL(url: string): Promise<void>;
  getThumbnailCacheSize(): Promise<number>;
  clearThumbnailCache(): Promise<void>;
  addLibrarySource(source: LibrarySource): Promise<AppSettings>;
  removeLibrarySource(sourceID: string): Promise<AppSettings>;
  updateLibrarySource(source: LibrarySource): Promise<AppSettings>;
  relocateLibrarySource(sourceID: string, newPath: string): Promise<AppSettings>;
  rescanSource(sourceID: string): Promise<void>;
  scanLibrary(): Promise<LibraryManga[]>;

  // Online Downloader & Search
  searchOnlineManga(source: string, query: string, page?: number, limit?: number): Promise<OnlineSearchResult>;
  getOnlineMangaChapters(source: string, mangaID: string): Promise<OnlineMangaChapter[]>;
  createDownloadTasks(inputs: CreateDownloadTaskInput[]): Promise<DownloadTask[]>;
  pauseDownloadTask(taskID: string): Promise<void>;
  resumeDownloadTask(taskID: string): Promise<void>;
  cancelDownloadTask(taskID: string): Promise<void>;
  getDownloadTasks(): Promise<DownloadTask[]>;
  clearCompletedDownloadTasks(): Promise<void>;
  getDownloadProgress(): Promise<DownloadProgress>;
}
