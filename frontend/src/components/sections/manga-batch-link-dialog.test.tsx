import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@/lib/i18n";
import { MangaBatchLinkDialog } from "@/components/sections/manga-batch-link-dialog";
import { appAdapter } from "@/lib/api";
import type { LibraryManga, LibrarySource, MangaOnlineLink } from "@/lib/contracts";

const mockMangas: LibraryManga[] = [
  {
    id: "manga-1",
    title: "One Piece",
    sourceURL: "",
    relativePath: "rel/one_piece",
    coverImageURL: "",
    chapterCount: 100,
    pageCount: 2000,
    sourceID: "src-1",
    lastUpdated: "2026-10-31T00:00:00Z",
  },
  {
    id: "manga-2",
    title: "Naruto",
    sourceURL: "",
    relativePath: "rel/naruto",
    coverImageURL: "",
    chapterCount: 700,
    pageCount: 14000,
    sourceID: "src-2",
    lastUpdated: "2026-10-31T00:00:00Z",
  },
  {
    id: "manga-3",
    title: "Bleach",
    sourceURL: "",
    relativePath: "rel/bleach",
    coverImageURL: "",
    chapterCount: 686,
    pageCount: 13000,
    sourceID: "src-1",
    lastUpdated: "2026-10-31T00:00:00Z",
  },
];

const mockSources: LibrarySource[] = [
  { id: "src-1", name: "Local Disk", path: "/Volumes/Manga1", type: "local", enabled: true },
  { id: "src-2", name: "NAS Storage", path: "/Volumes/NAS/Manga", type: "smb", enabled: true },
];

const mockLinks: MangaOnlineLink[] = [
  {
    mangaId: "manga-1",
    onlineSource: "copymanga",
    onlineComicId: "one-piece",
    onlineTitle: "航海王",
    autoFollow: true,
    followPolicy: "latest_only",
  },
];

describe("MangaBatchLinkDialog Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(appAdapter, "getAllMangaOnlineLinks").mockResolvedValue(mockLinks);
    vi.spyOn(appAdapter, "matchLocalManga").mockResolvedValue([
      {
        id: "matched-id-1",
        source: "copymanga",
        title: "Online Title Match",
        author: "Author A",
        coverURL: "",
        status: "ongoing",
      },
    ]);
    vi.spyOn(appAdapter, "linkMangaOnline").mockResolvedValue();
    vi.spyOn(appAdapter, "unlinkMangaOnline").mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders dialog with manga items and close button", async () => {
    const onCloseSpy = vi.fn();
    render(
      <MangaBatchLinkDialog
        open={true}
        onClose={onCloseSpy}
        mangas={mockMangas}
        sources={mockSources}
      />
    );

    expect(screen.getByText(/本地漫画在线关联与追更管理|Local Manga Online Linking|ローカル漫画オンライン紐付け/i)).toBeInTheDocument();
    expect(await screen.findByText("One Piece")).toBeInTheDocument();
    expect(screen.getByText("Naruto")).toBeInTheDocument();
    expect(screen.getByText("Bleach")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /^关闭$|^Close$|^閉じる$/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });

  it("filters items by link status (all / unlinked / linked)", async () => {
    render(
      <MangaBatchLinkDialog
        open={true}
        onClose={vi.fn()}
        mangas={mockMangas}
        sources={mockSources}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("One Piece")).toBeInTheDocument();
    });

    // Filter unlinked
    const unlinkedTab = screen.getByRole("radio", { name: /^未关联$|^Unlinked$|^未紐付け$/i });
    fireEvent.click(unlinkedTab);

    // One Piece is linked, so should disappear in unlinked view
    expect(screen.queryByText("One Piece")).not.toBeInTheDocument();
    expect(screen.getByText("Naruto")).toBeInTheDocument();
    expect(screen.getByText("Bleach")).toBeInTheDocument();

    // Filter linked
    const linkedTab = screen.getByRole("radio", { name: /^已关联$|^Linked$|^紐付け済$/i });
    fireEvent.click(linkedTab);

    expect(screen.getByText("One Piece")).toBeInTheDocument();
    expect(screen.queryByText("Naruto")).not.toBeInTheDocument();
    expect(screen.queryByText("Bleach")).not.toBeInTheDocument();
  });

  it("filters items by directory source", async () => {
    render(
      <MangaBatchLinkDialog
        open={true}
        onClose={vi.fn()}
        mangas={mockMangas}
        sources={mockSources}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("One Piece")).toBeInTheDocument();
    });

    const filterBtn = screen.getByTestId("source-filter-button");
    expect(filterBtn).toBeInTheDocument();

    // Open source directory menu
    fireEvent.click(filterBtn);

    // Select "NAS Storage" (src-2) which only contains Naruto
    const nasItem = await screen.findByRole("menuitem", { name: /NAS Storage/i });
    fireEvent.click(nasItem);

    expect(screen.queryByText("One Piece")).not.toBeInTheDocument();
    expect(screen.getByText("Naruto")).toBeInTheDocument();
    expect(screen.queryByText("Bleach")).not.toBeInTheDocument();
  });

  it("supports updating tracking group for a linked comic", async () => {
    const linkSpy = vi.spyOn(appAdapter, "linkMangaOnline").mockResolvedValue();

    render(
      <MangaBatchLinkDialog
        open={true}
        onClose={vi.fn()}
        mangas={mockMangas}
        sources={mockSources}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("One Piece")).toBeInTheDocument();
    });

    // One Piece is linked, open its target group dropdown
    const groupButtons = screen.getAllByTitle(/追踪分组|Target Group|追跡グループ/i);
    expect(groupButtons.length).toBeGreaterThan(0);
    fireEvent.click(groupButtons[0]);

    // Select "单行本" (Volumes)
    const tankobonItem = await screen.findByRole("menuitem", { name: /单行本|Volumes|単行本/i });
    fireEvent.click(tankobonItem);

    await waitFor(() => {
      expect(linkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          mangaId: "manga-1",
          targetGroup: "单行本",
        })
      );
    });
  });

  it("supports batch unlinking for selected linked comics", async () => {
    const unlinkSpy = vi.spyOn(appAdapter, "unlinkMangaOnline").mockResolvedValue();

    render(
      <MangaBatchLinkDialog
        open={true}
        onClose={vi.fn()}
        mangas={mockMangas}
        sources={mockSources}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("One Piece")).toBeInTheDocument();
    });

    // Select all displayed
    const selectAllBtn = screen.getByRole("button", { name: /^全选$|^Select All$|^すべて選択$/i });
    fireEvent.click(selectAllBtn);

    // One Piece is linked, so batch unlink button should appear
    const batchUnlinkBtn = await screen.findByRole("button", {
      name: /批量取消关联|Batch Unlink|一括紐付け解除/i,
    });
    expect(batchUnlinkBtn).toBeInTheDocument();

    fireEvent.click(batchUnlinkBtn);

    await waitFor(() => {
      expect(unlinkSpy).toHaveBeenCalledWith("manga-1");
    });
  });
});
