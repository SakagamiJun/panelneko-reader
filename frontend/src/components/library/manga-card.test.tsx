import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MangaCard } from "@/components/library/manga-card";
import type { LibraryManga } from "@/lib/contracts";

describe("MangaCard Component", () => {
  afterEach(() => {
    cleanup();
  });

  const baseManga: LibraryManga = {
    id: "manga-1",
    sourceID: "src-local",
    title: "One Piece",
    sourceURL: "",
    relativePath: "One Piece",
    coverImageURL: "",
    chapterCount: 100,
    pageCount: 1800,
    lastUpdated: "2026-09-24T12:00:00Z",
    isAvailable: true,
  };

  const baseCollection: LibraryManga = {
    id: "coll-1",
    sourceID: "src-nas",
    title: "Shonen Jump",
    sourceURL: "",
    relativePath: "Shonen Jump",
    isCollection: true,
    mangaCount: 12,
    coverImageURL: "",
    chapterCount: 350,
    pageCount: 5000,
    lastUpdated: "2026-09-24T12:00:00Z",
    isAvailable: true,
  };

  it("calls onOpenManga with id when standalone manga is clicked", () => {
    const handleOpenManga = vi.fn();
    const handleOpenCollection = vi.fn();

    render(
      <MangaCard
        item={baseManga}
        onOpenManga={handleOpenManga}
        onOpenCollection={handleOpenCollection}
        onTogglePin={vi.fn()}
        onOpenDirectory={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("One Piece"));
    expect(handleOpenManga).toHaveBeenCalledWith("manga-1");
    expect(handleOpenCollection).not.toHaveBeenCalled();
  });

  it("calls onOpenCollection with relativePath and sourceID when collection is clicked", () => {
    const handleOpenManga = vi.fn();
    const handleOpenCollection = vi.fn();

    render(
      <MangaCard
        item={baseCollection}
        onOpenManga={handleOpenManga}
        onOpenCollection={handleOpenCollection}
        onTogglePin={vi.fn()}
        onOpenDirectory={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Shonen Jump"));
    expect(handleOpenCollection).toHaveBeenCalledWith("Shonen Jump", "src-nas");
    expect(handleOpenManga).not.toHaveBeenCalled();
  });

  it("renders sourceName badge when sourceName prop is provided", () => {
    render(
      <MangaCard
        item={baseManga}
        sourceName="NAS Library"
        onOpenManga={vi.fn()}
        onOpenCollection={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenDirectory={vi.fn()}
      />
    );

    expect(screen.getByText("NAS Library")).toBeInTheDocument();
  });

  it("does not render sourceName badge when sourceName prop is undefined", () => {
    render(
      <MangaCard
        item={baseManga}
        onOpenManga={vi.fn()}
        onOpenCollection={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenDirectory={vi.fn()}
      />
    );

    expect(screen.queryByText("NAS Library")).not.toBeInTheDocument();
  });

  it("falls back to placeholder when cover image encounters load error", () => {
    const itemWithCover: LibraryManga = {
      ...baseManga,
      coverImageURL: "/covers/broken.jpg",
    };

    render(
      <MangaCard
        item={itemWithCover}
        onOpenManga={vi.fn()}
        onOpenCollection={vi.fn()}
        onTogglePin={vi.fn()}
        onOpenDirectory={vi.fn()}
      />
    );

    const img = screen.getByRole("img", { name: "One Piece" });
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(screen.queryByRole("img", { name: "One Piece" })).not.toBeInTheDocument();
  });
});
