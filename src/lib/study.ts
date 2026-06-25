// 从 Ponte lib/study-records.ts 精简移植（去掉 level、Supabase）
import type { VocabularyItem, WordStudyRecord, StudyQueueItem, ReviewRating } from "../types";

const STORAGE_PREFIX = "vocab-study:";

// ── normalize ──

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ── load / save ──

export function loadRecords(wordbookId: string): Record<string, WordStudyRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + wordbookId);
    const parsed: Record<string, any> = raw ? JSON.parse(raw) : {};
    for (const key of Object.keys(parsed)) {
      const r = parsed[key];
      if (r.reviewPriority === undefined) r.reviewPriority = 50;
      if (r.grapeCount === undefined) r.grapeCount = 0;
    }
    return parsed as Record<string, WordStudyRecord>;
  } catch {
    return {};
  }
}

export function saveRecords(
  wordbookId: string,
  records: Record<string, WordStudyRecord>
): void {
  localStorage.setItem(STORAGE_PREFIX + wordbookId, JSON.stringify(records));
}

export function getWordKey(word: string): string {
  return normalizeKey(word);
}

// ── record CRUD ──

export function createRecord(
  word: string,
  wordbookId: string
): WordStudyRecord {
  return {
    lemma: word,
    wordbookId,
    grapeCount: 0,
    reviewPriority: 50,
    seenCount: 0,
    knownCount: 0,
    fuzzyCount: 0,
    unknownCount: 0,
    lastRating: null,
    firstLearnedAt: null,
    lastSeenAt: null,
  };
}

export function updateRecord(
  record: WordStudyRecord,
  rating: ReviewRating
): WordStudyRecord {
  let grapeCount = record.grapeCount;
  let reviewPriority = record.reviewPriority;

  if (rating === "known") {
    grapeCount += 3;
    reviewPriority = Math.max(0, reviewPriority - 12);
  } else if (rating === "fuzzy") {
    grapeCount += 2;
    reviewPriority = Math.min(100, reviewPriority + 8);
  } else {
    grapeCount += 1;
    reviewPriority = Math.min(100, reviewPriority + 20);
  }

  return {
    ...record,
    grapeCount,
    reviewPriority,
    seenCount: record.seenCount + 1,
    knownCount: record.knownCount + (rating === "known" ? 1 : 0),
    fuzzyCount: record.fuzzyCount + (rating === "fuzzy" ? 1 : 0),
    unknownCount: record.unknownCount + (rating === "unknown" ? 1 : 0),
    lastRating: rating,
    firstLearnedAt: record.firstLearnedAt ?? new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

export function getGrapeFeedback(rating: ReviewRating): { text: string; icon: string } {
  if (rating === "known") return { text: "太熟啦，收获", icon: "🍇🍇🍇" };
  if (rating === "fuzzy") return { text: "再酿一酿，收获", icon: "🍇🍇" };
  return { text: "先收下一颗，等会儿再见", icon: "🍇" };
}

// ── queue building ──

type ReviewBucket = "high" | "mid" | "low";

function getBucket(record: WordStudyRecord): ReviewBucket {
  if (record.reviewPriority >= 70) return "high";
  if (record.reviewPriority >= 35) return "mid";
  return "low";
}

function getLearnedKeys(records: Record<string, WordStudyRecord>): Set<string> {
  const keys = new Set<string>();
  for (const [key, record] of Object.entries(records)) {
    if (record.firstLearnedAt !== null || record.seenCount > 0) keys.add(key);
  }
  return keys;
}

function highCount(records: Record<string, WordStudyRecord>): number {
  let count = 0;
  for (const record of Object.values(records)) {
    if (getBucket(record) === "high") count++;
  }
  return count;
}

function reviewInsertCount(records: Record<string, WordStudyRecord>): number {
  if (Object.keys(records).length === 0) return 0;
  const hc = highCount(records);
  if (hc >= 20) return 10;
  if (hc >= 10) return 8;
  return 5;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickReviewWords(params: {
  allItems: VocabularyItem[];
  records: Record<string, WordStudyRecord>;
  count: number;
  excludeKeys?: Set<string>;
}): VocabularyItem[] {
  const { allItems, records, count, excludeKeys = new Set() } = params;
  if (count <= 0) return [];

  const learned = getLearnedKeys(records);
  const itemMap = new Map<string, VocabularyItem>();
  for (const item of allItems) {
    const key = getWordKey(item.word);
    if (!excludeKeys.has(key) && learned.has(key)) itemMap.set(key, item);
  }

  const high: VocabularyItem[] = [];
  const mid: VocabularyItem[] = [];
  const low: VocabularyItem[] = [];

  itemMap.forEach((item, key) => {
    const record = records[key];
    if (!record) return;
    const bucket = getBucket(record);
    if (bucket === "high") high.push(item);
    else if (bucket === "mid") mid.push(item);
    else low.push(item);
  });

  let highTarget = Math.round(count * 0.6);
  let midTarget = Math.round(count * 0.25);
  let lowTarget = count - highTarget - midTarget;

  if (count >= 5 && low.length > 0 && lowTarget < 1) {
    lowTarget = 1;
    highTarget = Math.max(0, Math.round(((count - lowTarget) * 0.6) / 0.85));
    midTarget = count - highTarget - lowTarget;
  }

  const picked = [
    ...shuffle(high).slice(0, highTarget),
    ...shuffle(mid).slice(0, midTarget),
    ...shuffle(low).slice(0, lowTarget),
  ];

  if (picked.length < count) {
    const remaining = [...high, ...mid, ...low].filter((i) => !picked.includes(i));
    picked.push(...shuffle(remaining).slice(0, count - picked.length));
  }

  return shuffle(picked);
}

export function buildLearningQueue(params: {
  newWords: VocabularyItem[];
  allItems: VocabularyItem[];
  records: Record<string, WordStudyRecord>;
}): StudyQueueItem[] {
  const { newWords, allItems, records } = params;
  const excludeKeys = new Set(newWords.map((w) => getWordKey(w.word)));
  const revCount = reviewInsertCount(records);
  const reviewWords =
    revCount > 0
      ? pickReviewWords({ allItems, records, count: revCount, excludeKeys })
      : [];

  const queue: StudyQueueItem[] = [];
  let ni = 0;
  let ri = 0;

  while (ni < newWords.length || ri < reviewWords.length) {
    const take = Math.min(2 + Math.floor(Math.random() * 4), newWords.length - ni);
    for (let i = 0; i < take; i++) {
      if (ni < newWords.length) queue.push({ item: newWords[ni++], queueType: "new" });
    }
    if (ri < reviewWords.length) queue.push({ item: reviewWords[ri++], queueType: "review" });
  }

  return queue;
}

export function buildRollingReviewQueue(params: {
  allItems: VocabularyItem[];
  records: Record<string, WordStudyRecord>;
  count?: number;
}): StudyQueueItem[] {
  const { allItems, records, count = 10 } = params;
  const learned = getLearnedKeys(records);
  if (learned.size === 0) return [];
  return pickReviewWords({ allItems, records, count }).map((item) => ({
    item,
    queueType: "review" as const,
  }));
}
