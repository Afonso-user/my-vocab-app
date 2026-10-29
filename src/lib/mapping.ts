import type { VocabularyItem } from "../types";

export type FieldKey =
  | "word" | "meaning" | "pronunciation" | "partOfSpeech" | "gender"
  | "plural" | "example" | "exampleZh" | "collocations"
  | "synonyms" | "antonyms" | "variants" | "tags" | "notes"
  | "mnemonic" | "conjugation" | "grammar" | "translationEn"
  | "level" | "unit" | "source";

export const FIELD_LABELS: Record<FieldKey, string> = {
  word: "单词 / 术语", meaning: "中文释义 / 答案",
  pronunciation: "音标 / 发音", partOfSpeech: "词性", gender: "阴阳性",
  plural: "复数", example: "外语例句", exampleZh: "例句翻译",
  collocations: "固定搭配", synonyms: "同义词", antonyms: "反义词",
  variants: "变体 / 词形", tags: "标签", notes: "备注",
  mnemonic: "记忆提示", conjugation: "变位 / 变化", grammar: "语法说明",
  translationEn: "英文释义", level: "等级", unit: "章节 / 单元", source: "来源"
};
export const REQUIRED_FIELDS: FieldKey[] = ["word", "meaning"];
export const FIELD_GROUPS: { label: string; keys: FieldKey[] }[] = [
  {label: "必填", keys: ["word", "meaning"]},
  {label: "学习资料", keys: ["pronunciation", "partOfSpeech", "example", "exampleZh", "notes", "mnemonic"]},
  {label: "扩展信息", keys: ["gender", "plural", "collocations", "synonyms", "antonyms", "variants", "conjugation", "grammar", "translationEn"]},
  {label: "分类信息", keys: ["level", "unit", "tags", "source"]},
];

const ALIASES: Record<FieldKey, string[]> = {
  word: ["word", "term", "lemma", "palavra", "vocábulo", "vocabulário", "vocab", "vocabulary", "portuguese", "português", "portugues", "foreign term", "foreignword", "englishword", "foreignword", "单词", "词汇", "词语", "外语", "葡语", "葡语单词", "葡文", "葡文单词", "外语单词", "英语", "英语单词", "原词", "术语", "题目", "正面", "front", "词条"],
  meaning: ["meaning", "translation", "chinese", "significado", "definicao", "definição", "definition", "definitionzh", "answer", "back", "释义", "中文", "中文释义", "中文翻译", "汉语翻译", "翻译", "意思", "含义", "解释", "答案", "背面", "中文翻译"],
  pronunciation: ["pronunciation", "phonetic", "ipa", "发音", "音标", "读音"],
  partOfSpeech: ["pos", "partofspeech", "wordclass", "词性", "词类"],
  gender: ["gender", "grammaticalgender", "阴阳性", "名词性别"],
  plural: ["plural", "复数", "复数形式"],
  example: ["example", "sentence", "examplesentence", "exemplo", "frase", "fraseexemplo", "examplept", "葡语例句", "外语例句", "例句", "用例", "例句原文"],
  exampleZh: ["examplezh", "sentencezh", "traduçãodoexemplo", "traducaodoexemplo", "exampletranslation", "sentencechinese", "例句翻译", "例句中文", "中文例句", "例句释义"],
  collocations: ["collocation", "collocations", "expressão", "expressoes", "phrase", "phrases", "搭配", "固定搭配", "短语", "词组"],
  synonyms: ["synonym", "synonyms", "近义词", "同义词"],
  antonyms: ["antonym", "antonyms", "反义词"],
  variants: ["variants", "variation", "wordforms", "forms", "变体", "词形", "变化形式"],
  tags: ["tags", "tag", "标签", "分类"],
  notes: ["notes", "note", "remark", "comment", "备注", "笔记", "补充", "说明"],
  mnemonic: ["mnemonic", "memorytip", "记忆法", "记忆提示", "联想", "助记"],
  conjugation: ["conjugation", "conjugations", "verbforms", "变位", "动词变位"],
  grammar: ["grammar", "grammarnote", "语法", "语法说明"],
  translationEn: ["englishmeaning", "englishdefinition", "englishtranslation", "释义英文", "英文释义", "英语释义"],
  level: ["level", "cefr", "caple", "grade", "等级", "级别", "难度"],
  unit: ["unit", "chapter", "lesson", "section", "单元", "章节", "课次", "课文", "课时"],
  source: ["source", "origin", "出处", "来源", "教材"],
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[\s_\-./:：()（）【】[\]]/g, "");
}

/** Exact aliases first; do not let "例句翻译" occupy both example and meaning. */
export type MappingSuggestion = {
  mapping: Record<FieldKey, string | null>;
  confidence: Partial<Record<FieldKey, number>>;
  ambiguous: FieldKey[];
};

