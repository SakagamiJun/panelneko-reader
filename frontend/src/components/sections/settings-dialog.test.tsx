import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@/lib/i18n";
import { SettingsDialog } from "@/components/sections/settings-dialog";
import { appAdapter } from "@/lib/api";
import { APP_LINKS } from "@/lib/constants";
import type { AppSettings } from "@/lib/contracts";

const mockSettings: AppSettings = {
  libraryRoot: "/mock/library",
  localeMode: "system",
  locale: "zh-CN",
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
};

describe("SettingsDialog Component - About Tab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders GitHub project repository and feedback action buttons in About tab", () => {
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={vi.fn()}
        defaultTab="about"
        version="0.1.0"
        commit="d40a9d2"
      />
    );

    // Verify Project Repository row
    expect(screen.getByText(/项目地址|Project Repository|プロジェクトリポジトリ/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /访问链接|Visit Link|リンクを開く/i })).toBeInTheDocument();

    // Verify Feedback & Suggestions row
    expect(screen.getByText(/反馈与建议|Feedback & Issues|フィードバックと提案/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /报告 Bug|Report Bug|バグ報告/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /功能建议|Feature Request|機能提案/i })).toBeInTheDocument();
  });

  it("opens repository URL when visit link button is clicked", () => {
    const openURLSpy = vi.spyOn(appAdapter, "openURL").mockResolvedValue(undefined);

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={vi.fn()}
        defaultTab="about"
      />
    );

    const visitRepoBtn = screen.getByRole("button", { name: /访问链接|Visit Link|リンクを開く/i });
    fireEvent.click(visitRepoBtn);

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith(APP_LINKS.REPO);
  });

  it("opens bug report template URL when report bug button is clicked", () => {
    const openURLSpy = vi.spyOn(appAdapter, "openURL").mockResolvedValue(undefined);

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={vi.fn()}
        defaultTab="about"
      />
    );

    const reportBugBtn = screen.getByRole("button", { name: /报告 Bug|Report Bug|バグ報告/i });
    fireEvent.click(reportBugBtn);

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith(APP_LINKS.BUG_REPORT);
  });

  it("opens feature request template URL when feature suggestion button is clicked", () => {
    const openURLSpy = vi.spyOn(appAdapter, "openURL").mockResolvedValue(undefined);

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={vi.fn()}
        defaultTab="about"
      />
    );

    const suggestFeatureBtn = screen.getByRole("button", { name: /功能建议|Feature Request|機能提案/i });
    fireEvent.click(suggestFeatureBtn);

    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledWith(APP_LINKS.FEATURE_REQUEST);
  });
});

describe("SettingsDialog Component - Performance & Cache Settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders thumbnail cache switch and clear button in general tab", async () => {
    vi.spyOn(appAdapter, "getThumbnailCacheSize").mockResolvedValue(1048576); // 1.0 MB

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={vi.fn()}
        defaultTab="general"
      />
    );

    expect(screen.getByText(/封面缩略图画质|Cover Thumbnail Quality|表紙サムネイル画質/i)).toBeInTheDocument();
    expect(screen.getByText(/缩略图缓存占用|Thumbnail Cache Size|サムネイルキャッシュ容量/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /清空缓存|Clear Cache|キャッシュを削除/i })).toBeInTheDocument();
  });

  it("calls onSave when selecting thumbnail quality in segmented control", async () => {
    const onSave = vi.fn();

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={onSave}
        defaultTab="general"
      />
    );

    const offRadio = screen.getByRole("radio", { name: /关闭|Off|無効/i });
    fireEvent.click(offRadio);

    expect(onSave).toHaveBeenCalled();
    const lastCall = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(lastCall.thumbnailQuality).toBe("off");
    expect(lastCall.enableThumbnailCache).toBe(false);

    const highRadio = screen.getByRole("radio", { name: /高|High/i });
    fireEvent.click(highRadio);
    const lastCallHigh = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(lastCallHigh.thumbnailQuality).toBe("high");
    expect(lastCallHigh.enableThumbnailCache).toBe(true);
  });

  it("calls clearThumbnailCache when clear button is clicked", async () => {
    const clearSpy = vi.spyOn(appAdapter, "clearThumbnailCache").mockResolvedValue(undefined);
    vi.spyOn(appAdapter, "getThumbnailCacheSize").mockResolvedValue(5242880); // 5.0 MB

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={mockSettings}
        onSave={vi.fn()}
        defaultTab="general"
      />
    );

    const clearBtn = screen.getByRole("button", { name: /清空缓存|Clear Cache|キャッシュを削除/i });
    await waitFor(() => expect(clearBtn).not.toBeDisabled());
    fireEvent.click(clearBtn);

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});

