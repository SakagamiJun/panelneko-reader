import { describe, expect, it } from "vitest";
import { zhCN } from "@/locales/zh-CN";
import { en } from "@/locales/en";
import { ja } from "@/locales/ja";

type Dict = Record<string, unknown>;

function getDeepKeys(obj: Dict, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return getDeepKeys(value as Dict, fullKey);
    }
    return [fullKey];
  });
}

describe("i18n locale dictionaries", () => {
  const zhKeys = getDeepKeys(zhCN).sort();
  const enKeys = getDeepKeys(en).sort();
  const jaKeys = getDeepKeys(ja).sort();

  it("should have symmetrical translation keys across zh-CN, en, and ja", () => {
    expect(enKeys).toEqual(zhKeys);
    expect(jaKeys).toEqual(zhKeys);
  });

  it("should not contain empty string translations", () => {
    const checkNoEmptyValues = (dict: Dict, lang: string) => {
      for (const [section, values] of Object.entries(dict)) {
        if (values && typeof values === "object") {
          for (const [k, v] of Object.entries(values as Dict)) {
            expect(typeof v === "string" && v.trim().length > 0, `${lang}.${section}.${k} should not be empty`).toBe(true);
          }
        }
      }
    };

    checkNoEmptyValues(zhCN, "zhCN");
    checkNoEmptyValues(en, "en");
    checkNoEmptyValues(ja, "ja");
  });

  it("should match official application slogans exactly", () => {
    expect(zhCN.settings.appSlogan).toBe("一款极简、现代且高性能的本地漫画阅读器");
    expect(en.settings.appSlogan).toBe("A modern, minimalist, and high-performance offline manga reader");
    expect(ja.settings.appSlogan).toBe("ミニマルでモダン、高性能なローカル漫画リーダー");
  });

  it("should contain all required settings dialog keys", () => {
    const requiredKeys = [
      "headerDesc",
      "autoSaved",
      "close",
      "aboutTab",
      "outputRootDesc",
      "groupPerformance",
      "groupPerformanceDesc",
      "groupLayout",
      "groupLayoutDesc",
      "spreadModeHint",
      "directionHint",
      "sideClickRightNextShort",
      "sideClickFollowShort",
      "sideClickLeftNextShort",
      "groupDisplay",
      "groupDisplayDesc",
      "fitModeHint",
      "filterHint",
      "groupZoom",
      "groupZoomDesc",
      "shortcutsDesc",
      "shortcutNotSet",
      "aboutPanelNeko",
      "appSlogan",
      "appVersion",
      "buildCommit",
      "license",
      "shortcutHelp",
      "openSettingsShortcut",
      "groupUpdates",
      "groupUpdatesDesc",
      "currentVersionPrefix",
      "acknowledgments",
      "acknowledgmentsDesc",
      "ackWailsDesc",
      "ackGoDesc",
      "ackReactDesc",
      "ackTailwindDesc",
      "ackTanstackDesc",
      "ackSqliteDesc",
      "ackLucideDesc",
    ];

    for (const key of requiredKeys) {
      expect(key in zhCN.settings, `zhCN.settings should have key '${key}'`).toBe(true);
      expect(key in en.settings, `en.settings should have key '${key}'`).toBe(true);
      expect(key in ja.settings, `ja.settings should have key '${key}'`).toBe(true);
    }
  });

  it("should contain newly added reader and library keys", () => {
    expect(zhCN.reader.allSettings).toBe("全部设置...");
    expect(en.reader.allSettings).toBe("All Settings...");
    expect(ja.reader.allSettings).toBe("すべての設定...");

    expect(zhCN.reader.loading).toBe("正在加载阅读器…");
    expect(en.reader.loading).toBe("Loading reader…");
    expect(ja.reader.loading).toBe("リーダーを読み込み中…");

    expect(zhCN.reader.loadFailed).toBe("无法打开当前漫画阅读器。");
    expect(en.reader.loadFailed).toBe("Failed to open reader for this manga.");
    expect(ja.reader.loadFailed).toBe("漫画リーダーを開けませんでした。");

    expect(zhCN.library.clearSearch).toBe("清空搜索");
    expect(en.library.clearSearch).toBe("Clear Search");
    expect(ja.library.clearSearch).toBe("検索をクリア");

    expect(zhCN.library.configureLibrary).toBe("配置漫画库目录");
    expect(en.library.configureLibrary).toBe("Configure Library Directory");
    expect(ja.library.configureLibrary).toBe("ライブラリフォルダーを設定");
  });
});
