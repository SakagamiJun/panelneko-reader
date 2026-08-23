import { beforeEach, describe, expect, it } from "vitest";
import { MockAdapter } from "@/lib/api/mock-adapter";

describe("MockAdapter Pin Functionality", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    localStorage.clear();
    adapter = new MockAdapter();
  });

  it("toggles pin on and off", async () => {
    let items = await adapter.listLibraryManga();
    const target = items.find((i) => !i.isPinned && !i.parentPath);
    expect(target).toBeDefined();

    // Toggle pin on
    const pinned = await adapter.togglePin(target!.id);
    expect(pinned).toBe(true);

    items = await adapter.listLibraryManga();
    const updated = items.find((i) => i.id === target!.id);
    expect(updated?.isPinned).toBe(true);
    expect(updated?.pinnedAt).toBeDefined();
    // Pinned root item must be at the very top
    expect(items[0].id).toBe(target!.id);

    // Toggle pin off
    const unpinned = await adapter.togglePin(target!.id);
    expect(unpinned).toBe(false);

    items = await adapter.listLibraryManga();
    const reverted = items.find((i) => i.id === target!.id);
    expect(reverted?.isPinned).toBe(false);
  });

  it("updates collection cover when child manga is pinned", async () => {
    let items = await adapter.listLibraryManga();
    const collection = items.find((i) => i.isCollection);
    expect(collection).toBeDefined();

    const children = items.filter((i) => i.parentPath === collection!.relativePath);
    expect(children.length).toBeGreaterThanOrEqual(2);

    const secondChild = children[1];
    const originalCollCover = collection!.coverImageURL;

    // Pin second child
    await adapter.togglePin(secondChild.id);

    items = await adapter.listLibraryManga();
    const updatedColl = items.find((i) => i.id === collection!.id);
    expect(updatedColl?.coverImageURL).toBe(secondChild.coverImageURL);

    // Inside collection, second child is sorted first
    const updatedChildren = items.filter((i) => i.parentPath === collection!.relativePath);
    expect(updatedChildren[0].id).toBe(secondChild.id);
    expect(updatedChildren[0].isPinned).toBe(true);

    // Unpin second child
    await adapter.togglePin(secondChild.id);

    items = await adapter.listLibraryManga();
    const revertedColl = items.find((i) => i.id === collection!.id);
    expect(revertedColl?.coverImageURL).toBe(originalCollCover);
  });
});
