import { memo } from "react";
import { useTranslation } from "react-i18next";
import { BookImage, Folder, FolderOpen, Folders, Pin } from "lucide-react";
import type { LibraryManga } from "@/lib/contracts";
import { i18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSmartDate } from "@/lib/utils";

export interface MangaCardProps {
  item: LibraryManga;
  onOpenManga: (mangaID: string) => void;
  onOpenCollection: (collectionPath: string) => void;
  onTogglePin: (mangaID: string) => void;
  onToggleCollection?: (item: LibraryManga) => void;
  onOpenDirectory: (mangaID: string) => void;
}

export const MangaCard = memo(function MangaCard({
  item,
  onOpenManga,
  onOpenCollection,
  onTogglePin,
  onToggleCollection,
  onOpenDirectory,
}: MangaCardProps) {
  const { t } = useTranslation();

  const handleOpen = () => {
    if (item.isCollection) {
      onOpenCollection(item.relativePath);
    } else {
      onOpenManga(item.id);
    }
  };

  return (
    <article className="group relative flex flex-col rounded-xl border border-border/70 bg-card overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-lg shadow-xs">
      <div
        role="button"
        tabIndex={0}
        className="flex flex-col text-left cursor-pointer focus:outline-none"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpen();
          }
        }}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-muted/40 w-full">
          {item.coverImageURL ? (
            <img
              alt={item.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              decoding="async"
              loading="lazy"
              src={item.coverImageURL}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
              {item.isCollection ? (
                <Folder className="h-10 w-10 text-muted-foreground/50" />
              ) : (
                <BookImage className="h-9 w-9" />
              )}
            </div>
          )}

          {/* Collection badge */}
          {item.isCollection && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-md border border-white/10">
              <Folder className="h-3 w-3" />
              <span>{t("library.collectionBadge")}</span>
            </div>
          )}

          {/* Pinned bookmark tag */}
          {item.isPinned && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black shadow-sm backdrop-blur-sm">
              <Pin className="h-2.5 w-2.5 fill-black" />
              <span>{t("library.pinnedBadge")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card bottom info and actions bar */}
      <div className="flex flex-col px-3 py-2.5 bg-card border-t border-border/40 gap-1">
        <div className="cursor-pointer" onClick={handleOpen}>
          <h4
            className="text-xs sm:text-sm font-semibold tracking-tight text-foreground truncate group-hover:text-primary transition-colors leading-snug"
            title={item.title}
          >
            {item.title}
          </h4>
        </div>

        <div className="flex items-center justify-between gap-1.5 text-[11px] text-muted-foreground">
          <div
            className="min-w-0 flex-1 truncate cursor-pointer flex items-center gap-1"
            onClick={handleOpen}
          >
            <span className="shrink-0">
              {item.isCollection
                ? `${t("library.mangaUnit", { count: item.mangaCount || 0 })} · ${t("library.chapterUnit", { count: item.chapterCount })}`
                : `${t("library.chapterUnit", { count: item.chapterCount })} · ${t("library.pageUnit", { count: item.pageCount })}`}
            </span>
            <span className="text-muted-foreground/30 shrink-0">·</span>
            <span
              className="text-muted-foreground/60 truncate font-mono text-[10.5px]"
              title={formatDateTime(item.lastUpdated)}
            >
              {formatSmartDate(item.lastUpdated, i18n.language)}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!item.parentPath && onToggleCollection && (
              <button
                type="button"
                title={
                  item.isCollection
                    ? t("library.unsetCollection")
                    : t("library.setCollection")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollection(item);
                }}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md transition-all duration-150",
                  item.isCollection
                    ? "text-primary hover:bg-primary/10 opacity-75 group-hover:opacity-100"
                    : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                )}
              >
                <Folders className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              title={t("library.openDirectory")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDirectory(item.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              title={item.isPinned ? t("library.unpin") : t("library.pin")}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(item.id);
              }}
              className={cn(
                "flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-all duration-150 shrink-0",
                item.isPinned
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25"
                  : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
              )}
            >
              <Pin
                className={cn(
                  "h-3 w-3 transition-transform",
                  item.isPinned &&
                    "rotate-45 fill-amber-500 text-amber-500 dark:text-amber-400 dark:fill-amber-400"
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
});
