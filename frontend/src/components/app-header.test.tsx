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

  it("renders library title, total count, and does not render legacy open directory button", () => {
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
    // Legacy FolderOpen button should not exist
    expect(screen.queryByTitle(i18n.t("library.openDirectory"))).not.toBeInTheDocument();
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
});
