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
  selectDirectory(options) {
    return currentAdapter().selectDirectory(options);
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
  addLibrarySource(source) {
    return currentAdapter().addLibrarySource(source);
  },
  removeLibrarySource(sourceID) {
    return currentAdapter().removeLibrarySource(sourceID);
  },
  updateLibrarySource(source) {
    return currentAdapter().updateLibrarySource(source);
  },
  relocateLibrarySource(sourceID, newPath) {
    return currentAdapter().relocateLibrarySource(sourceID, newPath);
  },
  rescanSource(sourceID) {
    return currentAdapter().rescanSource(sourceID);
  },
  scanLibrary() {
    return currentAdapter().scanLibrary();
  },
  searchOnlineManga(source, query, page, limit) {
    return currentAdapter().searchOnlineManga(source, query, page, limit);
  },
  getOnlineMangaChapters(source, mangaID) {
    return currentAdapter().getOnlineMangaChapters(source, mangaID);
  },
  getOnlineMangaGroups(source, mangaID) {
    return currentAdapter().getOnlineMangaGroups(source, mangaID);
  },
  createDownloadTasks(inputs) {
    return currentAdapter().createDownloadTasks(inputs);
  },
  pauseDownloadTask(taskID) {
    return currentAdapter().pauseDownloadTask(taskID);
  },
  resumeDownloadTask(taskID) {
    return currentAdapter().resumeDownloadTask(taskID);
  },
  cancelDownloadTask(taskID) {
    return currentAdapter().cancelDownloadTask(taskID);
  },
  getDownloadTasks() {
    return currentAdapter().getDownloadTasks();
  },
  clearCompletedDownloadTasks() {
    return currentAdapter().clearCompletedDownloadTasks();
  },
  getDownloadProgress() {
    return currentAdapter().getDownloadProgress();
  },
  retryDownloadTask(taskID) {
    return currentAdapter().retryDownloadTask(taskID);
  },
  matchLocalManga(mangaID, provider) {
    return currentAdapter().matchLocalManga(mangaID, provider);
  },
  linkMangaOnline(input) {
    return currentAdapter().linkMangaOnline(input);
  },
  getMangaOnlineLink(mangaID) {
    return currentAdapter().getMangaOnlineLink(mangaID);
  },
  unlinkMangaOnline(mangaID) {
    return currentAdapter().unlinkMangaOnline(mangaID);
  },
  checkMangaUpdates(mangaID) {
    return currentAdapter().checkMangaUpdates(mangaID);
  },
  checkAllFollowedUpdates() {
    return currentAdapter().checkAllFollowedUpdates();
  },
  getFollowedUpdateCheckStatus() {
    return currentAdapter().getFollowedUpdateCheckStatus();
  },
  openLogDirectory() {
    return currentAdapter().openLogDirectory();
  },
  toggleMangaAutoFollow(mangaID) {
    return currentAdapter().toggleMangaAutoFollow(mangaID);
  },
  getAllMangaOnlineLinks() {
    return currentAdapter().getAllMangaOnlineLinks();
  },
  loginCopyManga(username, password) {
    return currentAdapter().loginCopyManga(username, password);
  },
  logoutCopyManga() {
    return currentAdapter().logoutCopyManga();
  },
  getIsDevMode() {
    return currentAdapter().getIsDevMode();
  },
  getDevInfo() {
    return currentAdapter().getDevInfo();
  },
  getCopyMangaAccounts() {
    return currentAdapter().getCopyMangaAccounts();
  },
  addCopyMangaAccount(username, password, token) {
    return currentAdapter().addCopyMangaAccount(username, password, token);
  },
  deleteCopyMangaAccount(username) {
    return currentAdapter().deleteCopyMangaAccount(username);
  },
};
