import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFullscreen, useHasTrafficLights } from "./use-traffic-lights";
import * as systemModule from "@/lib/system";

describe("useFullscreen and useHasTrafficLights", () => {
  const originalFullscreenElement = document.fullscreenElement;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(document, "fullscreenElement", {
      value: originalFullscreenElement,
      configurable: true,
      writable: true,
    });
  });

  it("detects non-fullscreen on initial load in standard window", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current).toBe(false);
  });

  it("detects fullscreen when document.fullscreenElement is set and responds to fullscreenchange event", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: document.documentElement,
        configurable: true,
        writable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(document, "fullscreenElement", {
        value: null,
        configurable: true,
        writable: true,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current).toBe(false);
  });

  it("detects fullscreen from Wails runtime WindowIsFullscreen if available", async () => {
    const windowIsFullscreenMock = vi.fn().mockResolvedValue(true);
    (window as unknown as { runtime: { WindowIsFullscreen: () => Promise<boolean> } }).runtime = {
      WindowIsFullscreen: windowIsFullscreenMock,
    };

    const { result } = renderHook(() => useFullscreen());

    // Flush microtasks
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(true);
    delete (window as unknown as { runtime?: unknown }).runtime;
  });

  it("useHasTrafficLights returns true on Mac when not in fullscreen", () => {
    vi.spyOn(systemModule, "isMacPlatform").mockReturnValue(true);
    const { result } = renderHook(() => useHasTrafficLights());
    expect(result.current).toBe(true);
  });

  it("useHasTrafficLights returns false on Mac when in fullscreen", () => {
    vi.spyOn(systemModule, "isMacPlatform").mockReturnValue(true);
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useHasTrafficLights());
    expect(result.current).toBe(false);
  });

  it("useHasTrafficLights returns false on non-Mac even when not in fullscreen", () => {
    vi.spyOn(systemModule, "isMacPlatform").mockReturnValue(false);
    const { result } = renderHook(() => useHasTrafficLights());
    expect(result.current).toBe(false);
  });
});
