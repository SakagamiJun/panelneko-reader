import * as AppBindings from "@bindings/github.com/sakagamijun/panelneko-reader/app";
import { Events } from "@wailsio/runtime";

export function isWailsEnvironment(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const win = window as any;
  if (win._wails?.flags?.wails === true) {
    return true;
  }
  if (win.webkit?.messageHandlers?.external?.postMessage || win.chrome?.webview?.postMessage || win.wails?.invoke) {
    return true;
  }
  return false;
}

export function getWailsApp() {
  return isWailsEnvironment() ? AppBindings : null;
}

export function getWailsRuntime() {
  if (!isWailsEnvironment()) {
    return null;
  }
  return {
    EventsOn: (eventName: string, callback: (payload: unknown) => void) => {
      return Events.On(eventName as any, (ev: any) => callback(ev.data));
    },
    EventsOff: (eventName: string) => {
      Events.Off(eventName as any);
    },
    EventsEmit: (eventName: string, payload: unknown) => {
      void Events.Emit(eventName as any, payload as any);
    },
  };
}

export function emitRuntimeEvent(eventName: string, payload: unknown) {
  if (isWailsEnvironment()) {
    void Events.Emit(eventName as any, payload as any);
  }
}
