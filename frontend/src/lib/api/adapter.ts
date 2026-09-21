import type {
  AppSettings,
  AppVersionInfo,
  LibraryManga,
  ReaderManifest,
  ReaderProgress,
} from "@/lib/contracts";

export interface AppAdapter {
  readonly mode: "mock" | "wails";
  getSettings(): Promise<AppSettings>;
  updateSettings(input: AppSettings): Promise<AppSettings>;
  listLibraryManga(): Promise<LibraryManga[]>;
  getReaderManifest(mangaID: string): Promise<ReaderManifest>;
  getReaderProgress(mangaID: string): Promise<ReaderProgress>;
  updateReaderProgress(input: ReaderProgress): Promise<ReaderProgress>;
  getAppVersion(): Promise<AppVersionInfo>;
  selectDirectory(): Promise<string>;
  togglePin(mangaID: string): Promise<boolean>;
  openDirectory(mangaID: string): Promise<void>;
  subscribe(eventName: string, callback: (payload: unknown) => void): () => void;
}
