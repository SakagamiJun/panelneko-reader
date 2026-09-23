import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
