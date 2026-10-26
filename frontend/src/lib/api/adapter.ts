import type {
  AppSettings,
  AppVersionInfo,
  CreateDownloadTaskInput,
  DownloadProgress,
  DownloadTask,
  LibraryManga,
  LibrarySource,
  MangaOnlineLink,
  OnlineMangaChapter,
  OnlineMangaItem,
  OnlineSearchResult,
  ReaderManifest,
  ReaderProgress,
  UpdateCheckResult,
  CopyMangaLoginResult,
  DevInfo,
  CopyMangaAccount,
  FollowedUpdateCheckProgress,
  MangaLinkPreviewInput,
  MangaLinkPreviewItem,
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
  getOnlineMangaGroups(source: string, mangaID: string): Promise<string[]>;
  createDownloadTasks(inputs: CreateDownloadTaskInput[]): Promise<DownloadTask[]>;
  pauseDownloadTask(taskID: string): Promise<void>;
  resumeDownloadTask(taskID: string): Promise<void>;
  cancelDownloadTask(taskID: string): Promise<void>;
  getDownloadTasks(): Promise<DownloadTask[]>;
  clearCompletedDownloadTasks(): Promise<void>;
  getDownloadProgress(): Promise<DownloadProgress>;
  retryDownloadTask(taskID: string): Promise<void>;
  matchLocalManga(mangaID: string, provider: string): Promise<OnlineMangaItem[]>;
  linkMangaOnline(input: MangaOnlineLink): Promise<void>;
  getMangaOnlineLink(mangaID: string): Promise<MangaOnlineLink>;
  unlinkMangaOnline(mangaID: string): Promise<void>;
  previewMangaLink(input: MangaLinkPreviewInput): Promise<MangaLinkPreviewItem>;
  previewBatchMangaLinks(inputs: MangaLinkPreviewInput[]): Promise<MangaLinkPreviewItem[]>;
  checkMangaUpdates(mangaID: string): Promise<number>;
  checkAllFollowedUpdates(): Promise<number>;
  getFollowedUpdateCheckStatus(): Promise<FollowedUpdateCheckProgress>;
  openLogDirectory(): Promise<void>;
  toggleMangaAutoFollow(mangaID: string): Promise<boolean>;
  getAllMangaOnlineLinks(): Promise<MangaOnlineLink[]>;
  loginCopyManga(username: string, password: string): Promise<CopyMangaLoginResult>;
  logoutCopyManga(): Promise<void>;
  getIsDevMode(): Promise<boolean>;
  setDevMode(enabled: boolean): Promise<void>;
  getDevInfo(): Promise<DevInfo>;
  getCopyMangaAccounts(): Promise<CopyMangaAccount[]>;
  addCopyMangaAccount(username: string, password: string, token: string): Promise<void>;
  deleteCopyMangaAccount(username: string): Promise<void>;
}
