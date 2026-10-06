import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import "@/lib/i18n";
import { UpdateToast } from "@/components/ui/update-toast";
import type { UpdateCheckResult } from "@/lib/contracts";
import * as runtimeModule from "@/lib/runtime";

describe("UpdateToast Component", () => {
  const mockUpdate: UpdateCheckResult = {
    hasUpdate: true,
    currentVersion: "0.1.0",
    latestVersion: "0.9.0",
    releaseURL: "https://github.com/SakagamiJun/panelneko-reader/releases/tag/v0.9.0",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders version badge and update description", () => {
    const handleClose = vi.fn();
    const handleView = vi.fn();

    render(
      <UpdateToast
        update={mockUpdate}
        onClose={handleClose}
        onViewUpdate={handleView}
      />
    );

    expect(screen.getByText("v0.9.0")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("calls onViewUpdate with release URL when action button clicked", () => {
    const handleClose = vi.fn();
    const handleView = vi.fn();

    render(
      <UpdateToast
        update={mockUpdate}
        onClose={handleClose}
        onViewUpdate={handleView}
      />
    );

    const actionButton = screen.getByRole("button", { name: /查看更新|view update|updates\.viewDetails/i });
    fireEvent.click(actionButton);
    expect(handleView).toHaveBeenCalledWith(mockUpdate.releaseURL);
  });

  it("auto-dismisses after durationMs expires", () => {
    const handleClose = vi.fn();
    const handleView = vi.fn();

    render(
      <UpdateToast
        update={mockUpdate}
        onClose={handleClose}
        onViewUpdate={handleView}
        durationMs={3000}
      />
    );

    expect(handleClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3050);
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders Homebrew upgrade command and copy button when isHomebrew is true", async () => {
    const handleClose = vi.fn();
    const handleView = vi.fn();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const homebrewUpdate: UpdateCheckResult = {
      ...mockUpdate,
      isHomebrew: true,
    };

    render(
      <UpdateToast
        update={homebrewUpdate}
        onClose={handleClose}
        onViewUpdate={handleView}
      />
    );

    expect(screen.getByText("brew upgrade panelneko")).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /复制命令|copy command/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith("brew upgrade panelneko");
  });

  it("calls copyToClipboard when copy button is clicked", async () => {
    const handleClose = vi.fn();
    const handleView = vi.fn();
    const copySpy = vi.spyOn(runtimeModule, "copyToClipboard").mockResolvedValue(undefined);

    try {
      const homebrewUpdate: UpdateCheckResult = {
        ...mockUpdate,
        isHomebrew: true,
      };

      render(
        <UpdateToast
          update={homebrewUpdate}
          onClose={handleClose}
          onViewUpdate={handleView}
        />
      );

      const copyBtn = screen.getByRole("button", { name: /复制命令|copy command/i });
      fireEvent.click(copyBtn);
      expect(copySpy).toHaveBeenCalledWith("brew upgrade panelneko");
    } finally {
      copySpy.mockRestore();
    }
  });

  it("does not render Homebrew upgrade command when isHomebrew is false", () => {
    const handleClose = vi.fn();
    const handleView = vi.fn();

    render(
      <UpdateToast
        update={{ ...mockUpdate, isHomebrew: false }}
        onClose={handleClose}
        onViewUpdate={handleView}
      />
    );

    expect(screen.queryByText("brew upgrade panelneko")).not.toBeInTheDocument();
  });
});
