import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/lib/i18n";
import App from "@/App";
import { appAdapter } from "@/lib/api";
import type { AppSettings, LibraryManga } from "@/lib/contracts";

const baseSettings: AppSettings = {
  libraryRoot: "/mock/library",
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
  shortcuts: {},
  autoCheckUpdates: true,
  enableThumbnailCache: true,
  thumbnailQuality: "medium",
  librarySources: [
    { id: "src-local", name: "Local", path: "/local", type: "local", enabled: true },
    { id: "src-remote", name: "Remote", path: "/remote", type: "smb", enabled: true },
  ],
};

const mockItems: LibraryManga[] = [
  {
    id: "coll-action",
    sourceID: "src-local",
    title: "Action",
    sourceURL: "",
    relativePath: "Action",
    isCollection: true,
    mangaCount: 2,
    chapterCount: 20,
    pageCount: 200,
    coverImageURL: "",
    lastUpdated: "2026-09-24T12:00:00Z",
    isAvailable: true,
  },
  {
    id: "manga-local-naruto",
    sourceID: "src-local",
    title: "Local Naruto",
    sourceURL: "",
    relativePath: "Action/Naruto",
    parentPath: "Action",
    isCollection: false,
    mangaCount: 0,
    chapterCount: 10,
    pageCount: 100,
    coverImageURL: "",
    lastUpdated: "2026-09-24T12:00:00Z",
    isAvailable: true,
  },
  {
    id: "manga-remote-bleach",
    sourceID: "src-remote",
    title: "Remote Bleach",
    sourceURL: "",
    relativePath: "Action/Bleach",
    parentPath: "Action",
    isCollection: false,
    mangaCount: 0,
    chapterCount: 10,
    pageCount: 100,
    coverImageURL: "",
    lastUpdated: "2026-09-24T12:00:00Z",
    isAvailable: true,
  },
];

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

describe("App Collection View in Duplicate Merge Mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("displays both local and remote child mangas in merge mode", async () => {
    vi.spyOn(appAdapter, "getSettings").mockResolvedValue({
      ...baseSettings,
      duplicateMergeMode: "merge",
    });
    vi.spyOn(appAdapter, "listLibraryManga").mockResolvedValue(mockItems);

    renderApp();

    // Verify collection card is displayed
    await waitFor(() => {
      expect(screen.getByText("Action")).toBeInTheDocument();
    });

    // Click on Action collection
    fireEvent.click(screen.getByText("Action"));

    // In merge mode, both local and remote manga must be visible
    await waitFor(() => {
      expect(screen.getByText("Local Naruto")).toBeInTheDocument();
      expect(screen.getByText("Remote Bleach")).toBeInTheDocument();
    });
  });

  it("isolates source children in separate mode", async () => {
    vi.spyOn(appAdapter, "getSettings").mockResolvedValue({
      ...baseSettings,
      duplicateMergeMode: "separate",
    });
    vi.spyOn(appAdapter, "listLibraryManga").mockResolvedValue(mockItems);

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Action")).toBeInTheDocument();
    });

    // Click on Action collection (sourceID: src-local)
    fireEvent.click(screen.getByText("Action"));

    // In separate mode with src-local, only Local Naruto should be shown
    await waitFor(() => {
      expect(screen.getByText("Local Naruto")).toBeInTheDocument();
      expect(screen.queryByText("Remote Bleach")).not.toBeInTheDocument();
    });
  });

  it("exits reader back to collection for remote manga in merge mode", async () => {
    vi.spyOn(appAdapter, "getSettings").mockResolvedValue({
      ...baseSettings,
      duplicateMergeMode: "merge",
    });
    vi.spyOn(appAdapter, "listLibraryManga").mockResolvedValue(mockItems);
    vi.spyOn(appAdapter, "getReaderManifest").mockResolvedValue({
      mangaID: "manga-remote-bleach",
      title: "Remote Bleach",
      chapters: [
        {
          id: "ch-1",
          title: "Chapter 1",
          number: 1,
          startPage: 0,
          pageCount: 1,
          localPath: "",
          completedAt: "",
          pages: [
            {
              id: "p-1",
              chapterID: "ch-1",
              chapterTitle: "Chapter 1",
              pageIndex: 0,
              fileName: "001.jpg",
              sourceURL: "/p1.jpg",
            },
          ],
        },
      ],
      totalPages: 1,
      coverImageURL: "",
    });
    vi.spyOn(appAdapter, "getReaderProgress").mockResolvedValue({
      mangaID: "manga-remote-bleach",
      chapterID: "ch-1",
      page: 1,
      updatedAt: "2026-09-24T12:00:00Z",
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Action")).toBeInTheDocument();
    });

    // Enter collection
    fireEvent.click(screen.getByText("Action"));

    await waitFor(() => {
      expect(screen.getByText("Remote Bleach")).toBeInTheDocument();
    });

    // Open remote manga
    fireEvent.click(screen.getByText("Remote Bleach"));

    // Find and click exit reader button
    const exitBtn = await screen.findByRole("button", { name: /Back to Library|返回书架|ライブラリに戻る/i });
    fireEvent.click(exitBtn);

    // Verify it returns to the collection view with both mangas
    await waitFor(() => {
      expect(screen.getByText("Local Naruto")).toBeInTheDocument();
      expect(screen.getByText("Remote Bleach")).toBeInTheDocument();
    });
  });
});
