export interface DraftRecord {
  path: string;
  content: string;
  updatedAt: number;
}

export interface DraftVersionRecord extends DraftRecord {
  id: string;
}

interface UiStateRecord {
  key: "ui";
  section: string;
  path: string;
}

const DB_NAME = "study-route";
const DB_VERSION = 2;
const DRAFT_STORE = "drafts";
const DRAFT_VERSION_STORE = "draftVersions";
const UI_STORE = "ui";
const MAX_DRAFT_VERSIONS = 10;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: "path" });
      if (!db.objectStoreNames.contains(DRAFT_VERSION_STORE)) {
        const versionStore = db.createObjectStore(DRAFT_VERSION_STORE, { keyPath: "id" });
        versionStore.createIndex("path", "path", { unique: false });
      }
      if (!db.objectStoreNames.contains(UI_STORE)) db.createObjectStore(UI_STORE, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getDraft(path: string): Promise<DraftRecord | undefined> {
  return withStore<DraftRecord | undefined>(DRAFT_STORE, "readonly", (store) => store.get(path));
}

export async function saveDraft(path: string, content: string): Promise<void> {
  await withStore<IDBValidKey>(DRAFT_STORE, "readwrite", (store) => store.put({ path, content, updatedAt: Date.now() }));
  await saveDraftVersion(path, content);
}

export async function clearDraft(path: string): Promise<void> {
  await withStore<undefined>(DRAFT_STORE, "readwrite", (store) => store.delete(path));
}

export async function getDraftVersions(path: string): Promise<DraftVersionRecord[]> {
  const versions = await withStore<DraftVersionRecord[]>(DRAFT_VERSION_STORE, "readonly", (store) => store.index("path").getAll(path));
  return versions.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function saveDraftVersion(path: string, content: string): Promise<void> {
  const versions = await getDraftVersions(path);
  if (versions[0]?.content === content) return;

  const record: DraftVersionRecord = {
    id: `${path}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    path,
    content,
    updatedAt: Date.now()
  };
  await withStore<IDBValidKey>(DRAFT_VERSION_STORE, "readwrite", (store) => store.put(record));

  const staleVersions = (await getDraftVersions(path)).slice(MAX_DRAFT_VERSIONS);
  await Promise.all(staleVersions.map((version) => withStore<undefined>(DRAFT_VERSION_STORE, "readwrite", (store) => store.delete(version.id))));
}

export async function getUiState(): Promise<UiStateRecord | undefined> {
  return withStore<UiStateRecord | undefined>(UI_STORE, "readonly", (store) => store.get("ui"));
}

export async function saveUiState(section: string, path: string): Promise<void> {
  await withStore<IDBValidKey>(UI_STORE, "readwrite", (store) => store.put({ key: "ui", section, path }));
}
