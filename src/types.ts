// 从 Ponte lib/types.ts 精简移植
export type ReviewRating = "known" | "fuzzy" | "unknown";

export type VocabularyItem = {
  id: string;
  word: string;           // 葡语
  meaning: string;        // 中文释义
  partOfSpeech?: string;  // 词性
  example?: string;       // 例句（葡语）
  exampleZh?: string;     // 例句翻译
  collocations?: string[];
  synonyms?: string[];
  notes?: string;         // 用户备注
  gender?: "masculine" | "feminine" | "common";
  capleLevel?: string;    // CEFR 等级
  // SRS 字段
  dueAt: string;
  familiarity: number;
  wordbookId: string;
};

export type WordbookMeta = {
  id: string;
  name: string;
  createdAt: string;
  wordCount: number;
  defaultLevel: string;
};

export type WordStudyRecord = {
  lemma: string;
  wordbookId: string;
  grapeCount: number;
  reviewPriority: number;
  seenCount: number;
  knownCount: number;
  fuzzyCount: number;
  unknownCount: number;
  lastRating: ReviewRating | null;
  firstLearnedAt: string | null;
  lastSeenAt: string | null;
};

export type StudyQueueItem = {
  item: VocabularyItem;
  queueType: "new" | "review";
};
