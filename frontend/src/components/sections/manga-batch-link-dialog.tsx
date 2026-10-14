import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckSquare,
  Globe,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { appAdapter } from "@/lib/api";
import type { LibraryManga, MangaOnlineLink, OnlineMangaItem } from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface MangaBatchLinkDialogProps {
  open: boolean;
  onClose: () => void;
  mangas: LibraryManga[];
  onLinksChanged?: () => void;
}

export function MangaBatchLinkDialog({
  open,
  onClose,
  mangas,
  onLinksChanged,
}: MangaBatchLinkDialogProps) {
  const { t } = useTranslation();

  const [activeSource, setActiveSource] = useState<"copymanga" | "klz9">("copymanga");
  const [filterQuery, setFilterQuery] = useState("");
  const [linksMap, setLinksMap] = useState<Map<string, MangaOnlineLink>>(new Map());
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [matchResults, setMatchResults] = useState<Map<string, OnlineMangaItem[]>>(new Map());
  const [selectedMatch, setSelectedMatch] = useState<Map<string, OnlineMangaItem>>(new Map());
  const [matchingIds, setMatchingIds] = useState<Set<string>>(new Set());
  const [batchMatching, setBatchMatching] = useState(false);
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  const [batchPolicy, setBatchPolicy] = useState<"latest_only" | "fill_gaps">("latest_only");

  // Load existing links
  const loadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const list = await appAdapter.getAllMangaOnlineLinks();
      const map = new Map<string, MangaOnlineLink>();
      for (const link of list) {
        map.set(link.mangaId, link);
      }
      setLinksMap(map);
    } catch (err) {
      console.error("Failed to load manga online links:", err);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadLinks();
      setSelectedIds(new Set());
      setMatchResults(new Map());
      setSelectedMatch(new Map());
      setFilterQuery("");
    }
  }, [open, loadLinks]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Filter manga list (exclude collections)
  const nonCollectionMangas = useMemo(() => {
    return mangas.filter((m) => !m.isCollection);
  }, [mangas]);

  const displayedMangas = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return nonCollectionMangas;
    return nonCollectionMangas.filter((m) => m.title.toLowerCase().includes(q));
  }, [nonCollectionMangas, filterQuery]);

  // Match a single manga
  const handleMatchSingle = async (manga: LibraryManga) => {
    setMatchingIds((prev) => new Set(prev).add(manga.id));
    try {
      const results = await appAdapter.matchLocalManga(manga.id, activeSource);
      setMatchResults((prev) => new Map(prev).set(manga.id, results));
      if (results.length > 0) {
        setSelectedMatch((prev) => new Map(prev).set(manga.id, results[0]));
        setSelectedIds((prev) => new Set(prev).add(manga.id));
      }
    } catch (err) {
      console.error("Match error for:", manga.title, err);
    } finally {
      setMatchingIds((prev) => {
        const next = new Set(prev);
        next.delete(manga.id);
        return next;
      });
    }
  };

  // Batch match unlinked manga
  const handleBatchMatch = async () => {
    const unlinked = displayedMangas.filter((m) => !linksMap.has(m.id));
    if (unlinked.length === 0) return;

    setBatchMatching(true);
    for (const manga of unlinked) {
      await handleMatchSingle(manga);
    }
    setBatchMatching(false);
  };

  // Link a single manga
  const handleLinkSingle = async (manga: LibraryManga) => {
    const matched = selectedMatch.get(manga.id);
    if (!matched) return;

    setSubmittingIds((prev) => new Set(prev).add(manga.id));
    try {
      await appAdapter.linkMangaOnline({
        mangaId: manga.id,
        onlineSource: activeSource,
        onlineComicId: matched.id,
        onlineTitle: matched.title,
        autoFollow: true,
        followPolicy: batchPolicy,
      });
      await loadLinks();
      onLinksChanged?.();
    } catch (err) {
      console.error("Link error:", err);
    } finally {
      setSubmittingIds((prev) => {
        const next = new Set(prev);
        next.delete(manga.id);
        return next;
      });
    }
  };

  // Unlink a manga
  const handleUnlink = async (mangaId: string) => {
    setSubmittingIds((prev) => new Set(prev).add(mangaId));
    try {
      await appAdapter.unlinkMangaOnline(mangaId);
      await loadLinks();
      onLinksChanged?.();
    } catch (err) {
      console.error("Unlink error:", err);
    } finally {
      setSubmittingIds((prev) => {
        const next = new Set(prev);
        next.delete(mangaId);
        return next;
      });
    }
  };

  // Batch link all selected
  const handleBatchLinkSelected = async () => {
    const toLink = Array.from(selectedIds)
      .map((id) => {
        const manga = nonCollectionMangas.find((m) => m.id === id);
        const match = selectedMatch.get(id);
        return { manga, match };
      })
      .filter((item) => item.manga && item.match);

    if (toLink.length === 0) return;

    setBatchMatching(true);
    for (const item of toLink) {
      if (item.manga && item.match) {
        await appAdapter.linkMangaOnline({
          mangaId: item.manga.id,
          onlineSource: activeSource,
          onlineComicId: item.match.id,
          onlineTitle: item.match.title,
          autoFollow: true,
          followPolicy: batchPolicy,
        });
      }
    }
    await loadLinks();
    onLinksChanged?.();
    setBatchMatching(false);
    setSelectedIds(new Set());
  };

  // Selection toggles
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const valid = displayedMangas.filter((m) => selectedMatch.has(m.id)).map((m) => m.id);
    setSelectedIds(new Set(valid));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-150 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-[1000px] max-w-[96vw] h-[680px] max-h-[92vh] rounded-2xl border border-border/80 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden select-none animate-in zoom-in-95 duration-150 text-foreground"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("batchLink.dialogTitle")}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 h-14 shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground leading-none">
                {t("batchLink.dialogTitle")}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t("batchLink.dialogDesc")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onClose}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-border/40 bg-muted/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder={t("batchLink.filterPlaceholder")}
                className="pl-8 h-8 text-xs bg-background/80"
              />
            </div>
            <SegmentedControl
              value={activeSource}
              onChange={(val) => setActiveSource(val as "copymanga" | "klz9")}
              options={[
                { value: "copymanga", label: "CopyManga" },
                { value: "klz9", label: "RawManga" },
              ]}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void handleBatchMatch()}
              disabled={batchMatching}
              className="h-8 text-xs gap-1.5"
            >
              {batchMatching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              <span>{t("batchLink.batchMatchAll")}</span>
            </Button>
            <div className="h-4 w-[1px] bg-border/60 mx-1" />
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleSelectAll}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <CheckSquare className="h-3 w-3 mr-1" />
              <span>{t("downloader.selectAll")}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleDeselectAll}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Square className="h-3 w-3 mr-1" />
              <span>{t("downloader.deselectAll")}</span>
            </Button>
          </div>
        </div>

        {/* Manga List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loadingLinks ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-xs">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>{t("batchLink.loading")}</span>
            </div>
          ) : displayedMangas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/60 text-xs text-center">
              <span>{t("batchLink.empty")}</span>
            </div>
          ) : (
            displayedMangas.map((manga) => {
              const link = linksMap.get(manga.id);
              const isLinked = Boolean(link && link.onlineComicId);
              const isSelected = selectedIds.has(manga.id);
              const isMatching = matchingIds.has(manga.id);
              const isSubmitting = submittingIds.has(manga.id);
              const candidates = matchResults.get(manga.id) ?? [];
              const picked = selectedMatch.get(manga.id);

              return (
                <div
                  key={manga.id}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs gap-3",
                    isLinked
                      ? "bg-card/40 border-border/40 opacity-90"
                      : isSelected
                      ? "bg-primary/8 border-primary/40 ring-1 ring-primary/20"
                      : "bg-card border-border/60 hover:border-border"
                  )}
                >
                  {/* Left: Checkbox + Thumbnail + Local Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {!isLinked && picked && (
                      <button
                        type="button"
                        onClick={() => handleToggleSelect(manga.id)}
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    )}

                    <div className="h-12 w-8 shrink-0 rounded bg-muted/80 overflow-hidden border border-border/40 flex items-center justify-center">
                      {manga.coverImageURL ? (
                        <img
                          src={manga.coverImageURL}
                          alt={manga.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <BookOpen className="h-3 w-3 text-muted-foreground/40" />
                      )}
                    </div>

                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate max-w-xs" title={manga.title}>
                          {manga.title}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/70 shrink-0">
                          ({manga.chapterCount} {t("reader.chapters")})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/60 truncate" title={manga.relativePath}>
                        {manga.relativePath}
                      </span>
                    </div>
                  </div>

                  {/* Middle: Linked status or Match Candidate Picker */}
                  <div className="flex items-center gap-2 min-w-0 max-w-sm">
                    {isLinked ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span className="font-medium truncate max-w-[220px]" title={link?.onlineTitle}>
                          {link?.onlineTitle}
                        </span>
                        <span className="text-[9px] font-mono uppercase opacity-75">
                          {link?.onlineSource}
                        </span>
                      </div>
                    ) : isMatching ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>{t("batchLink.matching")}</span>
                      </div>
                    ) : candidates.length > 0 && picked ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <select
                          value={picked.id}
                          onChange={(e) => {
                            const found = candidates.find((c) => c.id === e.target.value);
                            if (found) {
                              setSelectedMatch((prev) => new Map(prev).set(manga.id, found));
                            }
                          }}
                          className="h-7 px-2 rounded-md border border-border/60 bg-muted/40 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 truncate max-w-[200px] cursor-pointer"
                        >
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id} className="bg-popover text-popover-foreground">
                              {c.title}
                            </option>
                          ))}
                        </select>
                        <Badge tone="default" className="text-[9px] font-mono shrink-0">
                          {picked.status === "completed" ? t("downloader.statusFinished") : t("downloader.statusOngoing")}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/60 italic">
                        {t("batchLink.unlinked")}
                      </span>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isLinked ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => void handleUnlink(manga.id)}
                        disabled={isSubmitting}
                        className="h-7 text-xs text-muted-foreground hover:text-destructive cursor-pointer gap-1"
                      >
                        <Unlink className="h-3 w-3" />
                        <span>{t("batchLink.unlink")}</span>
                      </Button>
                    ) : picked ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="primary"
                        onClick={() => void handleLinkSingle(manga)}
                        disabled={isSubmitting}
                        className="h-7 text-xs gap-1"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Link2 className="h-3 w-3" />
                        )}
                        <span>{t("batchLink.link")}</span>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => void handleMatchSingle(manga)}
                        disabled={isMatching}
                        className="h-7 text-xs gap-1"
                      >
                        <Search className="h-3 w-3" />
                        <span>{t("batchLink.match")}</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium">
              {t("batchLink.selectedCount", { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{t("settings.autoFollowPolicy")}:</span>
              <SegmentedControl
                value={batchPolicy}
                onChange={(val) => setBatchPolicy(val as "latest_only" | "fill_gaps")}
                options={[
                  { value: "latest_only", label: t("settings.policyLatestOnly") },
                  { value: "fill_gaps", label: t("settings.policyFillGaps") },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onClose}
              className="h-8 text-xs cursor-pointer"
            >
              <span>{t("reader.close")}</span>
            </Button>
            <Button
              type="button"
              size="xs"
              variant="primary"
              onClick={() => void handleBatchLinkSelected()}
              disabled={selectedIds.size === 0 || batchMatching}
              className="h-8 px-4 text-xs gap-1.5 cursor-pointer font-semibold shadow-xs"
            >
              {batchMatching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              <span>{t("batchLink.batchLinkSelected", { count: selectedIds.size })}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
