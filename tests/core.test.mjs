import test from "node:test";
import assert from "node:assert/strict";
import { parseDelimitedText } from "../src/lib/parse.ts";
import { autoMapColumns, buildItems } from "../src/lib/mapping.ts";
import { schedule, isDue } from "../src/lib/fsrs.ts";
import {
  exportBackup, getProgress, getWordbookItems, listWordbooks,
  restoreBackup, saveProgress, saveWordbook,
} from "../src/lib/store.ts";

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

function sample(id = "d1") {
  return {
    meta: { id, name: "期中词书", createdAt: "2026-10-29T00:00:00Z", wordCount: 1, defaultLevel: "未分类" },
    item: { id: id + "-0", wordbookId: id, word: "coração", meaning: "心脏" },
  };
}
test("CSV: quoted commas, embedded line breaks, escaped quotes and BOM", () => {
  const data = '\uFEFFword,meaning,example\r\n"olá","你好","Ele diz ""olá"",\nem português."\r\n"casa","房子",""';
  assert.deepEqual(parseDelimitedText(data), [
    ["word", "meaning", "example"],
    ["olá", "你好", 'Ele diz "olá",\nem português.'],
    ["casa", "房子", ""],
  ]);
});
test("CSV: semicolon and TSV separator detection", () => {
  assert.deepEqual(parseDelimitedText("word;meaning\ncasa;房子"), [["word", "meaning"], ["casa", "房子"]]);
  assert.deepEqual(parseDelimitedText("word\tmeaning\ncasa\t房子"), [["word", "meaning"], ["casa", "房子"]]);
  assert.throws(() => parseDelimitedText('word,meaning\n"unclosed,abc'), /引号未闭合/);
});
test("Mapping: example translation does not steal the meaning column", () => {
  const headers = ["葡语单词", "中文释义", "葡语例句", "例句翻译", "备注"];
  const mapped = autoMapColumns(headers);
  assert.equal(mapped.word, headers[0]);
  assert.equal(mapped.meaning, headers[1]);
  assert.equal(mapped.example, headers[2]);
  assert.equal(mapped.exampleZh, headers[3]);
  assert.equal(mapped.notes, headers[4]);
});
test("Import: multiple senses remain, exact duplicates skip, extras survive", () => {
  const headers = ["word", "meaning", "插图出处"];
  const mapped = autoMapColumns(headers);
  const rows = [
    { word: "casa", meaning: "房子", "插图出处": "教材" },
    { word: "casa", meaning: "家", "插图出处": "老师" },
    { word: "casa", meaning: "房子", "插图出处": "重录" },
  ];
  const { items, errors } = buildItems(rows, mapped, "unit1", "未分类");
  assert.equal(items.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(items[0].extra["插图出处"], "教材");
  assert.equal(items[1].meaning, "家");
});
test("FSRS: scheduled card survives JSON save and a second evaluation", () => {
  const { item } = sample();
  const one = schedule(undefined, item, "good", 0.9);
  assert.ok(Date.parse(one.fsrs.dueAt) >= Date.now());
  assert.equal(one.seenCount, 1);
  const restored = JSON.parse(JSON.stringify(one));
  const two = schedule(restored, item, "hard", 0.9);
  assert.equal(two.seenCount, 2);
  assert.equal(two.hardCount, 1);
  assert.equal(two.history.length, 2);
  assert.equal(isDue(two), Date.parse(two.fsrs.dueAt) <= Date.now());
});
test("Legacy migration shows real historical counts without fictitious FSRS scheduling", () => {
  localStorage.clear();
  const { meta, item } = sample();
  saveWordbook(meta, [item]);
  localStorage.setItem("vocab-study:" + meta.id, JSON.stringify({
    coracao: { lemma: "coração", seenCount: 7, knownCount: 4, fuzzyCount: 2, unknownCount: 1, lastRating: "known" },
  }));
  const progress = getProgress(meta.id);
  assert.equal(progress[item.id].seenCount, 7);
  assert.equal(progress[item.id].goodCount, 4);
  assert.equal(progress[item.id].legacySeen, true);
  assert.equal(progress[item.id].fsrs, undefined);
  const updated = schedule(progress[item.id], item, "good");
  saveProgress(meta.id, { [item.id]: updated });
  assert.ok(getProgress(meta.id)[item.id].fsrs);
});
test("Backup restore duplicates deck IDs but retains FSRS cards and histories", () => {
  localStorage.clear();
  const { meta, item } = sample();
  saveWordbook(meta, [item]);
  const progress = schedule(undefined, item, "good");
  saveProgress(meta.id, { [item.id]: progress });
  const n = restoreBackup(exportBackup());
  assert.equal(n, 1);
  const books = listWordbooks();
  assert.equal(books.length, 2);
  assert.notEqual(books[0].id, books[1].id);
  const restored = books[1];
  const restoredItem = getWordbookItems(restored.id)[0];
  const restoredProgress = getProgress(restored.id)[restoredItem.id];
  assert.equal(restoredProgress.seenCount, 1);
  assert.equal(restoredProgress.fsrs.cardId, restoredItem.id);
  assert.equal(restoredProgress.history.length, 1);
  assert.equal(getProgress(meta.id)[item.id].fsrs.cardId, item.id);
});

test("Pasted two-column vocabulary without headers keeps the first card", async () => {
  const { parsePastedText } = await import("../src/lib/parse.ts");
  const result = parsePastedText("casa\t房子\nolá\t你好");
  assert.deepEqual(result.headers, ["词语", "释义"]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.inferredHeaders, true);
  const mapped = autoMapColumns(result.headers);
  assert.equal(mapped.word, "词语");
  assert.equal(mapped.meaning, "释义");
  assert.equal(buildItems(result.rows, mapped, "paste", "未分类").items.length, 2);
});
test("Recognizes Portuguese headers without confusing sentence translation", async () => {
  const { suggestColumns } = await import("../src/lib/mapping.ts");
  const mapped = suggestColumns(["Português (BR)", "Significado", "Exemplo", "例句翻译", "英文释义"]);
  assert.equal(mapped.mapping.word, "Português (BR)");
  assert.equal(mapped.mapping.meaning, "Significado");
  assert.equal(mapped.mapping.exampleZh, "例句翻译");
  assert.equal(mapped.mapping.translationEn, "英文释义");
  assert.equal(mapped.ambiguous.length, 0);
});
test("Cram order prioritizes overdue and forgotten words without mutating records", async () => {
  const { buildExamDrill } = await import("../src/lib/queue.ts");
  const now = Date.now();
  const cards = [
    {id:"mature",wordbookId:"d",word:"mature",meaning:"熟"},
    {id:"overdue",wordbookId:"d",word:"overdue",meaning:"到期"},
    {id:"forgot",wordbookId:"d",word:"forgot",meaning:"忘记"},
  ];
  const records = {
    mature: {seenCount:9,lastGrade:"easy",fsrs:{dueAt:new Date(now+86400000*30).toISOString(),stability:90}},
    overdue: {seenCount:5,lastGrade:"good",fsrs:{dueAt:new Date(now-86400000*5).toISOString(),stability:4}},
    forgot: {seenCount:3,lastGrade:"again",fsrs:{dueAt:new Date(now+86400000).toISOString(),stability:1}},
  };
  const snapshot = JSON.stringify(records);
  const results = buildExamDrill(cards, records, 3, now, () => 0);
  assert.deepEqual(results.map(x=>x.item.id), ["overdue","forgot","mature"]);
  assert.equal(JSON.stringify(records), snapshot);
});


test("V4: provisional confidence is reversible and only confirmed ratings call FSRS", async () => {
  const { finalReviewGrade } = await import("../src/lib/review-flow.ts");
  assert.equal(finalReviewGrade("good", false), "good");
  assert.equal(finalReviewGrade("easy", true), "again");
  assert.equal(finalReviewGrade("hard", true), "again");
  assert.equal(finalReviewGrade("again", false), "again");
  const { item } = sample("v4");
  const before = {};
  const picked = "good";
  assert.deepEqual(before, {}, "Selecting confidence must not write any progress");
  const reviewed = schedule(undefined, item, finalReviewGrade(picked, true), 0.90);
  assert.equal(reviewed.againCount, 1);
  assert.equal(reviewed.goodCount, 0);
  assert.equal(reviewed.seenCount, 1);
  assert.equal(reviewed.history.length, 1);
});

test("V4: sprint mistakes persist but preserve real FSRS due dates and counters", async () => {
  const { recordExamJudgment } = await import("../src/lib/review-flow.ts");
  const { item } = sample("v4-cram");
  const scheduled = schedule(undefined, item, "good", .9);
  const saved = JSON.parse(JSON.stringify(scheduled));
  const judgment = recordExamJudgment(scheduled, item, "again", new Date("2026-10-29T12:00:00Z"));
  assert.equal(judgment.cramLastGrade, "again");
  assert.equal(judgment.cramAgainCount, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(judgment.fsrs)), saved.fsrs);
  assert.equal(judgment.seenCount, saved.seenCount);
  assert.equal(judgment.againCount, saved.againCount);
  assert.deepEqual(judgment.history, saved.history);
  const repeated = recordExamJudgment(judgment, item, "hard");
  assert.equal(repeated.cramAgainCount, 1);
  assert.equal(repeated.cramLastGrade, "hard");
});
