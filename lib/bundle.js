/** @babel */
import * as char from 'hjs-core/lib/char';
import {Enumeration} from 'hjs-collection/lib/iterator';
import {Hashtable} from 'hjs-collection/lib/table';
import {ByteBuffer} from 'hjs-io/lib/buffer';
import {ByteArrayInputStream} from 'hjs-io/lib/input';
import {UNKNOWN_TYPE,EventListener,EventObject} from 'eventslib/lib/event';
import {EventListenerAggregate} from 'eventslib/lib/aggregate';
import {ARRAY_BUFFER,GET,LOAD_END_STATE,HTTPConnection} from 'libhttp/lib/http';
import {Locale} from 'liblocale/lib/locale';
import {Properties} from 'libprops/lib/props';

export class ResourceBundleEvent extends EventObject {

    constructor({source, id = 401, priority = 0, data = null, when = Date.now()} = {}) {
        super({source, id, priority, data, when});
    }

    consume() {
        switch (this.id) {
            case ResourceBundleEvent.RESOURCE_BUNDLE_LOADED:
            case ResourceBundleEvent.RESOURCE_BUNDLE_ERROR:
                this.consumed = true;
                break;
            default:
                this.consumed = false;
                break;
        }
    }

    getException() {
        let data = this.getData();
        if (data !== null &&
            data.hasOwnProperty('exception') &&
            data.exception) {
            return data.exception;
        }
        return null;
    }

    getPropertyResourceBundle() {
        let data = this.getData();
        if (data !== null &&
            data.hasOwnProperty('bundle') &&
            data.bundle) {
            return data.bundle;
        }
        return null;
    }

    paramString() {
        let typeStr;
        switch (this.id) {
            case ResourceBundleEvent.RESOURCE_BUNDLE_LOADED:
                typeStr = 'RESOURCE_BUNDLE_LOADED';
                break;
            case ResourceBundleEvent.RESOURCE_BUNDLE_ERROR:
                typeStr = 'RESOURCE_BUNDLE_ERROR';
                break;
            default:
                typeStr = UNKNOWN_TYPE;
        }
        return `${typeStr},
                when=${this.when},
                priority=${this.priority},
                posted=${this.posted},
                consumed=${this.consumed}
                `;
    }

}

ResourceBundleEvent.RESOURCE_BUNDLE_FIRST = 400;
ResourceBundleEvent.RESOURCE_BUNDLE_LOADED = ResourceBundleEvent.RESOURCE_BUNDLE_FIRST + 1;
ResourceBundleEvent.RESOURCE_BUNDLE_ERROR = ResourceBundleEvent.RESOURCE_BUNDLE_FIRST + 2;
ResourceBundleEvent.RESOURCE_BUNDLE_LAST = ResourceBundleEvent.RESOURCE_BUNDLE_ERROR;

export class ResourceBundleListener extends EventListener {

    constructor({ onResourceBundleError = null, onResourceBundleLoaded = null } = {}) {
        super();
        if (onResourceBundleError !== null) {
            this.onResourceBundleError = onResourceBundleError;
        }
        if (onResourceBundleLoaded !== null) {
            this.onResourceBundleLoaded = onResourceBundleLoaded;
        }
    }

    onResourceBundleError(evt) {
    }

    onResourceBundleLoaded(evt) {
    }

}

export class ResourceBundleLoader {

    constructor({ path="", onAllResourceBundleLoaded = null } = {}) {
        this.mBundleListeners = new EventListenerAggregate(ResourceBundleListener);
        this.mPath = path;
        if (onAllResourceBundleLoaded !== null) {
            this.onAllResourceBundleLoaded = onAllResourceBundleLoaded;
        }
    }

    addResourceBundleListener(rbl) {
        if (rbl === null) {
            throw new ReferenceError("NullPointerException Bundle listener is null.");
        }
        this.mBundleListeners.add(rbl);
    }

    getResourceBundleAsStream(fileName) {
        new HTTPConnection({
            url: this.mPath + fileName + ".properties",
            method: GET,
            responseType: ARRAY_BUFFER,
            handlers: {
                onHandleRequest: (event) => {
                    let type = event.type;
                    let response = event.response;
                    if (type === LOAD_END_STATE) {
                        if (!response.hasError()) {
                            this.notifyResourceBundleLoaded(new PropertyResourceBundle({
                                input: new ByteArrayInputStream({
                                    input: ByteBuffer.createBuffer({ buffer:response.getMessageBody() })
                                })
                            }));
                        } else {
                            this.notifyResourceBundleError(response.getException());
                        }
                    }
                }
            }
        });
    }

