import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DownloadPopover } from "./download-popover";
import type { DownloadProgress, DownloadTask } from "@/lib/contracts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      const dict: Record<string, string> = {
        "downloader.managerTitle": "下载管理",
        "downloader.activeCount": `${options?.count ?? 0} 个任务下载中`,
        "downloader.idleStatus": "当前无进行中的下载任务",
        "downloader.allFinished": "所有下载任务已完成",
        "downloader.allPaused": "下载任务已全部暂停",
        "downloader.clearCompleted": "清除已完成记录",
        "downloader.clear": "清除",
        "downloader.collapse": "收起",
        "downloader.statusDownloading": "下载中",
        "downloader.statusPaused": "已暂停",
        "downloader.statusCompleted": "已完成",
        "downloader.statusFailed": "下载失败",
        "downloader.pages": "页",
        "downloader.pause": "暂停",
        "downloader.resume": "继续",
        "downloader.retry": "重试",
        "downloader.cancel": "取消任务",
        "downloader.checkFollowedUpdates": "检查追更",
        "downloader.checkingFollowedUpdates": "正在检查追更…",
        "downloader.checkingFollowedUpdatesProgress": `正在检查 (${options?.current ?? 0}/${options?.total ?? 0})`,
        "downloader.idleBadge": "空闲",
        "downloader.activeBadge": `${options?.count ?? 0} 进行中`,
        "downloader.noFollowedUpdates": "所有追更漫画已是最新",
        "downloader.foundFollowedUpdates": `已添加 ${options?.count ?? 0} 个新章节到下载队列`,
        "downloader.checkFollowedUpdatesFailed": "检查追更失败，请重试",
        "downloader.noTasks": "暂无下载任务",
        "downloader.noTasksHint": "可在搜索栏或追更漫画中添加下载任务",
        "downloader.openDownloadSettings": "下载设置",
      };
      return dict[key] ?? key;
    },
  }),
}));

