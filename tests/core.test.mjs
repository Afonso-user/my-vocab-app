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
