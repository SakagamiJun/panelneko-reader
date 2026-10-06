import { describe, expect, it, vi } from "vitest";
import { resolveLocale, resolveTheme, isMacPlatform } from "@/lib/system";
import { isWailsEnvironment, copyToClipboard } from "@/lib/runtime";

describe("resolveLocale", () => {
  it("maps zh locales to zh-CN", () => {
    expect(
      resolveLocale(
        {
          libraryRoot: "",
          localeMode: "system",
          locale: "en",
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
        },
        ["zh-Hans-CN"]
      )
    ).toBe("zh-CN");
  });

  it("prefers manual locale when localeMode is manual", () => {
    expect(
      resolveLocale({
        libraryRoot: "",
        localeMode: "manual",
        locale: "ja",
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
      })
    ).toBe("ja");
  });
});

describe("resolveTheme", () => {
  it("returns system dark when prefersDark is true", () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });
});

describe("isMacPlatform", () => {
  it("returns boolean value without throwing", () => {
    expect(typeof isMacPlatform()).toBe("boolean");
  });

  it("delegates to System.IsMac when in Wails environment", () => {
    const win = window as any;
    const originalWails = win._wails;
    try {
      win._wails = { environment: { OS: "darwin" } };
      expect(isMacPlatform()).toBe(true);

      win._wails = { environment: { OS: "windows" } };
      expect(isMacPlatform()).toBe(false);
    } finally {
      win._wails = originalWails;
    }
  });
});

describe("isWailsEnvironment", () => {
  it("returns true only when window._wails.environment.OS is present", () => {
    const win = window as any;
    const orig = win._wails;
    try {
      win._wails = { environment: { OS: "darwin" } };
      expect(isWailsEnvironment()).toBe(true);
      win._wails = {};
      expect(isWailsEnvironment()).toBe(false);
      delete win._wails;
      expect(isWailsEnvironment()).toBe(false);
    } finally {
      win._wails = orig;
    }
  });
});

describe("copyToClipboard", () => {
  it("falls back to navigator.clipboard in browser environment", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await copyToClipboard("test text");
    expect(writeTextMock).toHaveBeenCalledWith("test text");
  });
});
