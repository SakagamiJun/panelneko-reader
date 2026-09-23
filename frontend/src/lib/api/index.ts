import { getWailsApp } from "@/lib/runtime";
import type { AppAdapter } from "@/lib/api/adapter";
import { MockAdapter } from "@/lib/api/mock-adapter";
import { WailsAdapter } from "@/lib/api/wails-adapter";

const mockAdapter = new MockAdapter();
const wailsAdapter = new WailsAdapter();

function currentAdapter(): AppAdapter {
  return getWailsApp() ? wailsAdapter : mockAdapter;
}

export const appAdapter: AppAdapter = {
  get mode() {
    return currentAdapter().mode;
  },
  getSettings() {
    return currentAdapter().getSettings();
  },
  updateSettings(input) {
    return currentAdapter().updateSettings(input);
  },
  listLibraryManga() {
    return currentAdapter().listLibraryManga();
  },
  getReaderManifest(mangaID) {
    return currentAdapter().getReaderManifest(mangaID);
  },
  getReaderProgress(mangaID) {
    return currentAdapter().getReaderProgress(mangaID);
  },
  updateReaderProgress(input) {
    return currentAdapter().updateReaderProgress(input);
  },
  getAppVersion() {
    return currentAdapter().getAppVersion();
  },
  selectDirectory() {
    return currentAdapter().selectDirectory();
  },
  togglePin(mangaID) {
    return currentAdapter().togglePin(mangaID);
  },
  toggleCollection(mangaID) {
    return currentAdapter().toggleCollection(mangaID);
  },
  openDirectory(mangaID) {
    return currentAdapter().openDirectory(mangaID);
  },
  subscribe(eventName, callback) {
    return currentAdapter().subscribe(eventName, callback);
  },
  checkForUpdates() {
    return currentAdapter().checkForUpdates();
  },
  openURL(url) {
    return currentAdapter().openURL(url);
  },
  getThumbnailCacheSize() {
    return currentAdapter().getThumbnailCacheSize();
  },
  clearThumbnailCache() {
    return currentAdapter().clearThumbnailCache();
  },
};
