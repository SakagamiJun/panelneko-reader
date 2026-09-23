import { useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { BookImage, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MangaCard } from "@/components/library/manga-card";
import type { LibraryManga } from "@/lib/contracts";

export interface LibraryGridProps {
  items: LibraryManga[];
  totalItemsCount: number;
  searchQuery: string;
  onClearSearch: () => void;
  loading: boolean;
  emptyLabel: string;
  onOpenManga: (mangaID: string) => void;
  onOpenCollection: (collectionPath: string) => void;
  onOpenSettings: () => void;
  onTogglePin: (mangaID: string) => void;
  onToggleCollection?: (item: LibraryManga) => void;
  onOpenDirectory: (mangaID: string) => void;
}

export function LibraryGrid({
  items,
  totalItemsCount,
  searchQuery,
  onClearSearch,
  loading,
  emptyLabel,
  onOpenManga,
  onOpenCollection,
  onOpenSettings,
  onTogglePin,
  onToggleCollection,
  onOpenDirectory,
}: LibraryGridProps) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    if (!scrollEl) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width >= 3840) setColumns(12);
      else if (width >= 2560) setColumns(8);
      else if (width >= 1920) setColumns(6);
      else if (width >= 1280) setColumns(4);
      else if (width >= 768) setColumns(3);
      else setColumns(2);
    });
    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [scrollEl]);

  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => 320,
    overscan: 2,
  });

  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center animate-in fade-in-50 duration-200">
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-border/80 shadow-xs">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
        <h3 className="mb-1 text-sm font-semibold tracking-tight text-foreground">
          {t("library.loadingTitle")}
        </h3>
        <p className="max-w-xs text-xs text-muted-foreground leading-relaxed">
          {t("library.loadingDescription")}
        </p>
      </div>
    );
  }

  // Search yielded no results
  if (items.length === 0 && searchQuery) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground animate-in fade-in-50 duration-200">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-border/80 shadow-xs mb-3 text-muted-foreground">
          <Search className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-1">
          {t("library.noMatches")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {t("library.noMatchesForQuery", { query: searchQuery })}
        </p>
        <Button onClick={onClearSearch} size="xs" variant="outline">
          {t("library.clearSearch")}
        </Button>
      </div>
    );
  }

  // Completely empty library
  if (items.length === 0 && totalItemsCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground animate-in fade-in-50 duration-200">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card border border-border/80 shadow-xs mb-3 text-muted-foreground">
          <BookImage className="h-5 w-5" />
        </div>
        <p className="max-w-md text-xs sm:text-sm font-medium mb-4 leading-relaxed text-foreground/80">
          {emptyLabel}
        </p>
        <Button onClick={onOpenSettings} size="sm" variant="outline">
          {t("library.configureLibrary")}
        </Button>
      </div>
    );
  }

  return (
    <div ref={setScrollEl} className="h-full overflow-y-auto p-3 sm:p-4 relative">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: "12px",
                paddingBottom: "12px",
              }}
            >
              {rowItems.map((item) => (
                <MangaCard
                  key={item.id}
                  item={item}
                  onOpenManga={onOpenManga}
                  onOpenCollection={onOpenCollection}
                  onTogglePin={onTogglePin}
                  onToggleCollection={onToggleCollection}
                  onOpenDirectory={onOpenDirectory}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