describe("SettingsDialog Component - Sources Tab", () => {
  const multiSourceSettings: AppSettings = {
    ...mockSettings,
    librarySources: [
      {
        id: "src-1",
        name: "Main Manga",
        type: "local",
        path: "/mock/library/main",
        enabled: true,
        status: "online",
        mangaCount: 12,
      },
      {
        id: "src-2",
        name: "External Drive",
        type: "local",
        path: "/Volumes/ExtSSD/comics",
        enabled: true,
        status: "offline",
        mangaCount: 8,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders sources list with status, names, paths, and manga counts", () => {
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={multiSourceSettings}
        onSave={vi.fn()}
        defaultTab="sources"
      />
    );

    expect(screen.getByText("Main Manga")).toBeInTheDocument();
    expect(screen.getByText("/mock/library/main")).toBeInTheDocument();
    expect(screen.getByText("External Drive")).toBeInTheDocument();
    expect(screen.getByText("/Volumes/ExtSSD/comics")).toBeInTheDocument();
  });

  it("triggers rescan when rescan button is clicked", async () => {
    const rescanSpy = vi.spyOn(appAdapter, "rescanSource").mockResolvedValue(undefined);
    vi.spyOn(appAdapter, "getSettings").mockResolvedValue(multiSourceSettings);

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={multiSourceSettings}
        onSave={vi.fn()}
        defaultTab="sources"
      />
    );

    const rescanBtns = screen.getAllByRole("button", { name: /重新扫描|Rescan|再スキャン/i });
    fireEvent.click(rescanBtns[0]);

    expect(rescanSpy).toHaveBeenCalledWith("src-1");
  });

  it("opens add source form and cancels", () => {
    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={multiSourceSettings}
        onSave={vi.fn()}
        defaultTab="sources"
      />
    );

    const addBtn = screen.getAllByRole("button", { name: /添加目录|Add Directory|ディレクトリを追加/i })[0];
    fireEvent.click(addBtn);

    expect(screen.getByText(/添加漫画库目录|Add Library Directory|ライブラリディレクトリを追加/i)).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: /取消|Cancel|キャンセル/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByText(/添加漫画库目录|Add Library Directory|ライブラリディレクトリを追加/i)).not.toBeInTheDocument();
  });

  it("allows editing source alias inline", async () => {
    const updateSourceSpy = vi.spyOn(appAdapter, "updateLibrarySource").mockResolvedValue({
      ...multiSourceSettings,
      librarySources: [
        {
          ...multiSourceSettings.librarySources![0],
          name: "Renamed Manga",
        },
        multiSourceSettings.librarySources![1],
      ],
    });

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={multiSourceSettings}
        onSave={vi.fn()}
        defaultTab="sources"
      />
    );

    const editBtns = screen.getAllByTitle(/修改别名|Edit Alias|別名を編集/i);
    fireEvent.click(editBtns[0]);

    const input = screen.getByPlaceholderText(/输入新的目录别名|Enter new directory alias|新しいディレクトリの別名を入力/i);
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Renamed Manga" } });

    const saveBtn = screen.getByRole("button", { name: /保存|Save/i });
    fireEvent.click(saveBtn);

    expect(updateSourceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "src-1",
        name: "Renamed Manga",
      })
    );
  });

  it("renders duplicate merge mode control and updates setting on change", () => {
    const onSaveSpy = vi.fn();

    render(
      <SettingsDialog
        open={true}
        onClose={vi.fn()}
        settings={multiSourceSettings}
        onSave={onSaveSpy}
        defaultTab="sources"
      />
    );

    expect(screen.getAllByText(/同名内容展示策略|Duplicate Content Strategy|同名コンテンツの表示方針/i).length).toBeGreaterThanOrEqual(1);

    const mergeBtn = screen.getByRole("radio", { name: /自动合并|Auto Merge|自動統合/i });
    fireEvent.click(mergeBtn);

    expect(onSaveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        duplicateMergeMode: "merge",
      })
    );
  });
});

