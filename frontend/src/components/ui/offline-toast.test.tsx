import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import "@/lib/i18n";
import { OfflineToast } from "@/components/ui/offline-toast";

describe("OfflineToast Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders offline count badge, description, and action buttons", () => {
    const handleClose = vi.fn();
    const handleRescan = vi.fn();
    const handleToggleShowOffline = vi.fn();

    render(
      <OfflineToast
        offlineSourcesCount={2}
        showOffline={false}
        onClose={handleClose}
        onRescan={handleRescan}
        onToggleShowOffline={handleToggleShowOffline}
      />
    );

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新扫描|rescan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /显示离线书籍|show offline/i })).toBeInTheDocument();
  });

  it("triggers onRescan and onToggleShowOffline when buttons clicked", () => {
    const handleClose = vi.fn();
    const handleRescan = vi.fn();
    const handleToggleShowOffline = vi.fn();

    render(
      <OfflineToast
        offlineSourcesCount={1}
        showOffline={false}
        onClose={handleClose}
        onRescan={handleRescan}
        onToggleShowOffline={handleToggleShowOffline}
      />
    );

    const rescanBtn = screen.getByRole("button", { name: /重新扫描|rescan/i });
    fireEvent.click(rescanBtn);
    expect(handleRescan).toHaveBeenCalledTimes(1);

    const toggleBtn = screen.getByRole("button", { name: /显示离线书籍|show offline/i });
    fireEvent.click(toggleBtn);
    expect(handleToggleShowOffline).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses after durationMs expires", () => {
    const handleClose = vi.fn();

    render(
      <OfflineToast
        offlineSourcesCount={1}
        showOffline={false}
        onClose={handleClose}
        onRescan={vi.fn()}
        onToggleShowOffline={vi.fn()}
        durationMs={3000}
      />
    );

    expect(handleClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3050);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
