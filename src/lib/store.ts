// localStorage 词书存取
import type { VocabularyItem, WordbookMeta } from "../types";

const REGISTRY_KEY = "vocab-wordbooks";
const ITEMS_PREFIX = "vocab-items:";

export function listWordbooks(): WordbookMeta[] {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) || "[]") as WordbookMeta[];
  } catch {
    return [];
  }
}

export function getWordbook(id: string): WordbookMeta | null {
  return listWordbooks().find((w) => w.id === id) || null;
}

export function getWordbookItems(id: string): VocabularyItem[] {
  try {
    return JSON.parse(localStorage.getItem(ITEMS_PREFIX + id) || "[]") as VocabularyItem[];
  } catch {
    return [];
  }
}

export function saveWordbook(
  meta: WordbookMeta,
  items: VocabularyItem[]
): void {
  const books = listWordbooks().filter((w) => w.id !== meta.id);
  books.push(meta);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(books));
  localStorage.setItem(ITEMS_PREFIX + meta.id, JSON.stringify(items));
}

export function deleteWordbook(id: string): void {
  const books = listWordbooks().filter((w) => w.id !== id);
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(books));
  localStorage.removeItem(ITEMS_PREFIX + id);
  localStorage.removeItem("vocab-study:" + id);
}