function scoreHeader(field: FieldKey, header: string): number {
  const h = normalize(header);
  if (!h) return 0;
  const aliases = ALIASES[field];
  const best = aliases.reduce((score, alias) => {
    const a = normalize(alias);
    if (a === h) return Math.max(score, 100);
    if (a.length >= 2 && h.startsWith(a)) return Math.max(score, 83 + Math.min(8, a.length));
    if (a.length >= 3 && h.endsWith(a)) return Math.max(score, 78);
    if (a.length >= 3 && h.includes(a)) return Math.max(score, 59);
    return score;
  }, 0);
  // These columns are easily confused by over-eager substring matching.
  if (field === "meaning" && /(例句|短语|固定搭配|同义|近义)/.test(header)) return 0;
  if (field === "word" && /(释义|例句|意思|翻译|定义|音标|解释)/.test(header)) return 0;
  if (field === "example" && /(翻译|中文|释义)/.test(header)) return 0;
  if (field === "level" && /(词性)/.test(header)) return 0;
  return best;
}

/** One-to-one candidate ranking; near-ties are surfaced instead of silently guessing. */
export function suggestColumns(headers: string[]): MappingSuggestion {
  const mapping = Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, null])) as Record<FieldKey, string | null>;
  const confidence: Partial<Record<FieldKey, number>> = {};
  const ambiguous: FieldKey[] = [];
  const candidates: { field: FieldKey; header: string; points: number }[] = [];
  for (const field of Object.keys(FIELD_LABELS) as FieldKey[])
    for (const header of headers) {
      const points = scoreHeader(field, header);
      if (points >= 55) candidates.push({ field, header, points });
    }
  // Exact labels outrank fuzzy ones; specific labels win over generic ones.
  candidates.sort((a, b) => b.points - a.points || b.header.length - a.header.length);
  const claimedFields = new Set<FieldKey>();
  const claimedColumns = new Set<string>();
  for (const { field, header, points } of candidates) {
    if (claimedFields.has(field) || claimedColumns.has(header)) continue;
    mapping[field] = header; confidence[field] = points;
    claimedFields.add(field); claimedColumns.add(header);
  }
  if (headers.length === 2) {
    if (!mapping.word && !claimedColumns.has(headers[0])) {
      mapping.word = headers[0]; confidence.word = 30;
    }
    if (!mapping.meaning && !claimedColumns.has(headers[1]) && headers[1] !== mapping.word) {
      mapping.meaning = headers[1]; confidence.meaning = 30;
    }
  }
  for (const field of REQUIRED_FIELDS) {
    if (mapping[field] && (confidence[field] ?? 0) < 55) ambiguous.push(field);
    if (!mapping[field]) ambiguous.push(field);
  }
  return { mapping, confidence, ambiguous };
}
export function autoMapColumns(headers: string[]): Record<FieldKey, string | null> {
  return suggestColumns(headers).mapping;
}

export type ImportError = { row: number; message: string };

function splitList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(/[,;，、\n]+/).map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseGender(raw: string): VocabularyItem["gender"] {
  const key = raw.trim().toLowerCase();
  if (["m", "masc", "masculine", "masculino", "阳", "阳性"].includes(key)) return "masculine";
  if (["f", "fem", "feminine", "feminino", "阴", "阴性"].includes(key)) return "feminine";
  if (["c", "common", "comum", "通性", "通"].includes(key)) return "common";
  return undefined;
}

export function buildItems(
  rows: Record<string, string>[],
  mapping: Record<FieldKey, string | null>,
  wordbookId: string,
  defaultLevel: string
): { items: VocabularyItem[]; errors: ImportError[] } {
  const items: VocabularyItem[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>();
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const get = (row: Record<string, string>, key: FieldKey) => (mapping[key] ? row[mapping[key]!] ?? "" : "").trim();
  rows.forEach((row, index) => {
    const word = get(row, "word");
    const meaning = get(row, "meaning");
    if (!word || !meaning) {
      errors.push({ row: index + 2, message: !word ? "词语为空" : "释义为空" });
      return;
    }
    // Keep different senses of the same word. Remove only exact duplicate front/back pairs.
    const identity = (word + "\u0000" + meaning).normalize("NFKC").toLocaleLowerCase();
    if (seen.has(identity)) {
      errors.push({ row: index + 2, message: "相同词语与释义重复" });
      return;
    }
    seen.add(identity);
    const extra = Object.fromEntries(Object.entries(row).filter(([h, v]) => !mapped.has(h) && v.trim()));
    items.push({
      id: wordbookId + "-" + index,
      wordbookId, word, meaning,
      pronunciation: get(row, "pronunciation") || undefined,
      partOfSpeech: get(row, "partOfSpeech") || undefined,
      gender: parseGender(get(row, "gender")),
      plural: get(row, "plural") || undefined,
      example: get(row, "example") || undefined,
      exampleZh: get(row, "exampleZh") || undefined,
      collocations: splitList(get(row, "collocations")),
      synonyms: splitList(get(row, "synonyms")),
      antonyms: splitList(get(row, "antonyms")),
      variants: splitList(get(row, "variants")),
      tags: splitList(get(row, "tags")),
      notes: get(row, "notes") || undefined,
      mnemonic: get(row, "mnemonic") || undefined,
      conjugation: get(row, "conjugation") || undefined,
      grammar: get(row, "grammar") || undefined,
      translationEn: get(row, "translationEn") || undefined,
      capleLevel: get(row, "level") || defaultLevel,
      unit: get(row, "unit") || undefined,
      source: get(row, "source") || undefined,
      extra: Object.keys(extra).length ? extra : undefined,
    });
  });
  return { items, errors };
}
