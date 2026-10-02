import type {
  AppSettings,
  AppVersionInfo,
  LibraryManga,
  LibrarySource,
  ReaderManifest,
  ReaderProgress,
  UpdateCheckResult,
} from "@/lib/contracts";
import type { AppAdapter } from "@/lib/api/adapter";
import { isWailsEnvironment } from "@/lib/runtime";
import * as App from "@bindings/github.com/sakagamijun/panelneko-reader/app";
import { Browser, Events } from "@wailsio/runtime";

export class WailsAdapter implements AppAdapter {
  readonly mode = "wails" as const;

  async getSettings() {
    return (await App.GetSettings()) as AppSettings;
  }

  async updateSettings(input: AppSettings) {
    return (await App.UpdateSettings(input as any)) as AppSettings;
  }

  async listLibraryManga() {
    return ((await App.ListLibraryManga()) ?? []) as LibraryManga[];
  }

  async getReaderManifest(mangaID: string) {
    return (await App.GetReaderManifest(mangaID)) as ReaderManifest;
  }

  async getReaderProgress(mangaID: string) {
    return (await App.GetReaderProgress(mangaID)) as ReaderProgress;
  }

  async updateReaderProgress(input: ReaderProgress) {
    return (await App.UpdateReaderProgress(input as any)) as ReaderProgress;
  }

  async getAppVersion(): Promise<AppVersionInfo> {
    const raw = (await App.GetAppVersion()) as unknown;
    if (typeof raw === "string") {
      return { version: raw, commit: "" };
    }
    const obj = raw as Partial<AppVersionInfo> | undefined;
    return {
      version: obj?.version ?? "0.1.0",
      commit: obj?.commit ?? "",
    };
  }

  async selectDirectory() {
    return ((await App.SelectDirectory()) ?? "") as string;
  }

  async togglePin(mangaID: string) {
    return ((await App.TogglePin(mangaID)) ?? false) as boolean;
  }

  async toggleCollection(mangaID: string) {
    return ((await App.ToggleCollection(mangaID)) ?? false) as boolean;
  }

  async openDirectory(mangaID: string) {
    await App.OpenDirectory(mangaID);
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const raw = (await App.CheckForUpdates()) as unknown;
    return raw as UpdateCheckResult;
  }

  async openURL(url: string): Promise<void> {
    if (isWailsEnvironment()) {
      try {
        await Browser.OpenURL(url);
        return;
      } catch {
        // Fallback to App.OpenURL if Browser.OpenURL fails
        await App.OpenURL(url);
        return;
      }
    }
    window.open(url, "_blank");
  }

  async getThumbnailCacheSize(): Promise<number> {
    return ((await App.GetThumbnailCacheSize()) ?? 0) as number;
  }

  async clearThumbnailCache(): Promise<void> {
    await App.ClearThumbnailCache();
  }

  async addLibrarySource(source: LibrarySource): Promise<AppSettings> {
    return (await App.AddLibrarySource(source as any)) as AppSettings;
  }

  async removeLibrarySource(sourceID: string): Promise<AppSettings> {
    return (await App.RemoveLibrarySource(sourceID)) as AppSettings;
  }

  async updateLibrarySource(source: LibrarySource): Promise<AppSettings> {
    return (await App.UpdateLibrarySource(source as any)) as AppSettings;
  }

  async relocateLibrarySource(sourceID: string, newPath: string): Promise<AppSettings> {
    return (await App.RelocateLibrarySource(sourceID, newPath)) as AppSettings;
  }

  async rescanSource(sourceID: string): Promise<void> {
    await App.RescanSource(sourceID);
  }

  async scanLibrary(): Promise<LibraryManga[]> {
    return ((await App.ScanLibrary()) ?? []) as LibraryManga[];
  }

  subscribe(eventName: string, callback: (payload: unknown) => void) {
    if (!isWailsEnvironment()) {
      return () => {};
    }
    const unsubscribe = Events.On(eventName as any, (ev: any) => {
      callback(ev.data);
    });
    return unsubscribe;
  }
}
