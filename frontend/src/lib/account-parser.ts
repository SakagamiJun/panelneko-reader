import type { CopyMangaAccountInput } from "./contracts";

/**
 * Parses clipboard text into CopyMangaAccountInput entries.
 * Supports standard JSON arrays and fallback delimited lines (----, tab, colon, comma).
 */
export function parseAccountsClipboardText(text: string): CopyMangaAccountInput[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // 1. Try parsing JSON array
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const results: CopyMangaAccountInput[] = [];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const u = String(item.username ?? item.user ?? item.account ?? "").trim();
        if (!u) continue;
        const rawPwd = item.password ?? item.pwd;
        const p = rawPwd !== undefined && rawPwd !== null ? String(rawPwd).trim() : "";
        const rawTok = item.token ?? item.tok;
        const tok = rawTok !== undefined && rawTok !== null ? String(rawTok).trim() : "";
        results.push({
          username: u,
          password: p,
          token: tok,
        });
      }

      if (results.length > 0) {
        return results;
      }
    } catch {
      // Fallback to line-by-line parsing
    }
  }

  // 2. Fallback: line-by-line delimited format
  const lines = trimmed.split(/\r?\n/);
  const results: CopyMangaAccountInput[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) {
      continue;
    }

    let parts: string[] = [];
    if (line.includes("----")) {
      parts = line.split("----");
    } else if (line.includes("\t")) {
      parts = line.split("\t");
    } else if (line.includes(",")) {
      parts = line.split(",");
    } else if (line.includes(":")) {
      parts = line.split(":");
    } else if (line.includes(" ")) {
      parts = line.split(/\s+/);
    } else {
      parts = [line];
    }

    const username = (parts[0] || "").trim();
    if (!username) {
      continue;
    }

    const password = (parts[1] || "").trim();
    const token = (parts[2] || "").trim();

    results.push({
      username,
      password,
      token,
    });
  }

  return results;
}
