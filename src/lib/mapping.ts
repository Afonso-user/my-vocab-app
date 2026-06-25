// 列映射 + VocabularyItem 构建
import type { VocabularyItem } from "../types";

export type FieldKey =
  | "word"
  | "meaning"
  | "partOfSpeech"
  | "example"
  | "exampleZh"
  | "collocations"
  | "synonyms"
  | "notes"
  | "level"
  | "gender";

export const FIELD_LABELS: Record<FieldKey, string> = {
  word: "葡语单词",
  meaning: "中文释义",
  partOfSpeech: "词性",
  example: "例句（葡语）",
  exampleZh: "例句翻译",
  collocations: "搭配",
  synonyms: "近义词",
  notes: "备注",
  level: "等级",
  gender: "阴阳性",
};

export const REQUIRED_FIELDS: FieldKey[] = ["word", "meaning"];

// 自动映射规则
const AUTO_PATTERNS: Record<FieldKey, string[]> = {
  word: ["葡语", "单词", "葡语单词", "portuguese", "lemma", "原词", "词汇", "词", "palavra", "葡文"],
  meaning: ["中文", "释义", "meaning", "翻译", "意思", "中文释义", "中文翻译", "含义", "解释"],
  partOfSpeech: ["词性", "pos", "partofspeech", "词类"],
  example: ["例句", "example", "示例", "葡语例句"],
  exampleZh: ["例句翻译", "中文例句", "翻译例句", "examplzh", "例句中文"],
  collocations: ["搭配", "collocations", "固定搭配", "词组"],
  synonyms: ["近义词", "synonyms", "同义词"],
  notes: ["备注", "notes", "笔记", "说明", "note"],
  level: ["等级", "level", "cefr", "级别", "难度"],
  gender: ["阴阳性", "gender", "性", "词性阴阳"],
};

export function autoMapColumns(headers: string[]): Record<FieldKey, string | null> {
  const mapping: Record<FieldKey, string | null> = {} as any;
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void lowerHeaders;

  for (const field of Object.keys(AUTO_PATTERNS) as FieldKey[]) {
    mapping[field] = null;
    const patterns = AUTO_PATTERNS[field];
    for (const col of headers) {
      const lower = col.toLowerCase().trim();
      if (patterns.some((p) => lower === p || lower.includes(p))) {
        mapping[field] = col;
        break;
      }
    }
  }

  return mapping;
}

export type ImportError = { row: number; message: string };

export function buildItems(
  rows: Record<string, string>[],
  mapping: Record<FieldKey, string | null>,
  wordbookId: string,
  defaultLevel: string
): { items: VocabularyItem[]; errors: ImportError[] } {
  const items: VocabularyItem[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>();

  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const word = (mapping.word && row[mapping.word]?.trim()) || "";
    const meaning = (mapping.meaning && row[mapping.meaning]?.trim()) || "";

    if (!word) {
      errors.push({ row: i + 1, message: "缺少葡语单词" });
      continue;
    }
    if (!meaning) {
      errors.push({ row: i + 1, message: "缺少中文释义" });
      continue;
    }

    // 去重检查
    const norm = word.toLowerCase().trim();
    if (seen.has(norm)) {
      errors.push({ row: i + 1, message: `重复单词: "${word}"` });
      continue;
    }
    seen.add(norm);

    const collocations = getArrayField(row, mapping, "collocations");
    const synonyms = getArrayField(row, mapping, "synonyms");
    const genderRaw = (mapping.gender && row[mapping.gender]?.trim()) || "";

    const item: VocabularyItem = {
      id: `${wordbookId}-${i}`,
      word,
      meaning,
      partOfSpeech: (mapping.partOfSpeech && row[mapping.partOfSpeech]?.trim()) || undefined,
      example: (mapping.example && row[mapping.example]?.trim()) || undefined,
      exampleZh: (mapping.exampleZh && row[mapping.exampleZh]?.trim()) || undefined,
      collocations: collocations.length > 0 ? collocations : undefined,
      synonyms: synonyms.length > 0 ? synonyms : undefined,
      notes: (mapping.notes && row[mapping.notes]?.trim()) || undefined,
      gender: parseGender(genderRaw),
      capleLevel: ((mapping.level && row[mapping.level]?.trim()) || defaultLevel),
      dueAt: now,
      familiarity: 0,
      wordbookId,
    };

    items.push(item);
  }

  return { items, errors };
}

function getArrayField(
  row: Record<string, string>,
  mapping: Record<FieldKey, string | null>,
  key: FieldKey
): string[] {
  const value = (mapping[key] && row[mapping[key]]?.trim()) || "";
  if (!value) return [];
  // 用逗号、分号、顿号、中文逗号分词
  return value
    .split(/[,;，;、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseGender(raw: string): VocabularyItem["gender"] {
  const lower = raw.toLowerCase();
  if (lower.startsWith("m") || lower === "阳" || lower === "阳性" || lower === "男") return "masculine";
  if (lower.startsWith("f") || lower === "阴" || lower === "阴性" || lower === "女") return "feminine";
  if (lower.startsWith("c") || lower === "通") return "common";
  return undefined;
}
