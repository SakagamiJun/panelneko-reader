import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm transition-opacity">
      <div
        className="w-full max-w-sm h-full flex flex-col border-l border-border/70 bg-background/95 backdrop-blur-2xl shadow-2xl p-4 animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h2 className="text-base font-bold">{t("reader.chapterList")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("library.chapterUnit", { count: chapters.length })}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {chapters.length > 5 && (
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("reader.jumpChapterLabel")}
              className="pl-8 h-8 text-xs"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-3 space-y-1 pr-1">
          {filteredChapters.map((ch) => {
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
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {ch.number > 0 ? `${ch.number} · ${ch.title}` : ch.title}
                  </div>
                  <div
                    className={cn(
                      "text-[10px] mt-0.5",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {t("library.pageUnit", { count: ch.pageCount })}
                  </div>
                </div>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
