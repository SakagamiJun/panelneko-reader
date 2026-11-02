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
  CopyMangaAccountImportResult,
  CopyMangaAccountInput,
  FollowedUpdateCheckProgress,
  MangaLinkPreviewInput,
  MangaLinkPreviewItem,
  DroppedSourcesResult,
} from "@/lib/contracts";
import type { AppAdapter, SelectDirectoryOptions } from "@/lib/api/adapter";
import { isWailsEnvironment } from "@/lib/runtime";
import * as App from "@bindings/github.com/sakagamijun/panelneko-reader/app";
import { Browser, Dialogs, Events } from "@wailsio/runtime";

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

  async selectDirectory(options?: SelectDirectoryOptions): Promise<string> {
    if (isWailsEnvironment()) {
      const selected = await Dialogs.OpenFile({
        CanChooseDirectories: true,
        CanChooseFiles: true,
        CanCreateDirectories: true,
        Title: options?.title || "Select Manga Library Directory or Archive",
        Directory: options?.defaultDirectory || undefined,
      });
      return selected || "";
    }
    return "";
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
      await Browser.OpenURL(url);
      return;
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

  async addDroppedSources(paths: string[]): Promise<DroppedSourcesResult> {
    return (await App.AddDroppedSources(paths)) as DroppedSourcesResult;
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

  async searchOnlineManga(source: string, query: string, page = 1, limit = 20): Promise<OnlineSearchResult> {
    const fn = (App as any).SearchOnlineManga;
    if (typeof fn === "function") {
      return (await fn(source, query, page, limit)) as OnlineSearchResult;
    }
    return { items: [], totalItems: 0, page, totalPages: 1 };
  }

  async getOnlineMangaChapters(source: string, mangaID: string, mangaTitle = ""): Promise<OnlineMangaChapter[]> {
    const fn = (App as any).GetOnlineMangaChapters;
    if (typeof fn === "function") {
      return ((await fn(source, mangaID, mangaTitle)) ?? []) as OnlineMangaChapter[];
    }
    return [];
  }

  async getOnlineMangaGroups(source: string, mangaID: string): Promise<string[]> {
    const fn = (App as any).GetOnlineMangaGroups;
    if (typeof fn === "function") {
      return ((await fn(source, mangaID)) ?? []) as string[];
    }
    return [];
  }

  async createDownloadTasks(inputs: CreateDownloadTaskInput[]): Promise<DownloadTask[]> {
    const fn = (App as any).CreateDownloadTasks;
    if (typeof fn === "function") {
      return ((await fn(inputs as any)) ?? []) as DownloadTask[];
    }
    return [];
  }

  async pauseDownloadTask(taskID: string): Promise<void> {
    const fn = (App as any).PauseDownloadTask;
    if (typeof fn === "function") {
      await fn(taskID);
    }
  }

  async resumeDownloadTask(taskID: string): Promise<void> {
    const fn = (App as any).ResumeDownloadTask;
    if (typeof fn === "function") {
      await fn(taskID);
    }
  }

  async cancelDownloadTask(taskID: string): Promise<void> {
    const fn = (App as any).CancelDownloadTask;
    if (typeof fn === "function") {
      await fn(taskID);
    }
  }

  async getDownloadTasks(): Promise<DownloadTask[]> {
    const fn = (App as any).GetDownloadTasks;
    if (typeof fn === "function") {
      return ((await fn()) ?? []) as DownloadTask[];
    }
    return [];
  }

  async clearCompletedDownloadTasks(): Promise<void> {
    const fn = (App as any).ClearCompletedDownloadTasks;
    if (typeof fn === "function") {
      await fn();
    }
  }

  async getDownloadProgress(): Promise<DownloadProgress> {
    const fn = (App as any).GetDownloadProgress;
    if (typeof fn === "function") {
      return (await fn()) as DownloadProgress;
    }
    return {
      activeTasks: 0,
      totalTasks: 0,
      downloadedPages: 0,
      totalPages: 0,
      speedFormatted: "",
      bytesPerSec: 0,
    };
  }

  async retryDownloadTask(taskID: string): Promise<void> {
    const fn = (App as any).RetryDownloadTask;
    if (typeof fn === "function") {
      await fn(taskID);
    }
  }

  async matchLocalManga(mangaID: string, provider: string): Promise<OnlineMangaItem[]> {
    const fn = (App as any).MatchLocalManga;
    if (typeof fn === "function") {
      return ((await fn(mangaID, provider)) ?? []) as OnlineMangaItem[];
    }
    return [];
  }

  async linkMangaOnline(input: MangaOnlineLink): Promise<void> {
    const fn = (App as any).LinkMangaOnline;
    if (typeof fn === "function") {
      await fn(input);
    }
  }

  async getMangaOnlineLink(mangaID: string): Promise<MangaOnlineLink> {
    const fn = (App as any).GetMangaOnlineLink;
    if (typeof fn === "function") {
      return ((await fn(mangaID)) ?? {}) as MangaOnlineLink;
    }
    return {} as MangaOnlineLink;
  }

  async unlinkMangaOnline(mangaID: string): Promise<void> {
    const fn = (App as any).UnlinkMangaOnline;
    if (typeof fn === "function") {
      await fn(mangaID);
    }
  }

  async previewMangaLink(input: MangaLinkPreviewInput): Promise<MangaLinkPreviewItem> {
    const fn = (App as any).PreviewMangaLink;
    if (typeof fn === "function") {
      return (await fn(input)) as MangaLinkPreviewItem;
    }
    const batch = await this.previewBatchMangaLinks([input]);
    return batch[0] ?? {
      mangaId: input.mangaId,
      mangaTitle: "",
      localLatestTitle: "",
      localLatestNumber: -1,
      onlineLatestTitle: "",
      onlineLatestNumber: -1,
      diffType: "in_sync",
      diffCount: 0,
      latestOnlyCount: 0,
      gapCount: 0,
      pendingChapters: [],
      recommendedPolicy: "latest_only",
    };
  }

  async previewBatchMangaLinks(inputs: MangaLinkPreviewInput[]): Promise<MangaLinkPreviewItem[]> {
    const fn = (App as any).PreviewBatchMangaLinks;
    if (typeof fn === "function") {
      return ((await fn(inputs)) ?? []) as MangaLinkPreviewItem[];
    }
    return [];
  }

  async checkMangaUpdates(mangaID: string): Promise<number> {
    const fn = (App as any).CheckMangaUpdates;
    if (typeof fn === "function") {
      return (await fn(mangaID)) ?? 0;
    }
    return 0;
  }

  async checkAllFollowedUpdates(): Promise<number> {
    const fn = (App as any).CheckAllFollowedUpdates;
    if (typeof fn === "function") {
      return (await fn()) ?? 0;
    }
    return 0;
  }

  async getFollowedUpdateCheckStatus(): Promise<FollowedUpdateCheckProgress> {
    const fn = (App as any).GetFollowedUpdateCheckStatus;
    if (typeof fn === "function") {
      const res = await fn();
      return (
        res ?? {
          checking: false,
          current: 0,
          total: 0,
          queued: 0,
        }
      );
    }
    return {
      checking: false,
      current: 0,
      total: 0,
      queued: 0,
    };
  }

  async openLogDirectory(): Promise<void> {
    const fn = (App as any).OpenLogDirectory;
    if (typeof fn === "function") {
      await fn();
    }
  }

  async toggleMangaAutoFollow(mangaID: string): Promise<boolean> {
    const fn = (App as any).ToggleMangaAutoFollow;
    if (typeof fn === "function") {
      return (await fn(mangaID)) ?? false;
    }
    return false;
  }

  async getAllMangaOnlineLinks(): Promise<MangaOnlineLink[]> {
    const fn = (App as any).GetAllMangaOnlineLinks;
    if (typeof fn === "function") {
      return ((await fn()) ?? []) as MangaOnlineLink[];
    }
    return [];
  }

  async loginCopyManga(username: string, password: string): Promise<CopyMangaLoginResult> {
    return (await App.LoginCopyManga(username, password)) as CopyMangaLoginResult;
  }

  async logoutCopyManga(): Promise<void> {
    await App.LogoutCopyManga();
  }

  async getIsDevMode(): Promise<boolean> {
    return (await App.GetIsDevMode()) ?? false;
  }

  async setDevMode(enabled: boolean): Promise<void> {
    await App.SetDevMode(enabled);
  }

  async getDevInfo(): Promise<DevInfo> {
    return (await App.GetDevInfo()) as DevInfo;
  }

  async getCopyMangaAccounts(): Promise<CopyMangaAccount[]> {
    return ((await App.GetCopyMangaAccounts()) ?? []) as CopyMangaAccount[];
  }

  async addCopyMangaAccount(username: string, password: string, token: string): Promise<void> {
    await App.AddCopyMangaAccount(username, password, token);
  }

  async deleteCopyMangaAccount(username: string): Promise<void> {
    await App.DeleteCopyMangaAccount(username);
  }

  async importCopyMangaAccounts(accounts: CopyMangaAccountInput[]): Promise<CopyMangaAccountImportResult> {
    return (await App.ImportCopyMangaAccounts(accounts as any)) as CopyMangaAccountImportResult;
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
