interface DraftRecord {
  path: string;
  content: string;
  updatedAt: number;
}

interface UiStateRecord {
  key: "ui";
  section: string;
  path: string;
}

const DB_NAME = "study-route";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const UI_STORE = "ui";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: "path" });
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
}

export async function clearDraft(path: string): Promise<void> {
  await withStore<undefined>(DRAFT_STORE, "readwrite", (store) => store.delete(path));
}

export async function getUiState(): Promise<UiStateRecord | undefined> {
  return withStore<UiStateRecord | undefined>(UI_STORE, "readonly", (store) => store.get("ui"));
}

export async function saveUiState(section: string, path: string): Promise<void> {
  await withStore<IDBValidKey>(UI_STORE, "readwrite", (store) => store.put({ key: "ui", section, path }));
}
