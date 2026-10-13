import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@/lib/i18n";
import { OnlineSearchDialog } from "./online-search-dialog";
import { appAdapter } from "@/lib/api";
import type { OnlineMangaChapter, OnlineSearchResult } from "@/lib/contracts";

vi.mock("@/lib/api", () => ({
  appAdapter: {
    searchOnlineManga: vi.fn(),
    getOnlineMangaChapters: vi.fn(),
    createDownloadTasks: vi.fn(),
  },
}));

describe("OnlineSearchDialog Component", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const mockSearchResults: OnlineSearchResult = {
    totalItems: 1,
    page: 1,
    totalPages: 1,
    items: [
      {
        id: "dandadan",
        source: "copymanga",
        title: "Dandadan",
        author: "Tatsu Yukinobu",
        coverURL: "https://example.com/cover.jpg",
        status: "ongoing",
        totalChapters: 2,
      },
    ],
  };

  const mockChapters: OnlineMangaChapter[] = [
    {
      id: "ch-1",
      mangaID: "dandadan",
      title: "Chapter 1",
      number: 1,
      source: "copymanga",
    },
    {
      id: "ch-2",
      mangaID: "dandadan",
      title: "Chapter 2",
      number: 2,
      source: "copymanga",
    },
  ];

  it("does not render when open is false", () => {
    render(
      <OnlineSearchDialog
        open={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("performs search and allows chapter selection and download", async () => {
    vi.mocked(appAdapter.searchOnlineManga).mockResolvedValue(mockSearchResults);
    vi.mocked(appAdapter.getOnlineMangaChapters).mockResolvedValue(mockChapters);
    vi.mocked(appAdapter.createDownloadTasks).mockResolvedValue([]);

    const handleClose = vi.fn();
    const handleDownloadStarted = vi.fn();

    render(
      <OnlineSearchDialog
        open={true}
        onClose={handleClose}
        initialSource="copymanga"
        initialQuery="Dandadan"
        onDownloadStarted={handleDownloadStarted}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Verify search was invoked
    await waitFor(() => {
      expect(appAdapter.searchOnlineManga).toHaveBeenCalledWith("copymanga", "Dandadan", 1);
    });

    // Verify search result item is visible
    expect(await screen.findByText("Dandadan")).toBeInTheDocument();

    // Click manga to load chapters
    fireEvent.click(screen.getByText("Dandadan"));

    await waitFor(() => {
      expect(appAdapter.getOnlineMangaChapters).toHaveBeenCalledWith("copymanga", "dandadan");
    });

    // Chapters should be displayed and selected by default
    expect(await screen.findByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Chapter 2")).toBeInTheDocument();

    // Download button should show 2 selected chapters
    const downloadBtn = screen.getByRole("button", {
      name: /下载所选章节 \(2\)|Download Selected \(2\)|選択した章をダウンロード \(2\)/i,
    });
    expect(downloadBtn).toBeInTheDocument();

    // Click download
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(appAdapter.createDownloadTasks).toHaveBeenCalledTimes(1);
      expect(handleDownloadStarted).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("handles chapter selection controls (select all, deselect, invert)", async () => {
    vi.mocked(appAdapter.searchOnlineManga).mockResolvedValue(mockSearchResults);
    vi.mocked(appAdapter.getOnlineMangaChapters).mockResolvedValue(mockChapters);

    render(
      <OnlineSearchDialog
        open={true}
        onClose={vi.fn()}
        initialSource="copymanga"
        initialQuery="Dandadan"
      />
    );

    // Click manga to load chapters
    const mangaItem = await screen.findByText("Dandadan");
    fireEvent.click(mangaItem);

    await screen.findByText("Chapter 1");

    // Deselect All
    const deselectBtn = screen.getByRole("button", {
      name: /取消全选|\bDeselect All\b|選択解除/i,
    });
    fireEvent.click(deselectBtn);

    // Download button should be disabled when 0 chapters selected
    const downloadBtn = screen.getByRole("button", {
      name: /下载所选章节 \(0\)|Download Selected \(0\)|選択した章をダウンロード \(0\)/i,
    });
    expect(downloadBtn).toBeDisabled();

    // Select All
    const selectAllBtn = screen.getByRole("button", {
      name: /^全选$|\bSelect All\b|^すべて選択$/i,
    });
    fireEvent.click(selectAllBtn);
    expect(
      screen.getByRole("button", {
        name: /下载所选章节 \(2\)|Download Selected \(2\)|選択した章をダウンロード \(2\)/i,
      })
    ).not.toBeDisabled();

    // Single click toggles Chapter 1
    fireEvent.click(screen.getByText("Chapter 1"));
    expect(
      screen.getByRole("button", {
        name: /下载所选章节 \(1\)|Download Selected \(1\)|選択した章をダウンロード \(1\)/i,
      })
    ).not.toBeDisabled();
  });

  it("closes on Escape key press", () => {
    const handleClose = vi.fn();
    render(
      <OnlineSearchDialog
        open={true}
        onClose={handleClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
