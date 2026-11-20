export const defaults = () => ({
  schemaVersion: 1,
  contentVersion: "4.2.0",
  completed: [],
  favorites: [],
  notes: {},
  attempts: [],
  reviews: {},
  reviewEvents: [],
  userCards: [],
  drafts: {},
  history: [],
  settings: {
    keyboardHeight: 240,
    quizSplit: 0.4,
    dailyGoal: 5,
    newCards: 10,
    reviewLimit: 100,
    fontSize: 14,
    bodyFont: 15,
    editorDark: false,
    customKeyboard: true,
  },
  lastLesson: null,
  flashSession: null,
  activity: {},
  resourceCheck: null,
  lastBackupExportAt: null,
  studySeconds: 0,
  studyDays: {},
  learningView: { stage: "全部", expanded: ["ch01"] },
  practiceView: { expanded: ["ch01"] },
  labWorkspaces: {},
});
let database;
export async function openStore() {
  database = await new Promise((resolve, reject) => {
    const req = indexedDB.open("sql-shouji", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("records");
      req.result.createObjectStore("datasets");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const stored = await get("state");
  return stored
    ? {
        ...defaults(),
        ...stored,
        settings: { ...defaults().settings, ...stored.settings },
      }
    : defaults();
}
function request(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    let value;
    const req = fn(tx.objectStore(store));
    if (req)
      req.onsuccess = () => {
        value = req.result;
      };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("本地保存未完成"));
  });
}
export const get = (key) => request("records", "readonly", (s) => s.get(key));
export const save = (state) =>
  request("records", "readwrite", (s) => s.put(state, "state"));
export const datasets = () =>
  request("datasets", "readonly", (s) => s.getAll());
export const putDataset = (data) =>
  request("datasets", "readwrite", (s) => s.put(data, data.id));
export const deleteDataset = (id) =>
  request("datasets", "readwrite", (s) => s.delete(id));
export async function restoreAll(state, list) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["records", "datasets"], "readwrite");
    tx.objectStore("records").put(state, "state");
    for (const d of list) tx.objectStore("datasets").put(d, d.id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
