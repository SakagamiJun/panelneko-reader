import * as AppBindings from "@bindings/github.com/sakagamijun/panelneko-reader/app";
import { Clipboard, Events, Window as WailsWindow } from "@wailsio/runtime";

export function isWailsEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const win = window as any;
  return Boolean(win._wails?.environment?.OS);
}

export async function toggleWindowFullscreen(): Promise<void> {
  if (isWailsEnvironment()) {
    try {
      await WailsWindow.ToggleFullscreen();
      return;
    } catch {
      // Fallback to DOM fullscreen on failure
    }
  }

  if (typeof document !== "undefined") {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }
}

export async function isWindowFullscreen(): Promise<boolean> {
  if (isWailsEnvironment()) {
    try {
      return await WailsWindow.IsFullscreen();
    } catch {
      // Fallback
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  return Boolean(
    document.fullscreenElement ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: fullscreen)").matches)
  );
}

export function getWailsApp() {
  return isWailsEnvironment() ? AppBindings : null;
}

export function emitRuntimeEvent(eventName: string, payload: unknown) {
  if (isWailsEnvironment()) {
    void Events.Emit(eventName as any, payload as any);
  }
}

export async function copyToClipboard(text: string): Promise<void> {
  if (isWailsEnvironment()) {
    try {
      await Clipboard.SetText(text);
      return;
    } catch {
      // Fallback
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}
