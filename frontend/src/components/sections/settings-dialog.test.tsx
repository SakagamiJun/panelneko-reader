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

    expect(screen.getByText(/生成封面缩略图缓存|Generate Cover Thumbnails|表紙サムネイルキャッシュの生成/i)).toBeInTheDocument();
    expect(screen.getByText(/缩略图缓存占用|Thumbnail Cache Size|サムネイルキャッシュ容量/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /清空缓存|Clear Cache|キャッシュを削除/i })).toBeInTheDocument();
  });

  it("calls onSave when toggling enableThumbnailCache switch", async () => {
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

    const switches = screen.getAllByRole("switch");
    // Find the switch for enableThumbnailCache (should be the third switch on general tab)
    const thumbSwitch = switches[switches.length - 1];
    fireEvent.click(thumbSwitch);

    expect(onSave).toHaveBeenCalled();
    const lastCall = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    expect(lastCall.enableThumbnailCache).toBe(false);
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
