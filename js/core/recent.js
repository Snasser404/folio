/* Recent files — stored locally in IndexedDB (never uploaded). Keeps the most
 * recent N documents under a total size cap so users can reopen them. */
const DB_NAME = "pdf-studio";
const STORE = "recent";
const MAX_FILES = 8;
const MAX_BYTES = 80 * 1024 * 1024; // 80 MB total

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function saveRecent({ name, bytes, thumb }) {
  try {
    const db = await openDB();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const id = "r_" + name + "_" + bytes.length;
    await reqP(store.put({ id, name, date: Date.now(), size: bytes.length, bytes, thumb: thumb || null }));
    await evict();
  } catch (e) { console.warn("[recent] save failed", e); }
}

export async function listRecent() {
  try {
    const db = await openDB();
    const all = await reqP(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    return all.sort((a, b) => b.date - a.date);
  } catch { return []; }
}

export async function getRecentBytes(id) {
  try {
    const db = await openDB();
    const rec = await reqP(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
    return rec ? rec.bytes : null;
  } catch { return null; }
}

export async function clearRecent() {
  try {
    const db = await openDB();
    await reqP(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  } catch {}
}

async function evict() {
  const all = await listRecent();
  let total = 0;
  const keep = [];
  for (const r of all) {
    total += r.size;
    if (keep.length < MAX_FILES && total <= MAX_BYTES) keep.push(r.id);
  }
  const remove = all.filter((r) => !keep.includes(r.id));
  if (!remove.length) return;
  try {
    const db = await openDB();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    remove.forEach((r) => store.delete(r.id));
  } catch {}
}
