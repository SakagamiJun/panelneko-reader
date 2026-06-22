import type {
  AppSettings,
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
  getAppVersion(): Promise<string>;
  subscribe(eventName: string, callback: (payload: unknown) => void): () => void;
}
