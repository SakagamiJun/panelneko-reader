import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Search, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { ReaderChapter } from "@/lib/contracts";
import { cn } from "@/lib/utils";

interface ChapterPopoverProps {
  chapters: ReaderChapter[];
  activeChapterID: string | undefined;
  onSelectChapter: (chapterID: string) => void;
  onClose: () => void;
}

export function ChapterPopover({
  chapters,
  activeChapterID,
  onSelectChapter,
  onClose,
}: ChapterPopoverProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chapters.length > 5) {
      inputRef.current?.focus();
    }
  }, [chapters.length]);

  const filteredChapters = chapters.filter((c) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(query) ||
      (c.number > 0 && String(c.number).includes(query))
    );
  });

  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-border/80 bg-card/95 p-3 shadow-2xl backdrop-blur-2xl z-40 space-y-2.5 animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col max-h-[70vh]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-1.5 border-b border-border/60 shrink-0">
        <span className="text-xs font-semibold text-foreground">{t("reader.chapterList")}</span>
        <span className="text-[11px] font-mono text-muted-foreground">
          {t("library.chapterUnit", { count: chapters.length })}
        </span>
      </div>

      {chapters.length > 5 && (
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("reader.jumpChapterLabel")}
            className="pl-8 pr-7 h-7 text-xs bg-muted/40 border-border/60 focus-visible:bg-background"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1.5 h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5 max-h-[360px]">
        {filteredChapters.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t("library.noMatches")}
          </div>
        ) : (
          filteredChapters.map((ch) => {
            const isActive = ch.id === activeChapterID;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  onSelectChapter(ch.id);
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors border",
                  isActive
                    ? "bg-accent/80 text-foreground font-medium border-border/80 shadow-xs"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className={cn("truncate", isActive && "font-semibold text-foreground")}>
                    {ch.number > 0 ? `${ch.number} · ${ch.title}` : ch.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {t("library.pageUnit", { count: ch.pageCount })}
                  </div>
                </div>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0 ml-2 text-primary" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
