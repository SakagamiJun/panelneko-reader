import {
  type AppSettings,
  type CreateDownloadTaskInput,
  type DownloadProgress,
  type DownloadTask,
  EVENTS,
  type LibraryManga,
  type LibrarySource,
  type MangaOnlineLink,
  type OnlineMangaChapter,
  type OnlineMangaItem,
  type OnlineSearchResult,
  type ReaderManifest,
  type ReaderProgress,
  type UpdateCheckResult,
  type CopyMangaLoginResult,
  type DevInfo,
  type CopyMangaAccount,
} from "@/lib/contracts";
import type { AppAdapter, SelectDirectoryOptions } from "@/lib/api/adapter";

const STORAGE_KEY = "panelneko-reader-settings";
const READER_PROGRESS_STORAGE_KEY = "panelneko-reader-progress";
const PINNED_STORAGE_KEY = "panelneko-pinned-items";

const defaultSettings: AppSettings = {
  libraryRoot: "/mock/library",
  librarySources: [
    {
      id: "default",
      name: "Default Library",
      type: "local",
      path: "/mock/library",
      enabled: true,
      status: "online",
      mangaCount: 4,
    },
  ],
  localeMode: "system",
  locale: "en",
  themeMode: "system",
  readerScrollCachePages: 6,
  autoRestoreReaderProgress: true,
  readerDirection: "rtl",
  readerSpreadMode: "auto",
  readerCoverSolo: true,
  readerFitMode: "contain",
  readerFilter: "none",
  readerSideClickMode: "right_next",
  readerClickCenterZoom: false,
  readerDoubleClickZoom: false,
  shortcuts: {
    nextPage: "ArrowRight",
    prevPage: "ArrowLeft",
    nextChapter: "]",
    prevChapter: "[",
    toggleMode: "m",
    backToLibrary: "Escape",
    toggleMenu: "h",
  },
  autoCheckUpdates: true,
  enableThumbnailCache: true,
  thumbnailQuality: "medium",
  duplicateMergeMode: "separate",
};

function createMockReaderManifest(index: number, title: string): ReaderManifest {
  const chapters = Array.from({ length: 4 }, (_, chapterIndex) => {
    const pages = Array.from({ length: 10 }, (_, pageIndex) => ({
      id: `m${index}-c${chapterIndex + 1}-p${pageIndex + 1}`,
      chapterID: `m${index}-chapter-${chapterIndex + 1}`,
      chapterTitle: `Chapter ${chapterIndex + 1}`,
      pageIndex,
      fileName: `${String(pageIndex + 1).padStart(3, "0")}.jpg`,
      sourceURL: `https://picsum.photos/seed/panelneko-${index}-${chapterIndex + 1}-${pageIndex + 1}/1400/2000`,
    }));

    return {
      id: `m${index}-chapter-${chapterIndex + 1}`,
      title: `Chapter ${chapterIndex + 1}`,
      number: chapterIndex + 1,
      startPage: chapterIndex * 10,
      pageCount: pages.length,
      pages,
      localPath: `/Users/example/Downloads/MangaLibrary/${title}/Chapter ${chapterIndex + 1}`,
      completedAt: new Date(Date.now() - chapterIndex * 86400000).toISOString(),
    };
  });

  return {
    mangaID: `mock-library-${index}`,
    title,
    coverImageURL: chapters[0]?.pages[0]?.sourceURL ?? "",
    totalPages: chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0),
    chapters,
  };
}

const mockReaderManifests: ReaderManifest[] = [
  createMockReaderManifest(1, "Otona ni Narenai Bokura wa"),
  createMockReaderManifest(2, "Midnight Signal"),
  createMockReaderManifest(3, "Glass Archive"),
  createMockReaderManifest(4, "Starlight Echoes"),
];

