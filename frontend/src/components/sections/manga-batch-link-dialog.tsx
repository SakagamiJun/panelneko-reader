import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder,
  Globe,
  Layers,
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
import type {
  LibraryManga,
  LibrarySource,
  MangaLinkPreviewInput,
  MangaLinkPreviewItem,
  MangaOnlineLink,
  OnlineMangaItem,
} from "@/lib/contracts";
import { cn } from "@/lib/utils";

export interface MangaBatchLinkDialogProps {
  open: boolean;
  onClose: () => void;
  mangas: LibraryManga[];
  sources?: LibrarySource[];
  onLinksChanged?: () => void;
}

export function MangaBatchLinkDialog({
  open,
  onClose,
  mangas,
  sources,
  onLinksChanged,
}: MangaBatchLinkDialogProps) {
  const { t } = useTranslation();

  const [currentStep, setCurrentStep] = useState<"select" | "review">("select");
  const [activeSource, setActiveSource] = useState<"copymanga" | "klz9">("copymanga");
  const [filterQuery, setFilterQuery] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "unlinked" | "linked">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [linksMap, setLinksMap] = useState<Map<string, MangaOnlineLink>>(new Map());
  const [loadingLinks, setLoadingLinks] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [matchResults, setMatchResults] = useState<Map<string, OnlineMangaItem[]>>(new Map());
  const [selectedMatch, setSelectedMatch] = useState<Map<string, OnlineMangaItem>>(new Map());
  const [matchingIds, setMatchingIds] = useState<Set<string>>(new Set());
  const [batchMatching, setBatchMatching] = useState(false);
  const [submittingIds, setSubmittingIds] = useState<Set<string>>(new Set());

  const [batchPolicy, setBatchPolicy] = useState<"latest_only" | "fill_gaps">("latest_only");
  const [mangaGroups, setMangaGroups] = useState<Map<string, string>>(new Map());
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [openGroupMenuMangaId, setOpenGroupMenuMangaId] = useState<string | null>(null);
  const [groupsCache, setGroupsCache] = useState<Map<string, string[]>>(new Map());
  const [loadingGroupsId, setLoadingGroupsId] = useState<string | null>(null);

  // Step 2 review state
  const [previewItems, setPreviewItems] = useState<MangaLinkPreviewItem[]>([]);
  const [checkingStatusMap, setCheckingStatusMap] = useState<Map<string, "pending" | "checking" | "done" | "error">>(new Map());
  const [isCheckingQueue, setIsCheckingQueue] = useState(false);
  const [reviewSelectedIds, setReviewSelectedIds] = useState<Set<string>>(new Set());
  const [baselineChoices, setBaselineChoices] = useState<Map<string, "local" | "online" | "fill_gaps">>(new Map());

  const sourceMenuRef = useRef<HTMLDivElement>(null);

  const fetchGroupsForComic = useCallback(
    async (comicId: string) => {
      if (!comicId || groupsCache.has(comicId)) return;
      setLoadingGroupsId(comicId);
      try {
        const realGroups = await appAdapter.getOnlineMangaGroups(activeSource, comicId);
        setGroupsCache((prev) => new Map(prev).set(comicId, realGroups));
      } catch (err) {
        console.error("Failed to fetch online groups for comic:", comicId, err);
      } finally {
        setLoadingGroupsId(null);
      }
    },
    [activeSource, groupsCache]
  );

  const getOptionsForComic = useCallback(
    (onlineComicId?: string, currentGroup?: string) => {
      const real = (onlineComicId ? groupsCache.get(onlineComicId) : null) ?? [];
      const opts: { value: string; label: string }[] = [
        { value: "", label: t("batchLink.groupAuto") },
      ];
      for (const g of real) {
        opts.push({ value: g, label: g });
      }
      if (currentGroup && !opts.some((o) => o.value === currentGroup)) {
        opts.push({ value: currentGroup, label: currentGroup });
      }
      return opts;
    },
    [groupsCache, t]
  );

  const handleOpenGroupMenu = (mangaId: string, onlineComicId?: string) => {
    if (openGroupMenuMangaId === mangaId) {
      setOpenGroupMenuMangaId(null);
    } else {
      setOpenGroupMenuMangaId(mangaId);
      if (onlineComicId) {
        void fetchGroupsForComic(onlineComicId);
      }
    }
  };

  const getGroupLabel = useCallback(
    (group?: string) => {
      if (!group) return t("batchLink.groupAuto");
      return group;
    },
    [t]
  );

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
      setMangaGroups(new Map());
      setFilterQuery("");
      setLinkFilter("all");
      setSourceFilter("all");
      setIsSourceMenuOpen(false);
      setOpenGroupMenuMangaId(null);
      setCurrentStep("select");
      setPreviewItems([]);
      setCheckingStatusMap(new Map());
      setIsCheckingQueue(false);
      setReviewSelectedIds(new Set());
      setBaselineChoices(new Map());
    }
  }, [open, loadLinks]);

  // Click outside to close source filter menu
  useEffect(() => {
    if (!isSourceMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(e.target as Node)) {
        setIsSourceMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isSourceMenuOpen]);

  // Click outside to close per-manga group selection menu
  useEffect(() => {
    if (!openGroupMenuMangaId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-group-menu]")) {
        setOpenGroupMenuMangaId(null);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [openGroupMenuMangaId]);

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
    return nonCollectionMangas.filter((m) => {
      const isLinked = linksMap.has(m.id);
      if (linkFilter === "linked" && !isLinked) return false;
      if (linkFilter === "unlinked" && isLinked) return false;

      if (sourceFilter !== "all" && (m.sourceID || "default") !== sourceFilter) {
        return false;
      }

      if (q && !m.title.toLowerCase().includes(q) && !m.relativePath.toLowerCase().includes(q)) {
        return false;
      }

      return true;
    });
  }, [nonCollectionMangas, linksMap, linkFilter, sourceFilter, filterQuery]);

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

  // Update target group on an already linked manga
  const handleUpdateGroup = async (mangaId: string, newGroup: string) => {
    const existing = linksMap.get(mangaId);
    if (!existing) return;
    setOpenGroupMenuMangaId(null);
    setSubmittingIds((prev) => new Set(prev).add(mangaId));
    try {
      await appAdapter.linkMangaOnline({
        ...existing,
        targetGroup: newGroup,
      });
      await loadLinks();
      onLinksChanged?.();
    } catch (err) {
      console.error("Update group error:", err);
    } finally {
      setSubmittingIds((prev) => {
        const next = new Set(prev);
        next.delete(mangaId);
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

  // Helper to construct a single preview input
  const getPreviewInput = useCallback(
    (mangaId: string): MangaLinkPreviewInput | null => {
      const match = selectedMatch.get(mangaId);
      if (!match) return null;
      return {
        mangaId,
        onlineSource: activeSource,
        onlineComicId: match.id,
        targetGroup: mangaGroups.get(mangaId) || "",
        followPolicy: batchPolicy,
      };
    },
    [selectedMatch, activeSource, mangaGroups, batchPolicy]
  );

  // Proceed from selection to review & baseline alignment step with progressive checking
  const handleProceedToReview = async (targetMangaIds?: string[]) => {
    const idsToPreview = targetMangaIds ?? Array.from(selectedIds);
    const itemsToPreview = idsToPreview
      .map((id) => {
        const manga = nonCollectionMangas.find((m) => m.id === id);
        const match = selectedMatch.get(id);
        return { manga, match };
      })
      .filter((item): item is { manga: LibraryManga; match: OnlineMangaItem } => Boolean(item.manga && item.match));

    if (itemsToPreview.length === 0) return;

    setCurrentStep("review");

    // Initialize items with placeholder info
    const initialItems: MangaLinkPreviewItem[] = itemsToPreview.map((item) => ({
      mangaId: item.manga.id,
      mangaTitle: item.manga.title,
      localLatestTitle: "",
      localLatestNumber: -1,
      onlineLatestTitle: "",
      onlineLatestNumber: -1,
      diffType: "in_sync",
      diffCount: 0,
      pendingChapters: [],
      recommendedPolicy: "latest_only",
    }));

    setPreviewItems(initialItems);
    const initialStatus = new Map<string, "pending" | "checking" | "done" | "error">();
    for (const item of itemsToPreview) {
      initialStatus.set(item.manga.id, "pending");
    }
    setCheckingStatusMap(initialStatus);
    setReviewSelectedIds(new Set());

    // Run progressive queue with concurrency of 2 and delay
    setIsCheckingQueue(true);
    const poolLimit = 2;
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < itemsToPreview.length) {
        const idx = currentIndex++;
        const item = itemsToPreview[idx];
        const input = getPreviewInput(item.manga.id);
        if (!input) continue;

        setCheckingStatusMap((prev) => new Map(prev).set(item.manga.id, "checking"));

        try {
          const res = await appAdapter.previewMangaLink(input);
          setPreviewItems((prev) =>
            prev.map((p) => (p.mangaId === item.manga.id ? res : p))
          );

          if (res.errorMessage) {
            setCheckingStatusMap((prev) => new Map(prev).set(item.manga.id, "error"));
          } else {
            setCheckingStatusMap((prev) => new Map(prev).set(item.manga.id, "done"));
            setReviewSelectedIds((prev) => new Set(prev).add(item.manga.id));
            setBaselineChoices((prev) => {
              const next = new Map(prev);
              if (!next.has(item.manga.id)) {
                next.set(item.manga.id, res.recommendedPolicy === "fill_gaps" ? "fill_gaps" : "local");
              }
              return next;
            });
          }
        } catch (err: any) {
          setCheckingStatusMap((prev) => new Map(prev).set(item.manga.id, "error"));
          setPreviewItems((prev) =>
            prev.map((p) =>
              p.mangaId === item.manga.id
                ? { ...p, errorMessage: err?.message || "Check failed" }
                : p
            )
          );
        }

        await new Promise((r) => setTimeout(r, 120));
      }
    };

    void Promise.all(
      Array.from({ length: Math.min(poolLimit, itemsToPreview.length) }, () => worker())
    ).finally(() => {
      setIsCheckingQueue(false);
    });
  };

  // Retry checking a single manga in review step
  const handleRetrySingle = async (mangaId: string) => {
    const input = getPreviewInput(mangaId);
    if (!input) return;

    setCheckingStatusMap((prev) => new Map(prev).set(mangaId, "checking"));
    try {
      const res = await appAdapter.previewMangaLink(input);
      setPreviewItems((prev) => prev.map((p) => (p.mangaId === mangaId ? res : p)));
      if (res.errorMessage) {
        setCheckingStatusMap((prev) => new Map(prev).set(mangaId, "error"));
      } else {
        setCheckingStatusMap((prev) => new Map(prev).set(mangaId, "done"));
        setReviewSelectedIds((prev) => new Set(prev).add(mangaId));
        setBaselineChoices((prev) => {
          const next = new Map(prev);
          if (!next.has(mangaId)) {
            next.set(mangaId, res.recommendedPolicy === "fill_gaps" ? "fill_gaps" : "local");
          }
          return next;
        });
      }
    } catch (err: any) {
      setCheckingStatusMap((prev) => new Map(prev).set(mangaId, "error"));
      setPreviewItems((prev) =>
        prev.map((p) =>
          p.mangaId === mangaId
            ? { ...p, errorMessage: err?.message || "Check failed" }
            : p
        )
      );
    }
  };

  // Link a single manga -> launches preview & baseline check for that manga
  const handleLinkSingle = (manga: LibraryManga) => {
    void handleProceedToReview([manga.id]);
  };

  // Confirm final links with user-verified baseline
  const handleConfirmFinalLinks = async () => {
    const toConfirm = previewItems.filter(
      (item) => reviewSelectedIds.has(item.mangaId) && !item.errorMessage
    );
    if (toConfirm.length === 0) return;

    setBatchMatching(true);
    try {
      for (const item of toConfirm) {
        const match = selectedMatch.get(item.mangaId);
        if (!match) continue;

        const baseline = baselineChoices.get(item.mangaId) || "local";
        let baselineNum: number | undefined;
        let baselineTitle: string | undefined;
        let policy: "latest_only" | "fill_gaps" = "latest_only";

        if (baseline === "local") {
          baselineNum = item.localLatestNumber >= 0 ? item.localLatestNumber : undefined;
          baselineTitle = item.localLatestTitle || undefined;
          policy = "latest_only";
        } else if (baseline === "online") {
          baselineNum = item.onlineLatestNumber >= 0 ? item.onlineLatestNumber : undefined;
          baselineTitle = item.onlineLatestTitle || undefined;
          policy = "latest_only";
        } else if (baseline === "fill_gaps") {
          baselineNum = undefined;
          baselineTitle = undefined;
          policy = "fill_gaps";
        }

        await appAdapter.linkMangaOnline({
          mangaId: item.mangaId,
          onlineSource: activeSource,
          onlineComicId: match.id,
          onlineTitle: match.title,
          autoFollow: true,
          followPolicy: policy,
          targetGroup: mangaGroups.get(item.mangaId) || "",
          baselineChapterNumber: baselineNum,
          baselineChapterTitle: baselineTitle,
        });
      }

      await loadLinks();
      onLinksChanged?.();
      setSelectedIds(new Set());
      setPreviewItems([]);
      setCurrentStep("select");
    } catch (err) {
      console.error("Link confirmation error:", err);
    } finally {
      setBatchMatching(false);
    }
  };

  // Batch link selected button handler in Step 1
  const handleBatchLinkSelected = async () => {
    await handleProceedToReview();
  };

  const previewSummary = useMemo(() => {
    let inSync = 0;
    let onlineAhead = 0;
    let localAhead = 0;
    let doneCount = 0;
    for (const item of previewItems) {
      const status = checkingStatusMap.get(item.mangaId);
      if (status === "done") {
        doneCount++;
        const choice = baselineChoices.get(item.mangaId) || "local";
        if (choice === "online") {
          inSync++;
        } else if (choice === "fill_gaps") {
          const total = (item.latestOnlyCount ?? 0) + (item.gapCount ?? item.diffCount);
          if (total > 0) onlineAhead++;
          else inSync++;
        } else {
          // "local"
          const newCount = item.latestOnlyCount ?? (item.gapCount ? 0 : item.diffCount);
          if (newCount > 0) onlineAhead++;
          else if (item.localLatestNumber > item.onlineLatestNumber && item.onlineLatestNumber >= 0) localAhead++;
          else inSync++;
        }
      } else if (status === "error") {
        doneCount++;
      }
    }
    return { inSync, onlineAhead, localAhead, doneCount, total: previewItems.length };
  }, [previewItems, checkingStatusMap, baselineChoices]);

  const uniformBaseline = useMemo(() => {
    if (previewItems.length === 0) return "";
    const first = baselineChoices.get(previewItems[0].mangaId);
    const allSame = previewItems.every((item) => baselineChoices.get(item.mangaId) === first);
    return allSame ? first || "" : "";
  }, [previewItems, baselineChoices]);

  const handleSetAllBaseline = (choice: "local" | "online" | "fill_gaps") => {
    setBaselineChoices((prev) => {
      const next = new Map(prev);
      for (const item of previewItems) {
        next.set(item.mangaId, choice);
      }
      return next;
    });
  };

  const handleToggleSelectAllReview = () => {
    const validItems = previewItems.filter((p) => !p.errorMessage);
    if (reviewSelectedIds.size === validItems.length) {
      setReviewSelectedIds(new Set());
    } else {
      setReviewSelectedIds(new Set(validItems.map((p) => p.mangaId)));
    }
  };

  const handleToggleReviewSelect = (mangaId: string) => {
    setReviewSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mangaId)) {
        next.delete(mangaId);
      } else {
        next.add(mangaId);
      }
      return next;
    });
  };

  // Batch unlink selected manga
  const handleBatchUnlinkSelected = async () => {
    const toUnlink = Array.from(selectedIds).filter((id) => linksMap.has(id));
    if (toUnlink.length === 0) return;

    setBatchMatching(true);
    for (const id of toUnlink) {
      try {
        await appAdapter.unlinkMangaOnline(id);
      } catch (err) {
        console.error("Batch unlink error for:", id, err);
      }
    }
    await loadLinks();
    onLinksChanged?.();
    setBatchMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of toUnlink) {
        next.delete(id);
      }
      return next;
    });
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
    setSelectedIds(new Set(displayedMangas.map((m) => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const selectedLinkedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (linksMap.has(id)) count++;
    }
    return count;
  }, [selectedIds, linksMap]);

  const selectedLinkableCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (!linksMap.has(id) && selectedMatch.has(id)) count++;
    }
    return count;
  }, [selectedIds, linksMap, selectedMatch]);

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

          {/* Stepper Breadcrumb */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/40 border border-border/50 text-[11px]">
            <button
              type="button"
              onClick={() => setCurrentStep("select")}
              disabled={currentStep === "select"}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors",
                currentStep === "select"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground cursor-pointer"
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                1
              </span>
              <span>{t("batchLink.stepSelect")}</span>
            </button>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <button
              type="button"
              disabled={previewItems.length === 0}
              onClick={() => setCurrentStep("review")}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded-md transition-colors",
                currentStep === "review"
                  ? "bg-card text-foreground font-semibold shadow-2xs"
                  : "text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                2
              </span>
              <span>{t("batchLink.stepReview")}</span>
            </button>
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

        {currentStep === "select" ? (
          <>
            {/* Toolbar */}
            <div className="px-5 py-3 border-b border-border/40 bg-muted/10 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder={t("batchLink.filterPlaceholder")}
                      className="pl-8 h-8 text-xs bg-background/80"
                    />
                  </div>

                  {/* Status Filter: All / Unlinked / Linked */}
                  <SegmentedControl
                    value={linkFilter}
                    onChange={(val) => setLinkFilter(val as "all" | "unlinked" | "linked")}
                    options={[
                      { value: "all", label: t("batchLink.filterAll") },
                      { value: "unlinked", label: t("batchLink.filterUnlinked") },
                      { value: "linked", label: t("batchLink.filterLinked") },
                    ]}
                  />

                  {/* Source Filter (if sources provided) */}
                  {(sources?.length ?? 0) > 1 && (
                    <div className="relative shrink-0" ref={sourceMenuRef}>
                      <button
                        type="button"
                        data-testid="source-filter-button"
                        aria-haspopup="menu"
                        aria-expanded={isSourceMenuOpen}
                        onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
                        className="h-8 px-2.5 rounded-lg border border-border/70 bg-card text-xs font-medium text-foreground hover:bg-muted/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title={t("batchLink.filterSourceDirectory")}
                      >
                        <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[130px]">
                          {sourceFilter === "all"
                            ? t("batchLink.allSources")
                            : sources?.find((s) => s.id === sourceFilter)?.name || t("batchLink.allSources")}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 text-muted-foreground/70 transition-transform duration-150 shrink-0",
                            isSourceMenuOpen && "rotate-180"
                          )}
                        />
                      </button>

                      {isSourceMenuOpen && (
                        <div
                          className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-left"
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setSourceFilter("all");
                              setIsSourceMenuOpen(false);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left",
                              sourceFilter === "all"
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground hover:bg-muted/60"
                            )}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{t("batchLink.allSources")}</span>
                            </div>
                            {sourceFilter === "all" && <Check className="h-3.5 w-3.5 shrink-0 text-primary ml-2" />}
                          </button>

                          <div className="h-px bg-border/40 my-1 mx-1" />

                          {sources?.map((s) => {
                            const isSelected = sourceFilter === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setSourceFilter(s.id);
                                  setIsSourceMenuOpen(false);
                                }}
                                className={cn(
                                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left",
                                  isSelected
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-foreground hover:bg-muted/60"
                                )}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate">{s.name || s.path}</span>
                                </div>
                                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary ml-2" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Target Online Source */}
                  <SegmentedControl
                    value={activeSource}
                    onChange={(val) => setActiveSource(val as "copymanga" | "klz9")}
                    options={[
                      { value: "copymanga", label: "CopyManga" },
                      { value: "klz9", label: "RawManga" },
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-0.5">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleSelectAll}
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <CheckSquare className="h-3 w-3 mr-1" />
                    <span>{t("downloader.selectAll")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handleDeselectAll}
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Square className="h-3 w-3 mr-1" />
                    <span>{t("downloader.deselectAll")}</span>
                  </Button>
                  <span className="text-[11px] font-mono text-muted-foreground/80 ml-1">
                    {t("batchLink.selectedCount", { count: selectedIds.size })}
                  </span>
                </div>

                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => void handleBatchMatch()}
                  disabled={batchMatching}
                  className="h-7 text-xs gap-1.5 font-medium cursor-pointer"
                >
                  {batchMatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span>{t("batchLink.batchMatchAll")}</span>
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
                      <div className="flex items-center gap-2 min-w-0 max-w-md">
                        {isLinked ? (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                              <span className="font-medium truncate max-w-[180px]" title={link?.onlineTitle}>
                                {link?.onlineTitle}
                              </span>
                              <span className="text-[9px] font-mono uppercase opacity-75">
                                {link?.onlineSource}
                              </span>
                            </div>
                            {/* Target Group Selector Dropdown for Linked Manga */}
                            <div className="relative shrink-0" data-group-menu>
                              <button
                                type="button"
                                onClick={() => handleOpenGroupMenu(manga.id, link?.onlineComicId)}
                                className="h-6 px-2 rounded-md border border-border/70 bg-muted/40 hover:bg-muted/70 text-[11px] font-medium text-foreground flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                                title={t("batchLink.targetGroup")}
                              >
                                <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[65px]">
                                  {getGroupLabel(link?.targetGroup)}
                                </span>
                                <ChevronDown
                                  className={cn(
                                    "h-2.5 w-2.5 text-muted-foreground/70 transition-transform duration-150 shrink-0",
                                    openGroupMenuMangaId === manga.id && "rotate-180"
                                  )}
                                />
                              </button>

                              {openGroupMenuMangaId === manga.id && (
                                <div
                                  className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-right text-foreground"
                                  role="menu"
                                >
                                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {t("batchLink.targetGroup")}
                                  </div>
                                  {loadingGroupsId === link?.onlineComicId && !groupsCache.has(link?.onlineComicId || "") ? (
                                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                      <span>{t("batchLink.loadingGroups")}</span>
                                    </div>
                                  ) : (
                                    getOptionsForComic(link?.onlineComicId, link?.targetGroup).map((opt) => {
                                      const isCurrent = (link?.targetGroup || "") === opt.value;
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          role="menuitem"
                                          onClick={() => void handleUpdateGroup(manga.id, opt.value)}
                                          className={cn(
                                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left",
                                            isCurrent
                                              ? "bg-primary/10 text-primary font-medium"
                                              : "text-foreground hover:bg-muted/60"
                                          )}
                                        >
                                          <span>{opt.label}</span>
                                          {isCurrent && <Check className="h-3 w-3 shrink-0 text-primary ml-2" />}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
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
                              className="h-7 px-2 rounded-md border border-border/70 bg-card text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 truncate max-w-[170px] cursor-pointer"
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
                            {/* Target Group Selector for Candidate */}
                            <div className="relative shrink-0" data-group-menu>
                              <button
                                type="button"
                                onClick={() => handleOpenGroupMenu(manga.id, picked.id)}
                                className="h-6 px-2 rounded-md border border-border/70 bg-muted/40 hover:bg-muted/70 text-[11px] font-medium text-foreground flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                                title={t("batchLink.targetGroup")}
                              >
                                <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[65px]">
                                  {getGroupLabel(mangaGroups.get(manga.id))}
                                </span>
                                <ChevronDown
                                  className={cn(
                                    "h-2.5 w-2.5 text-muted-foreground/70 transition-transform duration-150 shrink-0",
                                    openGroupMenuMangaId === manga.id && "rotate-180"
                                  )}
                                />
                              </button>

                              {openGroupMenuMangaId === manga.id && (
                                <div
                                  className="absolute right-0 top-full mt-1 w-36 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md shadow-xl p-1 z-50 animate-in fade-in-0 zoom-in-95 origin-top-right text-foreground"
                                  role="menu"
                                >
                                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    {t("batchLink.targetGroup")}
                                  </div>
                                  {loadingGroupsId === picked.id && !groupsCache.has(picked.id) ? (
                                    <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                      <span>{t("batchLink.loadingGroups")}</span>
                                    </div>
                                  ) : (
                                    getOptionsForComic(picked.id, mangaGroups.get(manga.id)).map((opt) => {
                                      const current = mangaGroups.get(manga.id) || "";
                                      const isCurrent = current === opt.value;
                                      return (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setMangaGroups((prev) => new Map(prev).set(manga.id, opt.value));
                                            setOpenGroupMenuMangaId(null);
                                          }}
                                          className={cn(
                                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left",
                                            isCurrent
                                              ? "bg-primary/10 text-primary font-medium"
                                              : "text-foreground hover:bg-muted/60"
                                          )}
                                        >
                                          <span>{opt.label}</span>
                                          {isCurrent && <Check className="h-3 w-3 shrink-0 text-primary ml-2" />}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
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
                            className="h-7 text-xs text-muted-foreground hover:text-danger cursor-pointer gap-1"
                          >
                            <Unlink className="h-3 w-3" />
                            <span>{t("batchLink.unlink")}</span>
                          </Button>
                        ) : picked ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="primary"
                            onClick={() => handleLinkSingle(manga)}
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

            {/* Step 1 Bottom Action Footer */}
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
                  <span>{t("settings.close")}</span>
                </Button>
                {selectedLinkedCount > 0 && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void handleBatchUnlinkSelected()}
                    disabled={batchMatching}
                    className="h-8 px-3 text-xs gap-1.5 cursor-pointer text-danger border-danger/40 hover:bg-danger/10 font-medium"
                  >
                    {batchMatching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    <span>{t("batchLink.batchUnlinkSelected", { count: selectedLinkedCount })}</span>
                  </Button>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  onClick={() => void handleBatchLinkSelected()}
                  disabled={selectedLinkableCount === 0 || batchMatching}
                  className="h-8 px-4 text-xs gap-1.5 cursor-pointer font-semibold shadow-xs"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>{t("batchLink.nextToReview", { count: selectedLinkableCount || selectedIds.size })}</span>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Step 2 Review Toolbar */}
            <div className="px-5 py-3 border-b border-border/40 bg-muted/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {t("batchLink.stepReview")} ({previewItems.length})
                </span>
                <div className="h-3.5 w-px bg-border/60 mx-1" />
                <Badge tone="default" className="font-mono text-[11px] gap-1 py-0.5">
                  <span>{t("batchLink.previewProgress", { done: previewSummary.doneCount, total: previewItems.length })}</span>
                  {isCheckingQueue && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                </Badge>
                {previewSummary.inSync > 0 && (
                  <Badge tone="success" className="font-mono text-[11px] gap-1 py-0.5">
                    <Check className="h-3 w-3" />
                    <span>{t("batchLink.summaryInSync")}: {previewSummary.inSync}</span>
                  </Badge>
                )}
                {previewSummary.onlineAhead > 0 && (
                  <Badge tone="primary" className="font-mono text-[11px] gap-1 py-0.5">
                    <ArrowDownCircle className="h-3 w-3" />
                    <span>{t("batchLink.summaryNeedUpdate")}: {previewSummary.onlineAhead}</span>
                  </Badge>
                )}
                {previewSummary.localAhead > 0 && (
                  <Badge tone="warning" className="font-mono text-[11px] gap-1 py-0.5">
                    <ArrowUpCircle className="h-3 w-3" />
                    <span>{t("batchLink.summaryLocalAhead")}: {previewSummary.localAhead}</span>
                  </Badge>
                )}
              </div>

              {/* Bulk Baseline Setter */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[11px] text-muted-foreground font-medium">
                  {t("batchLink.setAllBaseline")}
                </span>
                <SegmentedControl
                  size="sm"
                  value={uniformBaseline}
                  onChange={(val) => handleSetAllBaseline(val as "local" | "online" | "fill_gaps")}
                  options={[
                    { value: "local", label: t("batchLink.baselineLocal") },
                    { value: "online", label: t("batchLink.baselineOnline") },
                    { value: "fill_gaps", label: t("batchLink.baselineFillGaps") },
                  ]}
                />
              </div>
            </div>

            {/* Step 2 Review Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {previewItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/60 text-xs">
                  <span>{t("batchLink.empty")}</span>
                </div>
              ) : (
                <div className="border border-border/70 rounded-xl overflow-hidden bg-card shadow-2xs divide-y divide-border/40">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-muted/30 text-[11px] font-semibold text-muted-foreground select-none items-center">
                    <div className="col-span-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleSelectAllReview}
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                      >
                        {reviewSelectedIds.size === previewItems.filter((p) => !p.errorMessage).length &&
                        previewItems.length > 0 ? (
                          <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <span>{t("library.manga")}</span>
                    </div>
                    <div className="col-span-2 text-left">{t("batchLink.localLatestCol")}</div>
                    <div className="col-span-2 text-left">{t("batchLink.onlineLatestCol")}</div>
                    <div className="col-span-2 text-left">{t("batchLink.statusCol")}</div>
                    <div className="col-span-2 text-right">{t("batchLink.baselineCol")}</div>
                  </div>

                  {/* Table Rows */}
                  {previewItems.map((item) => {
                    const manga = nonCollectionMangas.find((m) => m.id === item.mangaId);
                    const isSelected = reviewSelectedIds.has(item.mangaId);
                    const choice = baselineChoices.get(item.mangaId) || "local";
                    const status = checkingStatusMap.get(item.mangaId) ?? "pending";

                    const rowDiff = (() => {
                      if (choice === "online") {
                        return { type: "in_sync" as const, count: 0, pending: [] };
                      }
                      if (choice === "fill_gaps") {
                        const totalMissing = (item.latestOnlyCount ?? 0) + (item.gapCount ?? item.diffCount);
                        if (totalMissing > 0) {
                          return { type: "online_ahead" as const, count: totalMissing, pending: item.pendingChapters };
                        }
                        return { type: item.diffType, count: item.diffCount, pending: item.pendingChapters };
                      }
                      // choice === "local" (latest_only)
                      const newCount = item.latestOnlyCount ?? (item.gapCount ? 0 : item.diffCount);
                      if (newCount > 0) {
                        return { type: "online_ahead" as const, count: newCount, pending: item.pendingChapters };
                      }
                      if (item.localLatestNumber > item.onlineLatestNumber && item.onlineLatestNumber >= 0) {
                        const ahead = Math.max(1, Math.round(item.localLatestNumber - item.onlineLatestNumber));
                        return { type: "local_ahead" as const, count: ahead, pending: [] };
                      }
                      return { type: "in_sync" as const, count: 0, pending: [] };
                    })();

                    return (
                      <div
                        key={item.mangaId}
                        className={cn(
                          "grid grid-cols-12 gap-3 px-3 py-2.5 items-center text-xs transition-colors",
                          item.errorMessage || status === "error"
                            ? "bg-danger/5 opacity-80"
                            : isSelected
                            ? "bg-card hover:bg-muted/30"
                            : "opacity-60 bg-muted/10 hover:bg-muted/20"
                        )}
                      >
                        {/* Col 1: Selection + Cover + Title */}
                        <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            disabled={Boolean(item.errorMessage) || status !== "done"}
                            onClick={() => handleToggleReviewSelect(item.mangaId)}
                            className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                          </button>

                          <div className="h-10 w-7 shrink-0 rounded bg-muted/80 overflow-hidden border border-border/40 flex items-center justify-center">
                            {manga?.coverImageURL ? (
                              <img
                                src={manga.coverImageURL}
                                alt={item.mangaTitle}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <BookOpen className="h-3 w-3 text-muted-foreground/40" />
                            )}
                          </div>

                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <span className="font-semibold text-foreground truncate" title={item.mangaTitle}>
                              {item.mangaTitle}
                            </span>
                            {manga?.relativePath && (
                              <span
                                className="text-[10px] font-mono text-muted-foreground/60 truncate"
                                title={manga.relativePath}
                              >
                                {manga.relativePath}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Col 2: Local Latest */}
                        <div className="col-span-2 flex flex-col min-w-0">
                          {status === "checking" ? (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            </div>
                          ) : status === "pending" ? (
                            <span className="text-muted-foreground/40 text-xs italic">-</span>
                          ) : item.localLatestTitle ? (
                            <>
                              <span
                                className="font-medium text-foreground truncate text-xs"
                                title={item.localLatestTitle}
                              >
                                {item.localLatestTitle}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground/70">
                                {item.localLatestNumber >= 0 ? `Ch. ${item.localLatestNumber}` : "-"}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50 text-xs italic">-</span>
                          )}
                        </div>

                        {/* Col 3: Online Latest */}
                        <div className="col-span-2 flex flex-col min-w-0">
                          {status === "checking" ? (
                            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            </div>
                          ) : status === "pending" ? (
                            <span className="text-muted-foreground/40 text-xs italic">-</span>
                          ) : item.onlineLatestTitle ? (
                            <>
                              <span
                                className="font-medium text-foreground truncate text-xs"
                                title={item.onlineLatestTitle}
                              >
                                {item.onlineLatestTitle}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground/70">
                                {item.onlineLatestNumber >= 0 ? `Ch. ${item.onlineLatestNumber}` : "-"}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50 text-xs italic">-</span>
                          )}
                        </div>

                        {/* Col 4: Status / Chapter Diff */}
                        <div className="col-span-2 flex items-center min-w-0">
                          {status === "checking" ? (
                            <Badge tone="running" className="gap-1 font-mono text-[10px]">
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              <span>{t("batchLink.checkingStatus")}</span>
                            </Badge>
                          ) : status === "pending" ? (
                            <span className="text-muted-foreground/40 text-[10px] font-mono">...</span>
                          ) : item.errorMessage || status === "error" ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <Badge
                                tone="danger"
                                className="text-[10px] truncate max-w-[110px]"
                                title={item.errorMessage}
                              >
                                <AlertCircle className="h-3 w-3 mr-1 shrink-0" />
                                <span className="truncate">{item.errorMessage}</span>
                              </Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => void handleRetrySingle(item.mangaId)}
                                className="h-5 px-1 text-[10px] text-primary hover:bg-primary/10 cursor-pointer gap-0.5 shrink-0"
                                title={t("batchLink.retryCheck")}
                              >
                                <RefreshCw className="h-2.5 w-2.5" />
                                <span>{t("batchLink.retryCheck")}</span>
                              </Button>
                            </div>
                          ) : rowDiff.type === "in_sync" ? (
                            <Badge
                              tone="success"
                              className="gap-1 font-mono text-[10px]"
                              title={
                                choice === "local" && item.gapCount && item.gapCount > 0
                                  ? t("batchLink.gapCountTooltip", { count: item.gapCount })
                                  : undefined
                              }
                            >
                              <Check className="h-3 w-3" />
                              <span>{t("batchLink.inSyncBadge")}</span>
                            </Badge>
                          ) : rowDiff.type === "online_ahead" ? (
                            <Badge
                              tone="primary"
                              className="gap-1 font-mono text-[10px] cursor-help"
                              title={
                                rowDiff.pending && rowDiff.pending.length > 0
                                  ? t("batchLink.pendingChaptersTooltip", {
                                      chapters:
                                        rowDiff.pending.slice(0, 5).join(", ") +
                                        (rowDiff.pending.length > 5 ? "..." : ""),
                                    })
                                  : undefined
                              }
                            >
                              <ArrowDownCircle className="h-3 w-3 shrink-0" />
                              <span>{t("batchLink.onlineAheadBadge", { count: rowDiff.count })}</span>
                            </Badge>
                          ) : (
                            <Badge tone="warning" className="gap-1 font-mono text-[10px]">
                              <ArrowUpCircle className="h-3 w-3 shrink-0" />
                              <span>{t("batchLink.localAheadBadge", { count: rowDiff.count })}</span>
                            </Badge>
                          )}
                        </div>

                        {/* Col 5: Baseline Policy Selector */}
                        <div className="col-span-2 flex justify-end">
                          <SegmentedControl
                            size="sm"
                            disabled={Boolean(item.errorMessage) || status !== "done"}
                            value={choice}
                            onChange={(val) => {
                              setBaselineChoices((prev) =>
                                new Map(prev).set(item.mangaId, val as "local" | "online" | "fill_gaps")
                              );
                            }}
                            options={[
                              { value: "local", label: t("batchLink.baselineLocal") },
                              { value: "online", label: t("batchLink.baselineOnline") },
                              { value: "fill_gaps", label: t("batchLink.baselineFillGaps") },
                            ]}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2 Bottom Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border/50 bg-muted/20">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => setCurrentStep("select")}
                disabled={batchMatching}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>{t("batchLink.backToSelect")}</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={onClose}
                  disabled={batchMatching}
                  className="h-8 text-xs cursor-pointer"
                >
                  <span>{t("settings.close")}</span>
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  onClick={() => void handleConfirmFinalLinks()}
                  disabled={reviewSelectedIds.size === 0 || batchMatching}
                  className="h-8 px-4 text-xs gap-1.5 cursor-pointer font-semibold shadow-xs"
                >
                  {batchMatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>{t("batchLink.confirmLinkAndFollow", { count: reviewSelectedIds.size })}</span>
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
