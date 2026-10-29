import type { Grade, StudyProgress, VocabularyItem, WordbookMeta } from "../types";

const REGISTRY = "vocab-wordbooks";
const ITEMS = "vocab-items:";
const PROGRESS = "vocab-fsrs:";
const LEGACY = "vocab-study:";

type LegacyRecord = {
  lemma?: string;
  seenCount?: number;
  knownCount?: number;
  fuzzyCount?: number;
  unknownCount?: number;
  lastRating?: "known" | "fuzzy" | "unknown" | null;
  lastSeenAt?: string | null;
};
type BackupBook = {
  meta: WordbookMeta;
  items: VocabularyItem[];
  progress: Record<string, StudyProgress>;
  legacyRecords?: Record<string, LegacyRecord>;
};
type Backup = { app: string; schema: number; exportedAt: string; books: BackupBook[] };

function parse<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
function getJson<T>(key: string, fallback: T) {
  return parse<T>(localStorage.getItem(key), fallback);
}
function normalizeLegacy(word: string) {
  return word.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function listWordbooks(): WordbookMeta[] {
  const data = getJson<unknown>(REGISTRY, []);
  return Array.isArray(data) ? data as WordbookMeta[] : [];
}
export function getWordbook(id: string) {
  return listWordbooks().find(book => book.id === id) ?? null;
}
export function getWordbookItems(id: string): VocabularyItem[] {
  const data = getJson<unknown>(ITEMS + id, []);
  return Array.isArray(data) ? data as VocabularyItem[] : [];
}

/** Preserve pre-FSRS study statistics without inventing a historical FSRS schedule. */
export function getProgress(id: string): Record<string, StudyProgress> {
  const recorded = getJson<Record<string, StudyProgress>>(PROGRESS + id, {});
  const legacy = getJson<Record<string, LegacyRecord>>(LEGACY + id, {});
  if (!legacy || Object.keys(legacy).length === 0) return recorded;

  const all = { ...recorded };
  for (const item of getWordbookItems(id)) {
    if (all[item.id]) continue;
    const old = legacy[normalizeLegacy(item.word)];
    if (!old || !(old.seenCount && old.seenCount > 0)) continue;
    const lastGrade: Grade | null =
      old.lastRating === "known" ? "good"
      : old.lastRating === "fuzzy" ? "hard"
      : old.lastRating === "unknown" ? "again" : null;
    all[item.id] = {
      itemId: item.id,
      seenCount: old.seenCount,
      againCount: old.unknownCount ?? 0,
      hardCount: old.fuzzyCount ?? 0,
      goodCount: old.knownCount ?? 0,
      easyCount: 0,
      lastGrade,
      lastSeenAt: old.lastSeenAt ?? null,
      legacySeen: true,
      // No FSRS card: the first new rating establishes a real schedule.
    };
  }
  return all;
}
export function saveProgress(id: string, progress: Record<string, StudyProgress>) {
  localStorage.setItem(PROGRESS + id, JSON.stringify(progress));
}

export function saveWordbook(meta: WordbookMeta, items: VocabularyItem[]) {
  if (listWordbooks().some(b => b.id === meta.id)) throw Error("词书编号重复，请重新导入");
  localStorage.setItem(ITEMS + meta.id, JSON.stringify(items));
  try {
    localStorage.setItem(REGISTRY, JSON.stringify([...listWordbooks(), meta]));
  } catch (error) {
    localStorage.removeItem(ITEMS + meta.id);
    throw error;
  }
}
export function updateWordbook(meta: WordbookMeta) {
  localStorage.setItem(REGISTRY, JSON.stringify(
    listWordbooks().map(book => book.id === meta.id ? meta : book),
  ));
}
export function deleteWordbook(id: string) {
  // Update registry before deleting data so an interrupted write does not lose a deck.
  localStorage.setItem(REGISTRY, JSON.stringify(listWordbooks().filter(b => b.id !== id)));
  localStorage.removeItem(ITEMS + id);
  localStorage.removeItem(PROGRESS + id);
  localStorage.removeItem(LEGACY + id);
}

export function exportBackup() {
  const backup: Backup = {
    app: "my-vocab-app",
    schema: 2,
    exportedAt: new Date().toISOString(),
    books: listWordbooks().map(meta => ({
      meta, items: getWordbookItems(meta.id),
      progress: getProgress(meta.id),
      legacyRecords: getJson(LEGACY + meta.id, {}),
    })),
  };
  return JSON.stringify(backup, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Restoring a duplicate deck generates new IDs AND keeps the original FSRS data. */
export function restoreBackup(raw: string): number {
  const data: unknown = JSON.parse(raw);
  if (!isRecord(data) || data.app !== "my-vocab-app" || data.schema !== 2 || !Array.isArray(data.books))
    throw Error("备份文件格式不正确，请使用记忆工坊导出的 JSON");
  if (data.books.length > 100) throw Error("单个备份文件最多支持 100 本词书");

  const existing = listWordbooks();
  const taken = new Set(existing.map(b => b.id));
  const staged: BackupBook[] = [];

  for (const entry of data.books) {
    if (!isRecord(entry) || !isRecord(entry.meta) || !Array.isArray(entry.items)
      || !isRecord(entry.progress) || !entry.meta.id || !entry.meta.name)
      throw Error("备份包含不完整的词书记录");

    const originalMeta = entry.meta as WordbookMeta;
    const originals = entry.items as VocabularyItem[];
    if (!originals.every(i => typeof i?.id === "string" && typeof i?.word === "string"
      && typeof i?.meaning === "string"))
      throw Error("备份中有损坏的词卡");

    const duplicate = taken.has(originalMeta.id);
    const newId = duplicate ? "restored-" + crypto.randomUUID() : originalMeta.id;
    taken.add(newId);
    const mapping = new Map<string, string>();
    const items = originals.map((item, i) => {
      const newItemId = duplicate ? newId + "-" + i : item.id;
      mapping.set(item.id, newItemId);
      return { ...item, id: newItemId, wordbookId: newId };
    });
    const progress: Record<string, StudyProgress> = {};
    for (const [key, value] of Object.entries(entry.progress)) {
      if (!isRecord(value)) continue;
      const mappedId = mapping.get(key);
      if (!mappedId) continue;
      const record = value as StudyProgress;
      progress[mappedId] = {
        ...record, itemId: mappedId,
        fsrs: record.fsrs ? { ...record.fsrs, cardId: mappedId } : undefined,
      };
    }
    staged.push({
      meta: { ...originalMeta, id: newId,
        name: duplicate ? originalMeta.name + "（恢复）" : originalMeta.name,
        wordCount: items.length },
      items, progress,
      legacyRecords: isRecord(entry.legacyRecords)
        ? entry.legacyRecords as Record<string, LegacyRecord> : {},
    });
  }

  const written: string[] = [];
  try {
    for (const book of staged) {
      for (const [key, value] of [
        [ITEMS + book.meta.id, book.items],
        [PROGRESS + book.meta.id, book.progress],
        [LEGACY + book.meta.id, book.legacyRecords],
      ] as const) {
        localStorage.setItem(key, JSON.stringify(value));
        written.push(key);
      }
    }
    localStorage.setItem(REGISTRY, JSON.stringify([...existing, ...staged.map(b => b.meta)]));
  } catch (error) {
    for (const key of written) localStorage.removeItem(key);
    throw error;
  }
  return staged.length;
}
