import type {
  AppSettings,
  AppVersionInfo,
  LibraryManga,
  ReaderManifest,
  ReaderProgress,
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

  subscribe(eventName: string, callback: (payload: unknown) => void) {
    const runtime = getWailsRuntime();
    const unsubscribe = runtime?.EventsOn?.(eventName, callback);
    if (typeof unsubscribe === "function") {
      return unsubscribe;
    }
    return () => runtime?.EventsOff?.(eventName);
  }
}
