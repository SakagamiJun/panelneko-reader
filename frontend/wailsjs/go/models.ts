export namespace contracts {
	
	export class AppSettings {
	    libraryRoot: string;
	    localeMode: string;
	    locale: string;
	    themeMode: string;
	    readerScrollCachePages: number;
	    autoRestoreReaderProgress: boolean;
	    readerDirection: string;
	    readerSpreadMode: string;
	    readerCoverSolo: boolean;
	    readerFitMode: string;
	    readerFilter: string;
	    readerSideClickMode: string;
	    readerClickCenterZoom: boolean;
	    readerDoubleClickZoom: boolean;
	    shortcuts: Record<string, string>;
	    autoCheckUpdates?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.libraryRoot = source["libraryRoot"];
	        this.localeMode = source["localeMode"];
	        this.locale = source["locale"];
	        this.themeMode = source["themeMode"];
	        this.readerScrollCachePages = source["readerScrollCachePages"];
	        this.autoRestoreReaderProgress = source["autoRestoreReaderProgress"];
	        this.readerDirection = source["readerDirection"];
	        this.readerSpreadMode = source["readerSpreadMode"];
	        this.readerCoverSolo = source["readerCoverSolo"];
	        this.readerFitMode = source["readerFitMode"];
	        this.readerFilter = source["readerFilter"];
	        this.readerSideClickMode = source["readerSideClickMode"];
	        this.readerClickCenterZoom = source["readerClickCenterZoom"];
	        this.readerDoubleClickZoom = source["readerDoubleClickZoom"];
	        this.shortcuts = source["shortcuts"];
	        this.autoCheckUpdates = source["autoCheckUpdates"];
	    }
	}
	export class AppVersionInfo {
	    version: string;
	    commit?: string;
	
	    static createFrom(source: any = {}) {
	        return new AppVersionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.commit = source["commit"];
	    }
	}
	export class UpdateCheckResult {
	    hasUpdate: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    releaseURL: string;
	    releaseNotes?: string;
	    publishedAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasUpdate = source["hasUpdate"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseURL = source["releaseURL"];
	        this.releaseNotes = source["releaseNotes"];
	        this.publishedAt = source["publishedAt"];
	    }
	}
	export class LibraryManga {
	    id: string;
	    title: string;
	    sourceURL: string;
	    relativePath: string;
	    parentPath?: string;
	    isCollection?: boolean;
	    mangaCount?: number;
	    coverImageURL: string;
	    chapterCount: number;
	    pageCount: number;
	    lastUpdated: string;
	    isPinned?: boolean;
	    pinnedAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new LibraryManga(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.sourceURL = source["sourceURL"];
	        this.relativePath = source["relativePath"];
	        this.parentPath = source["parentPath"];
	        this.isCollection = source["isCollection"];
	        this.mangaCount = source["mangaCount"];
	        this.coverImageURL = source["coverImageURL"];
	        this.chapterCount = source["chapterCount"];
	        this.pageCount = source["pageCount"];
	        this.lastUpdated = source["lastUpdated"];
	        this.isPinned = source["isPinned"];
	        this.pinnedAt = source["pinnedAt"];
	    }
	}
	export class ReaderPage {
	    id: string;
	    chapterID: string;
	    chapterTitle: string;
	    pageIndex: number;
	    fileName: string;
	    sourceURL: string;
	
	    static createFrom(source: any = {}) {
	        return new ReaderPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.chapterID = source["chapterID"];
	        this.chapterTitle = source["chapterTitle"];
	        this.pageIndex = source["pageIndex"];
	        this.fileName = source["fileName"];
	        this.sourceURL = source["sourceURL"];
	    }
	}
	export class ReaderChapter {
	    id: string;
	    title: string;
	    number: number;
	    startPage: number;
	    pageCount: number;
	    pages: ReaderPage[];
	    localPath: string;
	    completedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ReaderChapter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.number = source["number"];
	        this.startPage = source["startPage"];
	        this.pageCount = source["pageCount"];
	        this.pages = this.convertValues(source["pages"], ReaderPage);
	        this.localPath = source["localPath"];
	        this.completedAt = source["completedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ReaderManifest {
	    mangaID: string;
	    title: string;
	    coverImageURL: string;
	    totalPages: number;
	    chapters: ReaderChapter[];
	
	    static createFrom(source: any = {}) {
	        return new ReaderManifest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mangaID = source["mangaID"];
	        this.title = source["title"];
	        this.coverImageURL = source["coverImageURL"];
	        this.totalPages = source["totalPages"];
	        this.chapters = this.convertValues(source["chapters"], ReaderChapter);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ReaderProgress {
	    mangaID: string;
	    chapterID: string;
	    page: number;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ReaderProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mangaID = source["mangaID"];
	        this.chapterID = source["chapterID"];
	        this.page = source["page"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

