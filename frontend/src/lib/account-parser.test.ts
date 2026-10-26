import { describe, expect, it } from "vitest";
import { parseAccountsClipboardText } from "./account-parser";

describe("parseAccountsClipboardText - adversarial and boundary tests", () => {
  it("returns empty array on empty, whitespace, and comment inputs", () => {
    expect(parseAccountsClipboardText("")).toEqual([]);
    expect(parseAccountsClipboardText("   \n\r\n\t  ")).toEqual([]);
    expect(parseAccountsClipboardText("# comment line\n// another comment\n")).toEqual([]);
  });

  it("handles malformed JSON and falls back safely", () => {
    // Malformed JSON that looks like JSON starts
    const malformed = "[{ username: invalid_json }";
    // Falls back to line parsing where each line is checked
    const res = parseAccountsClipboardText(malformed);
    expect(res).toEqual([{ username: "[{ username", password: "invalid_json }", token: "" }]);
  });

  it("extracts valid accounts from JSON array while filtering empty usernames", () => {
    const jsonStr = JSON.stringify([
      { username: "  user1  ", password: "pwd1", token: "tok1" },
      { username: "", password: "pwd", token: "tok" },
      { nonUser: "value" },
      null,
      123,
      { user: "user2", pwd: "pwd2" },
      { account: "user3", token: "tok3" },
    ]);
    const res = parseAccountsClipboardText(jsonStr);
    expect(res).toHaveLength(3);
    expect(res[0]).toEqual({ username: "user1", password: "pwd1", token: "tok1" });
    expect(res[1]).toEqual({ username: "user2", password: "pwd2", token: "" });
    expect(res[2]).toEqual({ username: "user3", password: "", token: "tok3" });
  });

  it("handles line-by-line inputs with varying separators", () => {
    const raw = `
# accounts list
user_quad----pass_quad----tok_quad
user_tab\tpass_tab\ttok_tab
user_colon:pass_colon:tok_colon
user_single_colon:pass_only
user_comma,pass_comma,tok_comma
   user_space pass_space tok_space
    `;
    const res = parseAccountsClipboardText(raw);
    expect(res).toHaveLength(6);
    expect(res[0]).toEqual({ username: "user_quad", password: "pass_quad", token: "tok_quad" });
    expect(res[1]).toEqual({ username: "user_tab", password: "pass_tab", token: "tok_tab" });
    expect(res[2]).toEqual({ username: "user_colon", password: "pass_colon", token: "tok_colon" });
    expect(res[3]).toEqual({ username: "user_single_colon", password: "pass_only", token: "" });
    expect(res[4]).toEqual({ username: "user_comma", password: "pass_comma", token: "tok_comma" });
    expect(res[5]).toEqual({ username: "user_space", password: "pass_space", token: "tok_space" });
  });
});
