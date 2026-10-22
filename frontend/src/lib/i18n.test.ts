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
});
