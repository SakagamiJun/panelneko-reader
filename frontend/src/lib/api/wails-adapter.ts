import type {
  AppSettings,
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

  async getAppVersion() {
    return ((await getWailsApp()?.GetAppVersion?.()) ?? "0.0.0") as string;
  }

  async selectDirectory() {
    return ((await getWailsApp()?.SelectDirectory?.()) ?? "") as string;
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