    notifyResourceBundleError(error) {
        let listeners = this.mBundleListeners.getListenersInternal();
        let evt = new ResourceBundleEvent({
            source : this,
            id : ResourceBundleEvent.RESOURCE_BUNDLE_ERROR,
            data : {
                exception: error
            }
        });
        for (const listener of listeners) {
            listener.onResourceBundleError(evt);
        }
    }

    notifyResourceBundleLoaded(bundle) {
        let listeners = this.mBundleListeners.getListenersInternal();
        let evt = new ResourceBundleEvent({
            source : this,
            id : ResourceBundleEvent.RESOURCE_BUNDLE_LOADED,
            data : {
                bundle: bundle
            }
        });
        for (const listener of listeners) {
            listener.onResourceBundleLoaded(evt);
        }
    }

    onAllResourceBundleLoaded(bundle) {

    }

    removeResourceBundleListener(rbl) {
        if (rbl === null) {
            throw new ReferenceError("NullPointerException Bundle listener is null.");
        }
        this.mBundleListeners.remove(rbl);
    }
}

const LOADERS = {};
const BUNDLES = {};
let DEFAULT_LOCALE = Locale.getDefault();

let CACHE = {};

let ROOT_PATH = "./";

export class ResourceBundle {

    constructor({ locale=null, parent=null } = {}) {
        this.mLocale = null;
        this.mParent = null;
        if (locale !== null) {
            this.setLocale(locale);
        }
        if (parent !== null) {
            this.setParent(parent);
        }
    }

    static getBundle({bundleName=null,locale=null,loader=null,path=null,onAllResourceBundleLoaded}={}) {
        if (loader === null) {
            if (path !== null) {
                loader = LOADERS[path];
            }
            if (loader === null) {
                let rootPath = ResourceBundle.getRootPath();
                loader = LOADERS[rootPath];
                if (loader === null) {
                    loader = new ResourceBundleLoader({ path: rootPath });
                    LOADERS[rootPath] = loader;
                }
            }
            if (onAllResourceBundleLoaded !== null) {
                loader.onAllResourceBundleLoaded = options.onAllResourceBundleLoaded;
            } else {
                throw new ReferenceError("NullPointerException no loader callback specified");
            }
        }
        path = loader.mPath;
        if (LOADERS[path] !== loader) {
            LOADERS[path] = loader;
        }
        ResourceBundle.getBundleImpl(bundleName, locale, loader);
    }

    static getBundleImpl(bundleName, locale, loader) {
        if (bundleName === null) {
            throw new ReferenceError("NullPointerException");
        }
        let defLocale = DEFAULT_LOCALE;
        if (DEFAULT_LOCALE !== defLocale) {
            CACHE = {};
            DEFAULT_LOCALE = defLocale;
        }
        if (locale === null) {
            locale = defLocale;
        }
        let localeName = null;
        if (locale !== DEFAULT_LOCALE) {
            localeName = locale.toString();
        } else {
            localeName = DEFAULT_LOCALE.toString();
        }
        if (localeName.length > 0) {
            localeName = "_" + localeName;
        }
        ResourceBundle.handleGetBundle(bundleName, locale, localeName, loader);
    }

    getKeys() {
        return null;
    }

    getLocale() {
        return this.mLocale;
    }

    getObject(key) {
        let last = null;
        let result = null;
        let theParent = this;
        do {
            result = theParent.handleGetObject(key);
            if (result === null) {
                return result;
            }
            last = theParent;
            theParent = theParent.mParent;
        } while (theParent !== null);
        throw new ReferenceError("MissingResourceException");
    }

    static getRootPath() {
        return ROOT_PATH;
    }

    getString(key) {
        return this.getObject(key);
    }

    getStringArray(key) {
        return this.getObject(key);
    }

