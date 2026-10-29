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
  word: ["word", "term", "lemma", "palavra", "vocab", "vocabulary", "portuguese", "englishword", "foreignword", "单词", "词汇", "外语", "葡语", "葡语单词", "葡文", "葡文单词", "外语单词", "英语", "英语单词", "原词", "术语", "题目", "正面", "front", "词条"],
  meaning: ["meaning", "translation", "chinese", "definitionzh", "answer", "back", "释义", "中文", "中文释义", "翻译", "意思", "含义", "解释", "答案", "背面", "中文翻译"],
  pronunciation: ["pronunciation", "phonetic", "ipa", "发音", "音标", "读音"],
  partOfSpeech: ["pos", "partofspeech", "wordclass", "词性", "词类"],
  gender: ["gender", "grammaticalgender", "阴阳性", "名词性别"],
  plural: ["plural", "复数", "复数形式"],
  example: ["example", "sentence", "examplesentence", "examplept", "葡语例句", "外语例句", "例句", "用例", "例句原文"],
  exampleZh: ["examplezh", "sentencezh", "exampletranslation", "sentencechinese", "例句翻译", "例句中文", "中文例句", "例句释义"],
  collocations: ["collocation", "collocations", "phrase", "phrases", "搭配", "固定搭配", "短语", "词组"],
  synonyms: ["synonym", "synonyms", "近义词", "同义词"],
  antonyms: ["antonym", "antonyms", "反义词"],
  variants: ["variants", "variation", "wordforms", "forms", "变体", "词形", "变化形式"],
  tags: ["tags", "tag", "标签", "分类"],
  notes: ["notes", "note", "remark", "comment", "备注", "笔记", "补充", "说明"],
  mnemonic: ["mnemonic", "memorytip", "记忆法", "记忆提示", "联想", "助记"],
  conjugation: ["conjugation", "conjugations", "verbforms", "变位", "动词变位"],
  grammar: ["grammar", "grammarnote", "语法", "语法说明"],
  translationEn: ["englishmeaning", "englishdefinition", "englishtranslation", "释义英文", "英文释义"],
  level: ["level", "cefr", "caple", "grade", "等级", "级别", "难度"],
  unit: ["unit", "chapter", "lesson", "section", "单元", "章节", "课次", "课文", "课时"],
  source: ["source", "origin", "出处", "来源", "教材"],
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC").replace(/[\s_\-./:：()（）【】[\]]/g, "");
}

/** Exact aliases first; do not let "例句翻译" occupy both example and meaning. */
export function autoMapColumns(headers: string[]): Record<FieldKey, string | null> {
  const mapping = Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, null])) as Record<FieldKey, string | null>;
  const used = new Set<string>();
  // Specific fields must be matched before ambiguous base fields.
  const priority: FieldKey[] = [
    "exampleZh","translationEn","pronunciation","partOfSpeech","gender","plural",
    "collocations","synonyms","antonyms","variants","mnemonic","conjugation",
    "grammar","level","unit","tags","source","notes","example","word","meaning"
  ];
  for (const field of priority) {
    const hit = headers.find(h => !used.has(h) && ALIASES[field].some(a => normalize(a) === normalize(h)));
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  // Prefer precise labels but allow headers such as "单词（葡语）" / "例句翻译（中文）".
  for (const field of priority) {
    if (mapping[field]) continue;
    const aliases = ALIASES[field].filter(a => normalize(a).length >= 3);
    const hit = headers.find(h => {
      const key = normalize(h);
      return !used.has(h) && aliases.some(a => key.startsWith(normalize(a)) || key.endsWith(normalize(a)));
    });
    if (hit) { mapping[field] = hit; used.add(hit); }
  }
  // Common two-column files with unknown headers: let the user confirm the preview.
  if (!mapping.word && headers.length === 2) mapping.word = headers[0];
  if (!mapping.meaning && headers.length === 2 && headers[1] !== mapping.word) mapping.meaning = headers[1];
  return mapping;
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
