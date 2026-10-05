import { describe, expect, it } from "vitest";
import { resolveLocale, resolveTheme, isMacPlatform } from "@/lib/system";

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