describe("DownloadPopover Component", () => {
  afterEach(() => {
    cleanup();
  });

  const dummyProgress: DownloadProgress = {
    activeTasks: 1,
    totalTasks: 2,
    downloadedPages: 10,
    totalPages: 30,
    speedFormatted: "1.5 MB/s",
    bytesPerSec: 1572864,
  };

  const dummyTasks: DownloadTask[] = [
    {
      id: "task-1",
      source: "copymanga",
      mangaID: "one-piece",
      mangaTitle: "航海王",
      chapterID: "chap-100",
      chapterTitle: "第100话",
      chapterNumber: 100,
      status: "downloading",
      totalPages: 20,
      downloadedPages: 10,
      speed: "1.5 MB/s",
      createdAt: "2026-10-31T00:00:00Z",
      updatedAt: "2026-10-31T00:00:00Z",
    },
    {
      id: "task-2",
      source: "copymanga",
      mangaID: "one-piece",
      mangaTitle: "航海王",
      chapterID: "chap-99",
      chapterTitle: "第99话",
      chapterNumber: 99,
      status: "completed",
      totalPages: 20,
      downloadedPages: 20,
      createdAt: "2026-10-31T00:00:00Z",
      updatedAt: "2026-10-31T00:00:00Z",
    },
  ];

  it("renders empty state when tasks list is empty", () => {
    render(
      <DownloadPopover
        tasks={[]}
        progress={{
          activeTasks: 0,
          totalTasks: 0,
          downloadedPages: 0,
          totalPages: 0,
          speedFormatted: "",
          bytesPerSec: 0,
        }}
      />
    );

    expect(screen.getByText("暂无下载任务")).toBeInTheDocument();
    expect(screen.getByText("可在搜索栏或追更漫画中添加下载任务")).toBeInTheDocument();
  });

  it("renders tasks list with progress and instantaneous speed", () => {
    render(
      <DownloadPopover
        tasks={dummyTasks}
        progress={dummyProgress}
      />
    );

    expect(screen.getByText("第100话")).toBeInTheDocument();
    expect(screen.getByText("第99话")).toBeInTheDocument();
    const speeds = screen.getAllByText("1.5 MB/s");
    expect(speeds.length).toBeGreaterThan(0);
    expect(screen.getByText("10/20 页")).toBeInTheDocument();
  });

  it("triggers pause, resume, cancel, and clear callbacks correctly", () => {
    const onPause = vi.fn();
    const onCancel = vi.fn();
    const onClear = vi.fn();

    render(
      <DownloadPopover
        tasks={dummyTasks}
        progress={dummyProgress}
        onPauseTask={onPause}
        onCancelTask={onCancel}
        onClearCompleted={onClear}
      />
    );

    // Pause downloading task
    const pauseBtn = screen.getByTitle("暂停");
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledWith("task-1");

    // Cancel task
    const cancelBtns = screen.getAllByTitle("取消任务");
    fireEvent.click(cancelBtns[0]);
    expect(onCancel).toHaveBeenCalledWith("task-1");

    // Clear completed tasks
    const clearBtn = screen.getByTitle("清除已完成记录");
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it("triggers onCheckAllUpdates and shows inline feedback", async () => {
    const onCheckUpdates = vi.fn().mockResolvedValue(3);

    render(
      <DownloadPopover
        tasks={[]}
        progress={{
          activeTasks: 0,
          totalTasks: 0,
          downloadedPages: 0,
          totalPages: 0,
          speedFormatted: "",
          bytesPerSec: 0,
        }}
        onCheckAllUpdates={onCheckUpdates}
      />
    );

    const checkBtn = screen.getByTitle("检查追更");
    fireEvent.click(checkBtn);

    expect(onCheckUpdates).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("已添加 3 个新章节到下载队列")).toBeInTheDocument();
    });
  });

  it("shows up-to-date feedback when no updates found", async () => {
    const onCheckUpdates = vi.fn().mockResolvedValue(0);

    render(
      <DownloadPopover
        tasks={[]}
        progress={{
          activeTasks: 0,
          totalTasks: 0,
          downloadedPages: 0,
          totalPages: 0,
          speedFormatted: "",
          bytesPerSec: 0,
        }}
        onCheckAllUpdates={onCheckUpdates}
      />
    );

    const checkBtn = screen.getByTitle("检查追更");
    fireEvent.click(checkBtn);

    expect(onCheckUpdates).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("所有追更漫画已是最新")).toBeInTheDocument();
    });
  });

  it("shows checkProgress status with (current/total) and keeps button disabled across reopenings", () => {
    const onCheckUpdates = vi.fn();

    // First render with checking state (2/5)
    const { unmount } = render(
      <DownloadPopover
        tasks={[]}
        progress={{
          activeTasks: 0,
          totalTasks: 0,
          downloadedPages: 0,
          totalPages: 0,
          speedFormatted: "",
          bytesPerSec: 0,
        }}
        checkProgress={{
          checking: true,
          current: 2,
          total: 5,
          queued: 0,
        }}
        onCheckAllUpdates={onCheckUpdates}
      />
    );

    const progressBtn = screen.getByTitle("正在检查 (2/5)");
    expect(progressBtn).toBeInTheDocument();
    expect(progressBtn).toBeDisabled();
    expect(screen.getByText("正在检查 (2/5)")).toBeInTheDocument();

    // Simulate closing popover
    unmount();

    // Reopen popover while still checking (3/5)
    render(
      <DownloadPopover
        tasks={[]}
        progress={{
          activeTasks: 0,
          totalTasks: 0,
          downloadedPages: 0,
          totalPages: 0,
          speedFormatted: "",
          bytesPerSec: 0,
        }}
        checkProgress={{
          checking: true,
          current: 3,
          total: 5,
          queued: 0,
        }}
        onCheckAllUpdates={onCheckUpdates}
      />
    );

    const reopenedBtn = screen.getByTitle("正在检查 (3/5)");
    expect(reopenedBtn).toBeInTheDocument();
    expect(reopenedBtn).toBeDisabled();
    expect(screen.getByText("正在检查 (3/5)")).toBeInTheDocument();
  });
});
