import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DownloadWidget } from "./download-widget";
import type { DownloadProgress, DownloadTask } from "@/lib/contracts";

const mockTasks: DownloadTask[] = [
  {
    id: "task-1",
    source: "copymanga",
    mangaID: "m-1",
    mangaTitle: "Frieren",
    chapterID: "ch-1",
    chapterTitle: "Chapter 1",
    chapterNumber: 1,
    status: "downloading",
    totalPages: 20,
    downloadedPages: 10,
    speed: "2.5 MB/s",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "task-2",
    source: "klz9",
    mangaID: "m-2",
    mangaTitle: "One Piece",
    chapterID: "ch-100",
    chapterTitle: "Chapter 100",
    chapterNumber: 100,
    status: "paused",
    totalPages: 18,
    downloadedPages: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockProgress: DownloadProgress = {
  activeTasks: 1,
  totalTasks: 2,
  downloadedPages: 15,
  totalPages: 38,
  speedFormatted: "2.5 MB/s",
  bytesPerSec: 2.5 * 1024 * 1024,
};

describe("DownloadWidget Component", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders collapsed pill state with pages progress and speed", () => {
    render(
      <DownloadWidget
        tasks={mockTasks}
        progress={mockProgress}
        onPauseTask={vi.fn()}
        onResumeTask={vi.fn()}
        onCancelTask={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );

    expect(screen.getByRole("region")).toBeDefined();
    expect(screen.getByText(/15\/38/)).toBeDefined();
    expect(screen.getByText("2.5 MB/s")).toBeDefined();
  });

  it("expands on click and shows task list with actions", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onCancel = vi.fn();

    render(
      <DownloadWidget
        tasks={mockTasks}
        progress={mockProgress}
        onPauseTask={onPause}
        onResumeTask={onResume}
        onCancelTask={onCancel}
        onClearCompleted={vi.fn()}
      />
    );

    // Click to expand
    fireEvent.click(screen.getByRole("region"));

    // Check expanded contents
    expect(screen.getByText("Frieren")).toBeDefined();
    expect(screen.getByText("One Piece")).toBeDefined();

    // Trigger pause on first task
    const pauseBtn = screen.getByTitle(/downloader\.pause|Pause/i);
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledWith("task-1");

    // Trigger resume on second task
    const resumeBtn = screen.getByTitle(/downloader\.resume|Resume/i);
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledWith("task-2");
  });

  it("renders nothing when task list is empty", () => {
    const { container } = render(
      <DownloadWidget
        tasks={[]}
        progress={{ activeTasks: 0, totalTasks: 0, downloadedPages: 0, totalPages: 0, speedFormatted: "", bytesPerSec: 0 }}
        onPauseTask={vi.fn()}
        onResumeTask={vi.fn()}
        onCancelTask={vi.fn()}
        onClearCompleted={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
