import {
  type AppSettings,
  EVENTS,
  type LibraryManga,
  type ReaderManifest,
  type ReaderProgress,
} from "@/lib/contracts";
import type { AppAdapter } from "@/lib/api/adapter";

const STORAGE_KEY = "panelneko-reader-settings";
const READER_PROGRESS_STORAGE_KEY = "panelneko-reader-progress";
const PINNED_STORAGE_KEY = "panelneko-pinned-items";

const defaultSettings: AppSettings = {
  libraryRoot: "/mock/library",
  localeMode: "system",
  locale: "en",
  themeMode: "system",
  readerScrollCachePages: 6,
  autoRestoreReaderProgress: true,
  shortcuts: {
    nextPage: "ArrowRight",
    prevPage: "ArrowLeft",
    nextChapter: "]",
    prevChapter: "[",
    toggleMode: "m",
    backToLibrary: "Escape",
    toggleMenu: "h",
  },
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
    title: mockReaderManifests[0].title,
    sourceURL: `https://example.com/mock-library-1.html`,
    relativePath: mockReaderManifests[0].title,
    coverImageURL: mockReaderManifests[0].coverImageURL,
    chapterCount: mockReaderManifests[0].chapters.length,
    pageCount: mockReaderManifests[0].totalPages,
    lastUpdated: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: mockReaderManifests[1].mangaID,
    title: mockReaderManifests[1].title,
    sourceURL: `https://example.com/mock-library-2.html`,
    relativePath: mockReaderManifests[1].title,
    coverImageURL: mockReaderManifests[1].coverImageURL,
    chapterCount: mockReaderManifests[1].chapters.length,
    pageCount: mockReaderManifests[1].totalPages,
    lastUpdated: new Date(Date.now() - 345600000).toISOString(),
  },
  {
    id: "mock-coll-1",
    title: "Special Collection",
    sourceURL: "",
    relativePath: "Special Collection",
    isCollection: true,
    mangaCount: 2,
    coverImageURL: mockReaderManifests[2].coverImageURL,
    chapterCount: mockReaderManifests[2].chapters.length + mockReaderManifests[3].chapters.length,
    pageCount: mockReaderManifests[2].totalPages + mockReaderManifests[3].totalPages,
    lastUpdated: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: mockReaderManifests[2].mangaID,
    title: mockReaderManifests[2].title,
    sourceURL: `https://example.com/mock-library-3.html`,
    relativePath: `Special Collection/${mockReaderManifests[2].title}`,
    parentPath: "Special Collection",
    coverImageURL: mockReaderManifests[2].coverImageURL,
    chapterCount: mockReaderManifests[2].chapters.length,
    pageCount: mockReaderManifests[2].totalPages,
    lastUpdated: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: mockReaderManifests[3].mangaID,
    title: mockReaderManifests[3].title,
    sourceURL: `https://example.com/mock-library-4.html`,
    relativePath: `Special Collection/${mockReaderManifests[3].title}`,
    parentPath: "Special Collection",
    coverImageURL: mockReaderManifests[3].coverImageURL,
    chapterCount: mockReaderManifests[3].chapters.length,
    pageCount: mockReaderManifests[3].totalPages,
    lastUpdated: new Date(Date.now() - 50000000).toISOString(),
  },
];

type Listener = (payload: unknown) => void;

export class MockAdapter implements AppAdapter {
  readonly mode = "mock" as const;

  private listeners = new Map<string, Set<Listener>>();

  async getSettings() {
    return this.readSettings();
  }

  async updateSettings(input: AppSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    this.emit(EVENTS.SETTINGS_UPDATED, input);
    return input;
  }

  async listLibraryManga() {
    const pins = this.readPins();
    const items: LibraryManga[] = mockLibrary.map((item) => {
      const isPinned = Boolean(pins[item.id]);
      return {
        ...item,
        isPinned,
        pinnedAt: pins[item.id] || undefined,
      };
    });

    // Update collection cover if child is pinned
    for (const item of items) {
      if (item.isCollection) {
        const children = items.filter((c) => c.parentPath === item.relativePath);
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

    const childItemsMap = new Map<string, LibraryManga[]>();
    for (const item of items) {
      if (item.parentPath) {
        const list = childItemsMap.get(item.parentPath) ?? [];
        list.push(item);
        childItemsMap.set(item.parentPath, list);
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
        const children = childItemsMap.get(root.relativePath) ?? [];
        result.push(...children);
        childItemsMap.delete(root.relativePath);
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
    return "0.1.0";
  }

  async selectDirectory() {
    return "/Users/example/Downloads/MangaLibrary";
  }

  subscribe(eventName: string, callback: Listener) {
    const listeners = this.listeners.get(eventName) ?? new Set<Listener>();
    listeners.add(callback);
    this.listeners.set(eventName, listeners);
    return () => {
      listeners.delete(callback);
    };
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
