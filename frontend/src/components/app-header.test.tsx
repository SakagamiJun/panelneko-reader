import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { i18n } from "@/lib/i18n";
import * as systemModule from "@/lib/system";
import { AppHeader } from "@/components/app-header";
import type { AppSettings } from "@/lib/contracts";

describe("AppHeader Component", () => {
  afterEach(() => {
    cleanup();
  });

  const baseSettings: AppSettings = {
    libraryRoot: "/path/to/main",
    localeMode: "system",
    locale: "zh-CN",
    themeMode: "system",
    readerScrollCachePages: 5,
    autoRestoreReaderProgress: true,
    readerDirection: "rtl",
    readerSpreadMode: "auto",
    readerCoverSolo: true,
    readerFitMode: "contain",
    readerFilter: "none",
    readerDoubleClickZoom: true,
    shortcuts: {},
    librarySources: [
      {
        id: "source-1",
        name: "Comics Primary",
        type: "local",
        path: "/mnt/manga/local",
        enabled: true,
        status: "online",
        mangaCount: 42,
      },
      {
        id: "source-2",
        name: "NAS Storage",
        type: "smb",
        path: "smb://nas/manga",
        enabled: true,
        status: "offline",
        mangaCount: 15,
      },
    ],
  };

  it("renders library title and total count", () => {
    render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={57}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
      />
    );

    expect(screen.getByText("57")).toBeInTheDocument();
  });

  it("renders dropdown trigger button when multiple library sources exist", () => {
    const handleSelectSource = vi.fn();
    const handleManageSources = vi.fn();

    render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={57}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        selectedSourceId="all"
        onSelectSourceId={handleSelectSource}
        onOpenManageSources={handleManageSources}
      />
    );

    // Initial state: trigger button displays All Directories translated string
    const allSourcesLabel = i18n.t("library.filterAllSources");
    const trigger = screen.getByRole("button", { name: new RegExp(allSourcesLabel, "i") });
    expect(trigger).toBeInTheDocument();

    // Menu should initially not be open
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Click trigger to open dropdown
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(screen.getByText("Comics Primary")).toBeInTheDocument();
    expect(screen.getByText("/mnt/manga/local")).toBeInTheDocument();
    expect(screen.getByText("NAS Storage")).toBeInTheDocument();
    expect(screen.getByText("smb://nas/manga")).toBeInTheDocument();
    expect(screen.getByText(i18n.t("library.manageSources"))).toBeInTheDocument();

    // Selecting a source calls onSelectSourceId and closes menu
    fireEvent.click(screen.getByText("Comics Primary"));
    expect(handleSelectSource).toHaveBeenCalledWith("source-1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("triggers onOpenManageSources when clicking manage directories option", () => {
    const handleManageSources = vi.fn();

    render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={57}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        selectedSourceId="all"
        onSelectSourceId={vi.fn()}
        onOpenManageSources={handleManageSources}
      />
    );

    const allSourcesLabel = i18n.t("library.filterAllSources");
    const trigger = screen.getByRole("button", { name: new RegExp(allSourcesLabel, "i") });
    fireEvent.click(trigger);

    const manageBtn = screen.getByText(i18n.t("library.manageSources"));
    fireEvent.click(manageBtn);

    expect(handleManageSources).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("applies pl-20 on Mac in windowed mode, and pl-3 in fullscreen mode", () => {
    const isMacSpy = vi.spyOn(systemModule, "isMacPlatform").mockReturnValue(true);

    const { container, rerender } = render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={57}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
      />
    );

    const header = container.querySelector("header");
    expect(header).toHaveClass("pl-20");

    // Enter fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
      writable: true,
    });
    fireEvent(document, new Event("fullscreenchange"));

    rerender(
      <AppHeader
        selectedCollectionPath="Series A"
        totalCount={12}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
      />
    );

    expect(header).toHaveClass("pl-3");
    expect(header).not.toHaveClass("pl-20");

    // Cleanup
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
      writable: true,
    });
    isMacSpy.mockRestore();
  });

  it("renders persistent offline indicator pill and toggles action popover", () => {
    const handleRescan = vi.fn();
    const handleToggleShowOffline = vi.fn();

    render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={57}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        offlineSourcesCount={2}
        showOffline={false}
        onRescan={handleRescan}
        onToggleShowOffline={handleToggleShowOffline}
      />
    );

    // Pill should be rendered
    const pill = screen.getByRole("button", { name: /2 个目录离线|2 directories offline|2件のディレクトリがオフライン/i });
    expect(pill).toBeInTheDocument();

    // Popover is initially closed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Open popover
    fireEvent.click(pill);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Rescan button
    const rescanBtn = screen.getByRole("button", { name: /重新扫描|rescan/i });
    fireEvent.click(rescanBtn);
    expect(handleRescan).toHaveBeenCalledTimes(1);

    // Toggle offline button
    const toggleBtn = screen.getByRole("button", { name: /显示离线书籍|show offline/i });
    fireEvent.click(toggleBtn);
    expect(handleToggleShowOffline).toHaveBeenCalledTimes(1);

    // Escape closes popover
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders composite search dropdown with local matches and online search options", () => {
    const handleSelectLocal = vi.fn();
    const handleOnlineSearch = vi.fn();
    const handleOpenSettingsTab = vi.fn();

    const mockLocalItems = [
      {
        id: "manga-1",
        title: "Chainsaw Man",
        relativePath: "Chainsaw Man/Vol 1",
        sourceURL: "/path/1",
        coverImageURL: "",
        chapterCount: 12,
        pageCount: 200,
        lastUpdated: "2026-01-01",
      },
      {
        id: "manga-2",
        title: "One Piece",
        relativePath: "One Piece/Vol 100",
        sourceURL: "/path/2",
        coverImageURL: "",
        chapterCount: 10,
        pageCount: 180,
        lastUpdated: "2026-01-01",
      },
    ];

    const onlineEnabledSettings: AppSettings = {
      ...baseSettings,
      downloader: {
        enableCopyManga: true,
        enableRawManga: true,
      },
    };

    render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={2}
        onBackToMain={vi.fn()}
        searchQuery="Chainsaw"
        onSearchChange={vi.fn()}
        settings={onlineEnabledSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        localMangaItems={mockLocalItems}
        onSelectLocalManga={handleSelectLocal}
        onOpenOnlineSearch={handleOnlineSearch}
        onOpenSettingsTab={handleOpenSettingsTab}
      />
    );

    const input = screen.getByPlaceholderText(i18n.t("library.searchPlaceholder"));
    fireEvent.focus(input);

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();

    // Local match should be rendered
    expect(screen.getByText("Chainsaw Man")).toBeInTheDocument();
    // One Piece shouldn't match "Chainsaw"
    expect(screen.queryByText("One Piece")).not.toBeInTheDocument();

    // Online providers should be rendered
    const copymangaOption = screen.getByText(/在 CopyManga 中搜索 "Chainsaw"|Search "Chainsaw" in CopyManga/i);
    expect(copymangaOption).toBeInTheDocument();
    const rawmangaOption = screen.getByText(/在 RawManga 中搜索 "Chainsaw"|Search "Chainsaw" in RawManga/i);
    expect(rawmangaOption).toBeInTheDocument();

    // Click local item
    fireEvent.click(screen.getByText("Chainsaw Man"));
    expect(handleSelectLocal).toHaveBeenCalledWith("manga-1");
  });

  it("handles online search selection and disabled settings shortcut", () => {
    const handleOnlineSearch = vi.fn();
    const handleOpenSettingsTab = vi.fn();

    const disabledSettings: AppSettings = {
      ...baseSettings,
      downloader: {
        enableCopyManga: false,
        enableRawManga: false,
      },
    };

    const { rerender } = render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={0}
        onBackToMain={vi.fn()}
        searchQuery="Naruto"
        onSearchChange={vi.fn()}
        settings={disabledSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        localMangaItems={[]}
        onOpenOnlineSearch={handleOnlineSearch}
        onOpenSettingsTab={handleOpenSettingsTab}
      />
    );

    const input = screen.getByPlaceholderText(i18n.t("library.searchPlaceholder"));
    fireEvent.focus(input);

    // Shows disabled notice
    const disabledNotice = screen.getByText(i18n.t("downloader.onlineSearchDisabled"));
    expect(disabledNotice).toBeInTheDocument();

    // Clicking settings link opens settings downloads tab
    const openSettingsBtn = screen.getByText(i18n.t("downloader.openSettings"));
    fireEvent.click(openSettingsBtn);
    expect(handleOpenSettingsTab).toHaveBeenCalledWith("downloads");

    // Re-render with copyManga enabled
    rerender(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={0}
        onBackToMain={vi.fn()}
        searchQuery="Naruto"
        onSearchChange={vi.fn()}
        settings={{
          ...baseSettings,
          downloader: {
            enableCopyManga: true,
            enableRawManga: false,
          },
        }}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        localMangaItems={[]}
        onOpenOnlineSearch={handleOnlineSearch}
        onOpenSettingsTab={handleOpenSettingsTab}
      />
    );

    fireEvent.focus(input);
    const copymangaBtn = screen.getByText(/在 CopyManga 中搜索 "Naruto"|Search "Naruto" in CopyManga/i);
    fireEvent.click(copymangaBtn);
    expect(handleOnlineSearch).toHaveBeenCalledWith("copymanga", "Naruto");
  });

  it("renders download count and speed in download button when downloading", () => {
    render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={0}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        downloadTasks={[
          {
            id: "t1",
            source: "copymanga",
            mangaID: "m1",
            mangaTitle: "Manga 1",
            chapterID: "c1",
            chapterTitle: "Ch 1",
            chapterNumber: 1,
            status: "downloading",
            totalPages: 10,
            downloadedPages: 2,
          },
        ]}
        downloadProgress={{
          activeTasks: 2,
          totalTasks: 2,
          downloadedPages: 4,
          totalPages: 20,
          speedFormatted: "2.4 MB/s",
          bytesPerSec: 2516582,
        }}
      />
    );

    // Number of active downloads
    expect(screen.getByText("2")).toBeInTheDocument();
    // Speed formatted
    expect(screen.getByText("2.4 MB/s")).toBeInTheDocument();
  });

  it("renders visible update check indicators in download button when checking updates", () => {
    const { rerender } = render(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={0}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        downloadTasks={[]}
        downloadProgress={{
          activeTasks: 0,
          totalTasks: 0,
          downloadedPages: 0,
          totalPages: 0,
          speedFormatted: "",
          bytesPerSec: 0,
        }}
        followedUpdateProgress={{
          checking: true,
          current: 1,
          total: 4,
          queued: 0,
        }}
      />
    );

    // Visible indicator shows (current/total)
    expect(screen.getByText("1/4")).toBeInTheDocument();

    // Rerender when downloading AND checking
    rerender(
      <AppHeader
        selectedCollectionPath={null}
        totalCount={0}
        onBackToMain={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        settings={baseSettings}
        onCycleTheme={vi.fn()}
        onCycleLocale={vi.fn()}
        settingsOpen={false}
        onToggleSettings={vi.fn()}
        downloadTasks={[]}
        downloadProgress={{
          activeTasks: 3,
          totalTasks: 3,
          downloadedPages: 5,
          totalPages: 30,
          speedFormatted: "1.2 MB/s",
          bytesPerSec: 1258291,
        }}
        followedUpdateProgress={{
          checking: true,
          current: 2,
          total: 4,
          queued: 0,
        }}
      />
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1.2 MB/s")).toBeInTheDocument();
  });
});