    static handleGetBundle(base, locale, loadBase, loader, loadedCallback=null) {
        let bundle;
        let localeString = locale.toString();
        let bundleName = base + "_" + localeString;
        let cacheKey = loader.mPath;
        let loaderCache = CACHE[cacheKey];
        if (loaderCache === null) {
            loaderCache = new Hashtable();
            loaderCache.put(cacheKey, loaderCache);
        }
        let result = loaderCache.get(bundleName);
        if (result !== null) {
            if (result === MISSINGBASE) {
                loader.onAllResourceBundleLoaded(null);
            } else if (result === MISSING) {
                if (!loadBase) {
                    loader.onAllResourceBundleLoaded(null);
                } else {
                    let extension = ResourceBundle.strip(localeString);
                    if (extension === null) {
                        loader.onAllResourceBundleLoaded(null);
                    } else {
                        ResourceBundle.handleGetBundle(base, extension, loadBase, loader);
                    }
                }
            } else {
                loader.onAllResourceBundleLoaded(result);
            }
        } else {
            try {
                let bundleClass = BUNDLES[bundleName];
                if (bundleClass !== null) {
                    bundle = new bundleClass();
                }
            } catch(e) {
                console.error(e);
            }
            if (bundle !== null) {
                bundle.setLocale(locale);
                loader.onAllResourceBundleLoaded(bundle);
            } else {
                let fileName = char.replaceAll(bundleName, '.', '/');
                let extension = ResourceBundle.strip(localeString);
                let rbl;
                loader.addResourceBundleListener(rbl = new ResourceBundleListener({
                    onResourceBundleError : (evt) => {
                        loader.removeResourceBundleListener(rbl);
                        if (loadedCallback !== null) {
                            loadedCallback(null);
                        } else {
                            if (extension !== null && (loadBase || extension.length > 0)) {
                                ResourceBundle.handleGetBundle(base, extension, loadBase, loader, (bundle) => {
                                    if (bundle !== null) {
                                        loaderCache.put(bundleName, bundle);
                                    } else {
                                        loaderCache.put(bundleName, loadBase ? MISSINGBASE : MISSING);
                                    }
                                });
                            }
                        }
                    },
                    onResourceBundleLoaded : (evt) => {
                        loader.removeResourceBundleListener(rbl);
                        let bundle = evt.getPropertyResourceBundle();
                        if (loadedCallback !== null) {
                            loadedCallback(bundle);
                        } else {
                            bundle.setLocale(locale);
                            if (extension !== null) {
                                ResourceBundle.handleGetBundle(base, extension, true, loader, (parent) => {
                                    if (parent !== null) {
                                        bundle.setParent(parent);
                                    }
                                    loader.onAllResourceBundleLoaded(bundle);
                                });
                            }
                            loaderCache.put(bundleName, bundle);
                        }
                    }
                }));
                loader.getResourceBundleAsStream(fileName);
            }
        }
    }

    handleGetObject(key) {
        return null;
    }

    setLocale(locale) {
        this.mLocale = locale;
    }

    setParent(bundle) {
        this.mParent = bundle;
    }

    static setRootPath(path) {
        ROOT_PATH = path;
    }

    static strip(name) {
        let index = name.lastIndexOf('_');
        if (index !== -1) {
            return name.substring(0, index);
        }
        return null;
    }
}

const MISSING = new ResourceBundle();
const MISSINGBASE = new ResourceBundle();

export class PropertyResourceBundle extends ResourceBundle {

    constructor({ locale=null, parent=null, input=null } = {}) {
        super({locale,parent});
        this.mResources = new Properties();
        if (input !== null) {
            this.mResources.loadFromInputStream(input);
        }
    }

    getKeys() {
        if (this.mParent === null) {
            return this.getLocalKeys();
        }
        let local = this.getLocalKeys();
        let pEnum = this.mParent.getKeys();
        let nextEl = null;
        let findNext = () => {
            if (nextEl !== null) {
                return true;
            }
            while (pEnum.hasMoreElements()) {
                let next = pEnum.nextElement();
                if (!this.mResources.containsKey(next)) {
                    nextEl = next;
                    return true;
                }
            }
            return false;
        };
        let enumeration = new Enumeration();
        enumeration.hasMoreElements = () => {
            if (local.hasMoreElements()) {
                return true;
            }
            return findNext();
        };
        enumeration.nextElement = () => {
            if (local.hasMoreElements()) {
                return local.nextElement();
            }
            if (findNext()) {
                let result = nextEl;
                nextEl = null;
                return result;
            }
            return pEnum.nextElement();
        };
        return enumeration;
    }

    getLocalKeys() {
        return this.mResources.propertyNames();
    }

    handleGetObject(key) {
        return this.mResources.get(key);
    }
}