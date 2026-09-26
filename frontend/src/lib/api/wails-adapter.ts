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
import { getWailsApp, getWailsRuntime } from "@/lib/runtime";

export class WailsAdapter implements AppAdapter {
  readonly mode = "wails" as const;

  async getSettings() {
    return (await getWailsApp()?.GetSettings?.()) as AppSettings;
  }

  async updateSettings(input: AppSettings) {
    return (await getWailsApp()?.UpdateSettings?.(input)) as AppSettings;
  }

  async listLibraryManga() {
    return ((await getWailsApp()?.ListLibraryManga?.()) ?? []) as LibraryManga[];
  }

  async getReaderManifest(mangaID: string) {
    return (await getWailsApp()?.GetReaderManifest?.(mangaID)) as ReaderManifest;
  }

  async getReaderProgress(mangaID: string) {
    return (await getWailsApp()?.GetReaderProgress?.(mangaID)) as ReaderProgress;
  }

  async updateReaderProgress(input: ReaderProgress) {
    return (await getWailsApp()?.UpdateReaderProgress?.(input)) as ReaderProgress;
  }

  async getAppVersion(): Promise<AppVersionInfo> {
    const raw = (await getWailsApp()?.GetAppVersion?.()) as unknown;
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
    return ((await getWailsApp()?.SelectDirectory?.()) ?? "") as string;
  }

  async togglePin(mangaID: string) {
    return ((await getWailsApp()?.TogglePin?.(mangaID)) ?? false) as boolean;
  }

  async toggleCollection(mangaID: string) {
    return ((await getWailsApp()?.ToggleCollection?.(mangaID)) ?? false) as boolean;
  }

  async openDirectory(mangaID: string) {
    await getWailsApp()?.OpenDirectory?.(mangaID);
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const raw = (await getWailsApp()?.CheckForUpdates?.()) as unknown;
    return raw as UpdateCheckResult;
  }

  async openURL(url: string): Promise<void> {
    if (getWailsApp()?.OpenURL) {
      await getWailsApp()?.OpenURL?.(url);
    } else {
      window.open(url, "_blank");
    }
  }

  async getThumbnailCacheSize(): Promise<number> {
    return ((await (getWailsApp() as any)?.GetThumbnailCacheSize?.()) ?? 0) as number;
  }

  async clearThumbnailCache(): Promise<void> {
    await (getWailsApp() as any)?.ClearThumbnailCache?.();
  }

  async addLibrarySource(source: LibrarySource): Promise<AppSettings> {
    return (await (getWailsApp() as any)?.AddLibrarySource?.(source)) as AppSettings;
  }

  async removeLibrarySource(sourceID: string): Promise<AppSettings> {
    return (await (getWailsApp() as any)?.RemoveLibrarySource?.(sourceID)) as AppSettings;
  }

  async updateLibrarySource(source: LibrarySource): Promise<AppSettings> {
    return (await (getWailsApp() as any)?.UpdateLibrarySource?.(source)) as AppSettings;
  }

  async relocateLibrarySource(sourceID: string, newPath: string): Promise<AppSettings> {
    return (await (getWailsApp() as any)?.RelocateLibrarySource?.(sourceID, newPath)) as AppSettings;
  }

  async rescanSource(sourceID: string): Promise<void> {
    await (getWailsApp() as any)?.RescanSource?.(sourceID);
  }

  async scanLibrary(): Promise<LibraryManga[]> {
    return ((await (getWailsApp() as any)?.ScanLibrary?.()) ?? []) as LibraryManga[];
  }

  subscribe(eventName: string, callback: (payload: unknown) => void) {
    const runtime = getWailsRuntime();
    const unsubscribe = runtime?.EventsOn?.(eventName, callback);
    if (typeof unsubscribe === "function") {
      return unsubscribe;
    }
    return () => runtime?.EventsOff?.(eventName);
  }
}
