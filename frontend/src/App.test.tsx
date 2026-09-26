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

function renderApp(customQueryClient?: QueryClient) {
  const queryClient =
    customQueryClient ??
    new QueryClient({
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

  it("automatically hides offline manga and fully-offline collections, with rescan banner", async () => {
    const offlineSettings = {
      ...baseSettings,
      librarySources: [
        {
          id: "src-local",
          name: "Local Library",
          type: "local" as const,
          path: "/path/local",
          enabled: true,
          status: "online" as const,
        },
        {
          id: "src-remote",
          name: "Remote Drive",
          type: "local" as const,
          path: "/path/remote",
          enabled: true,
          status: "offline" as const,
        },
      ],
    };

    const itemsWithOffline: LibraryManga[] = [
      {
        id: "manga-online",
        title: "Online Manga",
        sourceURL: "/path/online",
        relativePath: "Online Manga",
        coverImageURL: "/covers/online.jpg",
        chapterCount: 1,
        pageCount: 10,
        lastUpdated: "2026-09-24T12:00:00Z",
        sourceID: "src-local",
        isAvailable: true,
      },
      {
        id: "manga-offline-single",
        title: "Offline Single",
        sourceURL: "/path/offline",
        relativePath: "Offline Single",
        coverImageURL: "/covers/offline.jpg",
        chapterCount: 1,
        pageCount: 10,
        lastUpdated: "2026-09-24T12:00:00Z",
        sourceID: "src-remote",
        isAvailable: false,
      },
      // Collection whose children are all offline
      {
        id: "coll-offline",
        title: "Offline Coll",
        sourceURL: "",
        relativePath: "Offline Coll",
        isCollection: true,
        mangaCount: 1,
        coverImageURL: "/covers/coll.jpg",
        chapterCount: 1,
        pageCount: 10,
        lastUpdated: "2026-09-24T12:00:00Z",
        sourceID: "src-remote",
        isAvailable: false,
      },
      {
        id: "child-offline",
        title: "Offline Child",
        sourceURL: "/path/child",
        relativePath: "Offline Coll/Child",
        parentPath: "Offline Coll",
        coverImageURL: "/covers/child.jpg",
        chapterCount: 1,
        pageCount: 10,
        lastUpdated: "2026-09-24T12:00:00Z",
        sourceID: "src-remote",
        isAvailable: false,
      },
    ];

    vi.spyOn(appAdapter, "getSettings").mockResolvedValue(offlineSettings);
    vi.spyOn(appAdapter, "listLibraryManga").mockResolvedValue(itemsWithOffline);
    const scanSpy = vi.spyOn(appAdapter, "scanLibrary").mockResolvedValue(itemsWithOffline);

    renderApp();

    // 1. By default, offline manga and fully-offline collection are hidden
    await waitFor(() => {
      expect(screen.getByText("Online Manga")).toBeInTheDocument();
      expect(screen.queryByText("Offline Single")).not.toBeInTheDocument();
      expect(screen.queryByText("Offline Coll")).not.toBeInTheDocument();
    });

    // 2. Offline notice banner is displayed with rescan button
    const rescanBtn = await screen.findByRole("button", { name: /重新扫描|Rescan|再スキャン/i });
    expect(rescanBtn).toBeInTheDocument();

    // 3. Click show offline manga toggle
    const toggleBtn = await screen.findByRole("button", { name: /显示离线书籍|Show offline manga|オフライン作品を表示/i });
    fireEvent.click(toggleBtn);

    // 4. Now offline items become visible
    await waitFor(() => {
      expect(screen.getByText("Offline Single")).toBeInTheDocument();
      expect(screen.getByText("Offline Coll")).toBeInTheDocument();
    });

    // 5. Click rescan button triggers scanLibrary
    fireEvent.click(rescanBtn);
    await waitFor(() => {
      expect(scanSpy).toHaveBeenCalled();
    });
  });

  it("strictly isolates child items between separate same-named collections A and B", async () => {
    const multiCollItems: LibraryManga[] = [
      {
        id: "coll-action-local",
        sourceID: "src-local",
        title: "Action",
        sourceURL: "",
        relativePath: "Action",
        isCollection: true,
        mangaCount: 1,
        chapterCount: 10,
        pageCount: 100,
        coverImageURL: "/covers/action-local.jpg",
        lastUpdated: "2026-09-24T12:00:00Z",
        isAvailable: true,
      },
      {
        id: "coll-action-remote",
        sourceID: "src-remote",
        title: "Action",
        sourceURL: "",
        relativePath: "Action",
        isCollection: true,
        mangaCount: 1,
        chapterCount: 10,
        pageCount: 100,
        coverImageURL: "/covers/action-remote.jpg",
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
        coverImageURL: "/covers/naruto.jpg",
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
        coverImageURL: "/covers/bleach.jpg",
        lastUpdated: "2026-09-24T12:00:00Z",
        isAvailable: true,
      },
    ];

    vi.spyOn(appAdapter, "getSettings").mockResolvedValue({
      ...baseSettings,
      duplicateMergeMode: "separate",
    });
    vi.spyOn(appAdapter, "listLibraryManga").mockResolvedValue(multiCollItems);

    renderApp();

    await waitFor(() => {
      const cards = screen.getAllByText("Action");
      expect(cards.length).toBe(2);
    });

    // 1. Click the first Action collection (Local)
    const cards = screen.getAllByText("Action");
    fireEvent.click(cards[0]);

    // Only Local Naruto must appear; Remote Bleach must NOT appear
    await waitFor(() => {
      expect(screen.getByText("Local Naruto")).toBeInTheDocument();
      expect(screen.queryByText("Remote Bleach")).not.toBeInTheDocument();
    });

    // 2. Go back to main library
    const backBtn = screen.getByRole("button", { name: /Back to Main Library|返回主书架|メイン本棚に戻る/i });
    fireEvent.click(backBtn);

    // 3. Click the second Action collection (Remote)
    await waitFor(() => {
      expect(screen.getAllByText("Action").length).toBe(2);
    });
    const updatedCards = screen.getAllByText("Action");
    fireEvent.click(updatedCards[1]);

    // Only Remote Bleach must appear; Local Naruto must NOT appear
    await waitFor(() => {
      expect(screen.getByText("Remote Bleach")).toBeInTheDocument();
      expect(screen.queryByText("Local Naruto")).not.toBeInTheDocument();
    });
  });

  it("resets collection view safely when duplicateMergeMode is switched from merge to separate", async () => {
    let currentMode: "merge" | "separate" = "merge";
    vi.spyOn(appAdapter, "getSettings").mockImplementation(async () => ({
      ...baseSettings,
      duplicateMergeMode: currentMode,
    }));
    vi.spyOn(appAdapter, "listLibraryManga").mockResolvedValue(mockItems);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderApp(queryClient);

    // In merge mode, enter Action collection
    await waitFor(() => {
      expect(screen.getByText("Action")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Action"));

    await waitFor(() => {
      expect(screen.getByText("Local Naruto")).toBeInTheDocument();
      expect(screen.getByText("Remote Bleach")).toBeInTheDocument();
    });

    // Switch duplicateMergeMode to separate
    currentMode = "separate";
    queryClient.setQueryData(["settings"], {
      ...baseSettings,
      duplicateMergeMode: "separate",
    });

    // Collection view should automatically reset to library root to prevent cross-source leakage
    await waitFor(() => {
      expect(screen.queryByText("Local Naruto")).not.toBeInTheDocument();
      expect(screen.queryByText("Remote Bleach")).not.toBeInTheDocument();
      expect(screen.getByText("Action")).toBeInTheDocument();
    });
  });
});
