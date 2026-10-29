/** A self-contained, browser-only exam flashcard deck. */
export type Grade = "again" | "hard" | "good" | "easy";

export type VocabularyItem = {
  id: string;
  wordbookId: string;
  word: string;
  meaning: string;
  pronunciation?: string;
  partOfSpeech?: string;
  gender?: "masculine" | "feminine" | "common";
  plural?: string;
  example?: string;
  exampleZh?: string;
  collocations?: string[];
  synonyms?: string[];
  antonyms?: string[];
  variants?: string[];
  tags?: string[];
  notes?: string;
  mnemonic?: string;
  conjugation?: string;
  grammar?: string;
  translationEn?: string;
  source?: string;
  unit?: string;
  capleLevel?: string;
  extra?: Record<string, string>;
  // Kept for compatibility with earlier imported decks, not used by FSRS.
  dueAt?: string;
  familiarity?: number;
};

export type WordbookMeta = {
  id: string;
  name: string;
  createdAt: string;
  wordCount: number;
  defaultLevel: string;
  dailyNewLimit?: number;
  targetRetention?: number;
  examDate?: string;
  sourceFile?: string;
};

export type StoredFsrsCard = {
  cardId: string | number;
  dueAt: string;
  lastReviewAt: string | null;
  [key: string]: unknown;
};

export type ReviewLog = {
  at: string;
  grade: Grade;
  scheduledFor: string;
};

export type StudyProgress = {
  itemId: string;
  seenCount: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  lastGrade: Grade | null;
  lastSeenAt: string | null;
  legacySeen?: boolean;
  fsrs?: StoredFsrsCard;
  history?: ReviewLog[];
};

export type StudyMode = "today" | "new" | "cram";
export type StudyQueueItem = { item: VocabularyItem; kind: "new" | "due" | "cram" };
