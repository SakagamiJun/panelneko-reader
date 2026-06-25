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

const defaultSettings: AppSettings = {
  libraryRoot: "/Users/example/Downloads/MangaLibrary",
  localeMode: "system",
  locale: "en",
  themeMode: "system",
  readerScrollCachePages: 6,
  autoRestoreReaderProgress: true,
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
];

const mockLibrary: LibraryManga[] = mockReaderManifests.map((manifest, index) => ({
  id: manifest.mangaID,
  title: manifest.title,
  sourceURL: `https://example.com/mock-library-${index + 1}.html`,
  relativePath: manifest.title,
  coverImageURL: manifest.coverImageURL,
  chapterCount: manifest.chapters.length,
  pageCount: manifest.totalPages,
  lastUpdated: new Date(Date.now() - index * 172800000).toISOString(),
}));

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
    return mockLibrary;
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

  private emit(eventName: string, payload: unknown) {
    this.listeners.get(eventName)?.forEach((listener) => listener(payload));
  }
}