const mockLibrary: LibraryManga[] = [
  {
    id: mockReaderManifests[0].mangaID,
    sourceID: "default",
    title: mockReaderManifests[0].title,
    sourceURL: `https://example.com/mock-library-1.html`,
    relativePath: mockReaderManifests[0].title,
    coverImageURL: mockReaderManifests[0].coverImageURL,
    chapterCount: mockReaderManifests[0].chapters.length,
    pageCount: mockReaderManifests[0].totalPages,
    lastUpdated: new Date(Date.now() - 172800000).toISOString(),
    isAvailable: true,
  },
  {
    id: mockReaderManifests[1].mangaID,
    sourceID: "default",
    title: mockReaderManifests[1].title,
    sourceURL: `https://example.com/mock-library-2.html`,
    relativePath: mockReaderManifests[1].title,
    coverImageURL: mockReaderManifests[1].coverImageURL,
    chapterCount: mockReaderManifests[1].chapters.length,
    pageCount: mockReaderManifests[1].totalPages,
    lastUpdated: new Date(Date.now() - 345600000).toISOString(),
    isAvailable: true,
  },
  {
    id: "mock-coll-1",
    sourceID: "default",
    title: "Special Collection",
    sourceURL: "",
    relativePath: "Special Collection",
    isCollection: true,
    mangaCount: 2,
    coverImageURL: mockReaderManifests[2].coverImageURL,
    chapterCount: mockReaderManifests[2].chapters.length + mockReaderManifests[3].chapters.length,
    pageCount: mockReaderManifests[2].totalPages + mockReaderManifests[3].totalPages,
    lastUpdated: new Date(Date.now() - 86400000).toISOString(),
    isAvailable: true,
  },
  {
    id: mockReaderManifests[2].mangaID,
    sourceID: "default",
    title: mockReaderManifests[2].title,
    sourceURL: `https://example.com/mock-library-3.html`,
    relativePath: `Special Collection/${mockReaderManifests[2].title}`,
    parentPath: "Special Collection",
    coverImageURL: mockReaderManifests[2].coverImageURL,
    chapterCount: mockReaderManifests[2].chapters.length,
    pageCount: mockReaderManifests[2].totalPages,
    lastUpdated: new Date(Date.now() - 86400000).toISOString(),
    isAvailable: true,
  },
  {
    id: mockReaderManifests[3].mangaID,
    sourceID: "default",
    title: mockReaderManifests[3].title,
    sourceURL: `https://example.com/mock-library-4.html`,
    relativePath: `Special Collection/${mockReaderManifests[3].title}`,
    parentPath: "Special Collection",
    coverImageURL: mockReaderManifests[3].coverImageURL,
    chapterCount: mockReaderManifests[3].chapters.length,
    pageCount: mockReaderManifests[3].totalPages,
    lastUpdated: new Date(Date.now() - 50000000).toISOString(),
    isAvailable: true,
  },
];

type Listener = (payload: unknown) => void;

export class MockAdapter implements AppAdapter {
  readonly mode = "mock" as const;

  private listeners = new Map<string, Set<Listener>>();
  private collectionOverrides = new Map<string, boolean>();
  private mockTasks: DownloadTask[] = [];
  private mockLinks = new Map<string, MangaOnlineLink>();
  private isDevMode = false;
  private mockAccounts: CopyMangaAccount[] = [
    { username: "mock_account_1", token: "mock_tok_1", limitedAt: 0, lastCheckedAt: Date.now() },
  ];

  async getSettings() {
    return this.readSettings();
  }

