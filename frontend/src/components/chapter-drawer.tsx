import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import type { ReaderChapter } from "@/lib/contracts";
import { cn } from "@/lib/utils";

interface ChapterDrawerProps {
  open: boolean;
  onClose: () => void;
  chapters: ReaderChapter[];
  activeChapterID: string | undefined;
  onSelectChapter: (chapterID: string) => void;
}

export function ChapterDrawer({
  open,
  onClose,
  chapters,
  activeChapterID,
  onSelectChapter,
}: ChapterDrawerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

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
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm h-full flex flex-col border-l border-border/80 bg-background/98 backdrop-blur-2xl shadow-2xl p-4 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{t("reader.chapterList")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("library.chapterUnit", { count: chapters.length })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Kbd className="text-[10px] hidden sm:inline-flex">ESC</Kbd>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {chapters.length > 5 && (
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("reader.jumpChapterLabel")}
              className="pl-8 pr-7 h-8 text-xs bg-muted/40 border-border/60 focus-visible:bg-background"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-3 space-y-1 pr-1">
          {filteredChapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
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
                    "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors border",
                    isActive
                      ? "bg-accent/80 text-foreground font-medium border-border/80 shadow-xs"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <div className="min-w-0 flex-1">
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
    </div>
  );
}
