import { describe, expect, it } from "vitest";
import type { AppAdapter } from "./adapter";
import { appAdapter } from "./index";
import { MockAdapter } from "./mock-adapter";
import { WailsAdapter } from "./wails-adapter";

type AdapterMethod = keyof Omit<AppAdapter, "mode">;

const requiredAdapterMethods: AdapterMethod[] = [
  "getSettings",
  "updateSettings",
  "listLibraryManga",
  "getReaderManifest",
  "getReaderProgress",
  "updateReaderProgress",
  "getAppVersion",
  "selectDirectory",
  "togglePin",
  "toggleCollection",
  "openDirectory",
  "subscribe",
  "checkForUpdates",
  "openURL",
  "getThumbnailCacheSize",
  "clearThumbnailCache",
];

describe("AppAdapter Interface Completeness Guard", () => {
  it("MockAdapter implements all AppAdapter contract methods", () => {
    const mock = new MockAdapter();
    expect(mock.mode).toBe("mock");

    for (const method of requiredAdapterMethods) {
      expect(typeof mock[method], `MockAdapter missing implementation for ${method}`).toBe("function");
    }
  });

  it("WailsAdapter implements all AppAdapter contract methods", () => {
    const wails = new WailsAdapter();
    expect(wails.mode).toBe("wails");

    for (const method of requiredAdapterMethods) {
      expect(typeof wails[method], `WailsAdapter missing implementation for ${method}`).toBe("function");
    }
  });

  it("appAdapter unified dispatcher exposes all AppAdapter contract methods", () => {
    expect(["mock", "wails"]).toContain(appAdapter.mode);

    for (const method of requiredAdapterMethods) {
      expect(typeof appAdapter[method], `appAdapter missing forwarding for ${method}`).toBe("function");
    }
  });

  it("type compatibility check: both adapters statically satisfy AppAdapter", () => {
    const mockInstance: AppAdapter = new MockAdapter();
    const wailsInstance: AppAdapter = new WailsAdapter();
    expect(mockInstance).toBeDefined();
    expect(wailsInstance).toBeDefined();
  });
});