  async updateSettings(input: AppSettings) {
    const current = this.readSettings();
    const updated: AppSettings = { ...current, ...input };
    if (input.thumbnailQuality !== undefined) {
      updated.thumbnailQuality = input.thumbnailQuality;
      updated.enableThumbnailCache = input.thumbnailQuality !== "off";
    } else if (input.enableThumbnailCache !== undefined) {
      updated.enableThumbnailCache = input.enableThumbnailCache;
      if (!input.enableThumbnailCache) {
        updated.thumbnailQuality = "off";
      } else if (updated.thumbnailQuality === "off" || !updated.thumbnailQuality) {
        updated.thumbnailQuality = "medium";
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    this.emit(EVENTS.SETTINGS_UPDATED, updated);
    return updated;
  }

  async listLibraryManga() {
    const pins = this.readPins();
    const settings = this.readSettings();
    const sourceMap = new Map<string, LibrarySource>();
    for (const s of settings.librarySources ?? []) {
      sourceMap.set(s.id, s);
    }

    const items: LibraryManga[] = mockLibrary.map((item) => {
      const isPinned = Boolean(pins[item.id]);
      const overrideColl = this.collectionOverrides.get(item.id);
      const isCollection = overrideColl !== undefined ? overrideColl : item.isCollection;
      const src = sourceMap.get(item.sourceID ?? "default");
      const isAvailable = src ? src.enabled && src.status !== "offline" : true;
      return {
        ...item,
        isCollection,
        isPinned,
        pinnedAt: pins[item.id] || undefined,
        isAvailable,
      };
    });

    // Update collection cover if child is pinned
    const isMergeMode = settings.duplicateMergeMode === "merge";
    for (const item of items) {
      if (item.isCollection) {
        const children = items.filter(
          (c) =>
            c.parentPath === item.relativePath &&
            (isMergeMode || (c.sourceID || "default") === (item.sourceID || "default"))
        );
        const pinnedChildren = children.filter((c) => c.isPinned);
        if (pinnedChildren.length > 0) {
          pinnedChildren.sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
          if (pinnedChildren[0].coverImageURL) {
            item.coverImageURL = pinnedChildren[0].coverImageURL;
          }
        }
      }
    }

    // Sort items: root items pinned first, then lastUpdated; children pinned first, then title
    const rootItems = items.filter((item) => !item.parentPath);
    rootItems.sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      if (a.isPinned && b.isPinned && a.pinnedAt !== b.pinnedAt) {
        return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
      }
      return b.lastUpdated.localeCompare(a.lastUpdated);
    });

    const getCollectionKey = (sourceID: string | undefined, path: string) => {
      if (isMergeMode) return path;
      return (sourceID || "default") + "::" + path;
    };

    const childItemsMap = new Map<string, LibraryManga[]>();
    for (const item of items) {
      if (item.parentPath) {
        const key = getCollectionKey(item.sourceID, item.parentPath);
        const list = childItemsMap.get(key) ?? [];
        list.push(item);
        childItemsMap.set(key, list);
      }
    }

    for (const [, children] of childItemsMap) {
      children.sort((a, b) => {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
          return a.isPinned ? -1 : 1;
        }
        if (a.isPinned && b.isPinned && a.pinnedAt !== b.pinnedAt) {
          return (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? "");
        }
        return a.title.localeCompare(b.title);
      });
    }

    const result: LibraryManga[] = [...rootItems];
    for (const root of rootItems) {
      if (root.isCollection) {
        const key = getCollectionKey(root.sourceID, root.relativePath);
        const children = childItemsMap.get(key) ?? [];
        result.push(...children);
        childItemsMap.delete(key);
      }
    }
    for (const [, children] of childItemsMap) {
      result.push(...children);
    }

    return result;
  }

  async togglePin(mangaID: string) {
    const pins = this.readPins();
    let pinned = false;
    if (pins[mangaID]) {
      delete pins[mangaID];
      pinned = false;
    } else {
      pins[mangaID] = new Date().toISOString();
      pinned = true;
    }
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pins));
    this.emit(EVENTS.LIBRARY_UPDATED, { mangaID, pinned });
    return pinned;
  }

  async toggleCollection(mangaID: string) {
    const current = this.collectionOverrides.get(mangaID);
    const item = mockLibrary.find((i) => i.id === mangaID);
    const wasCollection = current !== undefined ? current : Boolean(item?.isCollection);
    const nextState = !wasCollection;
    this.collectionOverrides.set(mangaID, nextState);
    this.emit(EVENTS.LIBRARY_UPDATED, { mangaID, isCollection: nextState });
    return nextState;
  }

  async getReaderManifest(mangaID: string) {
    return mockReaderManifests.find((manifest) => manifest.mangaID === mangaID) ?? mockReaderManifests[0];
  }

  async getReaderProgress(mangaID: string) {
    return this.readReaderProgress(mangaID);
  }

  async updateReaderProgress(input: ReaderProgress) {
    const progress: ReaderProgress = {
      mangaID: input.mangaID,
      chapterID: input.chapterID,
      page: Math.max(1, input.page),
      updatedAt: new Date().toISOString(),
    };

    const allProgress = this.readAllReaderProgress();
    allProgress[progress.mangaID] = progress;
    localStorage.setItem(READER_PROGRESS_STORAGE_KEY, JSON.stringify(allProgress));

    return progress;
  }

  async getAppVersion() {
    return {
      version: "0.1.0",
      commit: "d40a9d2",
    };
  }

  async selectDirectory(options?: SelectDirectoryOptions) {
    return options?.defaultDirectory || "/Users/example/Downloads/MangaLibrary";
  }

  async openDirectory(_mangaID: string) {
    // no-op in mock environment
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    return {
      hasUpdate: true,
      currentVersion: "0.1.0",
      latestVersion: "0.9.0",
      releaseURL: "https://github.com/SakagamiJun/panelneko-reader/releases/tag/v0.9.0",
      releaseNotes: "New features and bug fixes",
      publishedAt: new Date().toISOString(),
      isHomebrew: false,
    };
  }

  async openURL(url: string): Promise<void> {
    if (typeof window !== "undefined" && window.open) {
      window.open(url, "_blank");
    }
  }

  private mockCacheSize = 25165824; // 24 MB

  async getThumbnailCacheSize(): Promise<number> {
    return this.mockCacheSize;
  }

  async clearThumbnailCache(): Promise<void> {
    this.mockCacheSize = 0;
  }

  async addLibrarySource(source: LibrarySource): Promise<AppSettings> {
    const current = this.readSettings();
    const sources = [...(current.librarySources ?? [])];
    const cleanPath = (source.path || "").trim();
    if (!cleanPath) {
      throw new Error("source path cannot be empty");
    }
    if (sources.some((s) => s.path === cleanPath)) {
      throw new Error(`library source with path "${cleanPath}" already exists`);
    }

    let name = (source.name || "").trim();
    if (!name) {
      const parts = cleanPath.replace(/[\\/]+$/, "").split(/[\\/]/);
      name = parts[parts.length - 1] || "New Library";
    }

    const existingNames = new Set(sources.map((s) => s.name));
    if (existingNames.has(name)) {
      const parts = cleanPath.replace(/[\\/]+$/, "").split(/[\\/]/);
      const parentDir = parts.length > 1 ? parts[parts.length - 2] : "";
      if (parentDir && !existingNames.has(`${name} (${parentDir})`)) {
        name = `${name} (${parentDir})`;
      } else {
        let idx = 2;
        while (existingNames.has(`${name} (${idx})`)) {
          idx++;
        }
        name = `${name} (${idx})`;
      }
    }

    const newSource: LibrarySource = {
      ...source,
      id: source.id || `src-${Date.now()}`,
      name,
      path: cleanPath,
      type: source.type || "local",
      enabled: true,
      status: "online",
      mangaCount: 0,
    };
    sources.push(newSource);
    const updated = await this.updateSettings({ ...current, librarySources: sources });
    this.emit(EVENTS.LIBRARY_UPDATED, {});
    return updated;
  }

  async removeLibrarySource(sourceID: string): Promise<AppSettings> {
    const current = this.readSettings();
    const sources = (current.librarySources ?? []).filter((s) => s.id !== sourceID);
    const updated = await this.updateSettings({ ...current, librarySources: sources });
    this.emit(EVENTS.LIBRARY_UPDATED, {});
    return updated;
  }

  async updateLibrarySource(source: LibrarySource): Promise<AppSettings> {
    const current = this.readSettings();
    const sources = (current.librarySources ?? []).map((s) =>
      s.id === source.id ? { ...s, ...source } : s
    );
    const updated = await this.updateSettings({ ...current, librarySources: sources });
    this.emit(EVENTS.LIBRARY_UPDATED, {});
    return updated;
  }

  async relocateLibrarySource(sourceID: string, newPath: string): Promise<AppSettings> {
    const current = this.readSettings();
    const cleanPath = (newPath || "").trim();
    if (!cleanPath) {
      throw new Error("source path cannot be empty");
    }
    if ((current.librarySources ?? []).some((s) => s.id !== sourceID && s.path === cleanPath)) {
      throw new Error(`library source with path "${cleanPath}" already exists`);
    }
    const sources = (current.librarySources ?? []).map((s) =>
      s.id === sourceID ? { ...s, path: cleanPath, status: "online" as const, errorMessage: undefined } : s
    );
    const updated = await this.updateSettings({ ...current, librarySources: sources });
    this.emit(EVENTS.LIBRARY_UPDATED, {});
    return updated;
  }

  async rescanSource(_sourceID: string): Promise<void> {
    this.emit(EVENTS.LIBRARY_UPDATED, {});
  }

  async scanLibrary(): Promise<LibraryManga[]> {
    this.emit(EVENTS.LIBRARY_UPDATED, {});
    return this.listLibraryManga();
  }

  async searchOnlineManga(source: string, query: string, page = 1, limit = 20): Promise<OnlineSearchResult> {
    const q = query.toLowerCase().trim();
    const items = [
      {
        id: "mock-online-1",
        source,
        title: `${query || "Mock"} Online Chronicle`,
        author: "Author A",
        coverURL: "https://picsum.photos/seed/online1/300/400",
        status: "ongoing",
        description: "An exciting online manga adventure.",
        updateTime: new Date().toISOString(),
        totalChapters: 24,
      },
      {
        id: "mock-online-2",
        source,
        title: `${query || "Mock"} Fantasy Journey`,
        author: "Author B",
        coverURL: "https://picsum.photos/seed/online2/300/400",
        status: "completed",
        description: "A finished epic masterpiece.",
        updateTime: new Date(Date.now() - 86400000).toISOString(),
        totalChapters: 12,
      },
    ].filter((it) => !q || it.title.toLowerCase().includes(q) || it.author.toLowerCase().includes(q));

    return {
      items,
      totalItems: items.length,
      page,
      totalPages: 1,
    };
  }

  async getOnlineMangaChapters(source: string, mangaID: string): Promise<OnlineMangaChapter[]> {
    return Array.from({ length: 6 }, (_, i) => ({
      id: `${mangaID}-ch-${i + 1}`,
      mangaID,
      source,
      title: `Chapter ${i + 1}`,
      number: i + 1,
      releaseDate: new Date(Date.now() - (6 - i) * 86400000).toISOString().split("T")[0],
    })).reverse();
  }

  async createDownloadTasks(inputs: CreateDownloadTaskInput[]): Promise<DownloadTask[]> {
    const now = new Date().toISOString();
    const created: DownloadTask[] = inputs.map((inTask) => ({
      id: `${inTask.source}-${inTask.chapterID}`,
      source: inTask.source,
      mangaID: inTask.mangaID,
      mangaTitle: inTask.mangaTitle,
      mangaCoverURL: inTask.mangaCoverURL,
      chapterID: inTask.chapterID,
      chapterTitle: inTask.chapterTitle,
      chapterNumber: inTask.chapterNumber,
      status: "downloading",
      totalPages: 15,
      downloadedPages: 1,
      speed: "2.4 MB/s",
      createdAt: now,
      updatedAt: now,
    }));

    for (const t of created) {
      const idx = this.mockTasks.findIndex((it) => it.id === t.id);
      if (idx >= 0) {
        this.mockTasks[idx] = t;
      } else {
        this.mockTasks.push(t);
      }
    }

    this.emit(EVENTS.DOWNLOAD_TASKS_UPDATED, this.mockTasks);
    this.emit(EVENTS.DOWNLOAD_PROGRESS, this.getDownloadProgressSync());
    return created;
  }

  async pauseDownloadTask(taskID: string): Promise<void> {
    const t = this.mockTasks.find((it) => it.id === taskID);
    if (t) {
      t.status = "paused";
      t.speed = "";
      this.emit(EVENTS.DOWNLOAD_TASKS_UPDATED, this.mockTasks);
      this.emit(EVENTS.DOWNLOAD_PROGRESS, this.getDownloadProgressSync());
    }
  }

  async resumeDownloadTask(taskID: string): Promise<void> {
    const t = this.mockTasks.find((it) => it.id === taskID);
    if (t) {
      t.status = "downloading";
      t.speed = "3.1 MB/s";
      this.emit(EVENTS.DOWNLOAD_TASKS_UPDATED, this.mockTasks);
      this.emit(EVENTS.DOWNLOAD_PROGRESS, this.getDownloadProgressSync());
    }
  }

  async cancelDownloadTask(taskID: string): Promise<void> {
    this.mockTasks = this.mockTasks.filter((it) => it.id !== taskID);
    this.emit(EVENTS.DOWNLOAD_TASKS_UPDATED, this.mockTasks);
    this.emit(EVENTS.DOWNLOAD_PROGRESS, this.getDownloadProgressSync());
  }

  async getDownloadTasks(): Promise<DownloadTask[]> {
    return [...this.mockTasks];
  }

  async clearCompletedDownloadTasks(): Promise<void> {
    this.mockTasks = this.mockTasks.filter((it) => it.status !== "completed" && it.status !== "failed");
    this.emit(EVENTS.DOWNLOAD_TASKS_UPDATED, this.mockTasks);
    this.emit(EVENTS.DOWNLOAD_PROGRESS, this.getDownloadProgressSync());
  }

  async getDownloadProgress(): Promise<DownloadProgress> {
    return this.getDownloadProgressSync();
  }

  private getDownloadProgressSync(): DownloadProgress {
    let active = 0;
    let dlPages = 0;
    let totPages = 0;
    for (const t of this.mockTasks) {
      if (t.status === "downloading" || t.status === "pending") {
        active++;
        dlPages += t.downloadedPages;
        totPages += t.totalPages;
      }
    }
    return {
      activeTasks: active,
      totalTasks: this.mockTasks.length,
      downloadedPages: dlPages,
      totalPages: totPages,
      speedFormatted: active > 0 ? "2.8 MB/s" : "",
      bytesPerSec: active > 0 ? 2.8 * 1024 * 1024 : 0,
    };
  }

  async retryDownloadTask(taskID: string): Promise<void> {
    const task = this.mockTasks.find((t) => t.id === taskID);
    if (task) {
      task.status = "pending";
      task.errorMessage = undefined;
      this.emit(EVENTS.DOWNLOAD_TASKS_UPDATED, [...this.mockTasks]);
      this.emit(EVENTS.DOWNLOAD_PROGRESS, await this.getDownloadProgress());
    }
  }

  async matchLocalManga(mangaID: string, provider: string): Promise<OnlineMangaItem[]> {
    return [
      {
        id: `mock-match-${mangaID}`,
        source: provider,
        title: "Mock Matched Comic",
        author: "Mock Author",
        coverURL: "https://example.com/cover.jpg",
        status: "ongoing",
        totalChapters: 120,
      },
    ];
  }

  async linkMangaOnline(input: MangaOnlineLink): Promise<void> {
    this.mockLinks.set(input.mangaId, input);
  }

  async getMangaOnlineLink(mangaID: string): Promise<MangaOnlineLink> {
    return this.mockLinks.get(mangaID) ?? ({} as MangaOnlineLink);
  }

  async unlinkMangaOnline(mangaID: string): Promise<void> {
    this.mockLinks.delete(mangaID);
  }

  async checkMangaUpdates(_mangaID: string): Promise<number> {
    return 0;
  }

  async checkAllFollowedUpdates(): Promise<number> {
    return 0;
  }

  async openLogDirectory(): Promise<void> {
    // Mock open log directory
  }

  async toggleMangaAutoFollow(mangaID: string): Promise<boolean> {
    const link = this.mockLinks.get(mangaID);
    if (!link) {
      throw new Error("manga not linked to any online source");
    }
    link.autoFollow = !link.autoFollow;
    return link.autoFollow;
  }

  async getAllMangaOnlineLinks(): Promise<MangaOnlineLink[]> {
    return Array.from(this.mockLinks.values());
  }

  subscribe(eventName: string, callback: Listener) {
    const listeners = this.listeners.get(eventName) ?? new Set<Listener>();
    listeners.add(callback);
    this.listeners.set(eventName, listeners);
    return () => {
      listeners.delete(callback);
    };
  }

  async loginCopyManga(username: string, password: string): Promise<CopyMangaLoginResult> {
    const trimmedUser = username.trim();
    const trimmedPwd = password.trim();

    if (trimmedUser === "root" && trimmedPwd === "dev") {
      this.isDevMode = true;
      return {
        success: true,
        isDevMode: true,
        message: "developer_mode_activated",
      };
    }

    if (!trimmedUser || !trimmedPwd) {
      throw new Error("username and password cannot be empty");
    }

    const current = this.readSettings();
    const token = "mock_token_" + trimmedUser;
    current.downloader = {
      ...(current.downloader || {
        enableCopyManga: false,
        enableRawManga: false,
        downloadDir: "",
        downloadFormat: "cbz",
      }),
      copyMangaUsername: trimmedUser,
      copyMangaToken: token,
      copyMangaPasswordEncrypted: "mock_enc_" + trimmedPwd,
    };
    await this.updateSettings(current);

    return {
      success: true,
      username: trimmedUser,
      token,
      isDevMode: this.isDevMode,
      message: "login_success",
    };
  }

  async logoutCopyManga(): Promise<void> {
    const current = this.readSettings();
    if (current.downloader) {
      current.downloader = {
        ...current.downloader,
        copyMangaUsername: "",
        copyMangaPasswordEncrypted: "",
        copyMangaToken: "",
      };
      await this.updateSettings(current);
    }
  }

  async getIsDevMode(): Promise<boolean> {
    return this.isDevMode;
  }

  async getDevInfo(): Promise<DevInfo> {
    return {
      isDevMode: this.isDevMode,
      keySource: "machine_id",
      keyFingerprint: "mock-key-fp-789a",
      machineId: "mock-machine-uuid-1234",
      accountCount: this.mockAccounts.length,
    };
  }

  async getCopyMangaAccounts(): Promise<CopyMangaAccount[]> {
    return [...this.mockAccounts];
  }

  async addCopyMangaAccount(username: string, password: string, token: string): Promise<void> {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      throw new Error("username cannot be empty");
    }
    this.mockAccounts.push({
      username: trimmedUser,
      password: password ? "mock_enc_" + password : "",
      token: token || "mock_tok_" + trimmedUser,
      limitedAt: 0,
      lastCheckedAt: Date.now(),
    });
  }

  async deleteCopyMangaAccount(username: string): Promise<void> {
    const trimmedUser = username.trim();
    this.mockAccounts = this.mockAccounts.filter((a) => a.username !== trimmedUser);
  }

  private readSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return defaultSettings;
      }
      return { ...defaultSettings, ...(JSON.parse(raw) as AppSettings) };
    } catch {
      return defaultSettings;
    }
  }

  private readReaderProgress(mangaID: string): ReaderProgress {
    return (
      this.readAllReaderProgress()[mangaID] ?? {
        mangaID,
        chapterID: "",
        page: 0,
        updatedAt: "",
      }
    );
  }

  private readAllReaderProgress(): Record<string, ReaderProgress> {
    try {
      const raw = localStorage.getItem(READER_PROGRESS_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      return JSON.parse(raw) as Record<string, ReaderProgress>;
    } catch {
      return {};
    }
  }

  private readPins(): Record<string, string> {
    try {
      const raw = localStorage.getItem(PINNED_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private emit(eventName: string, payload: unknown) {
    this.listeners.get(eventName)?.forEach((listener) => listener(payload));
  }
}
