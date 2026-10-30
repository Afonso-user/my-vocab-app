import type { StudyOrder, StudyQueueItem, VocabularyItem } from "../types";

/** Every shuffle is unbiased Fisher-Yates; inject a fixed RNG in tests. */
export function shuffleQueue<T>(source: readonly T[], random: () => number = Math.random): T[] {
  const result = [...source];
  for (let i = result.length - 1; i > 0; i--) {
    const draw = random();
    const j = Math.min(i, Math.max(0, Math.floor((Number.isFinite(draw) ? draw : 0) * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // "随机" must visibly differ from "顺序" whenever at least two cards are available.
  if (result.length > 1 && result.every((value, i) => value === source[i])) {
    [result[0], result[result.length - 1]] = [result[result.length - 1], result[0]];
  }
  return result;
}

/** Sequential means the original import/CSV row order, not alphabetical order. */
export function orderQueue(
  queue: readonly StudyQueueItem[], order: StudyOrder,
  originalItems: readonly VocabularyItem[], random: () => number = Math.random,
): StudyQueueItem[] {
  if (order === "random") return shuffleQueue(queue, random);
  const positions = new Map(originalItems.map((item, i) => [item.id, i]));
  return [...queue].sort((a, b) => {
    // Reinforcement replays occur after ordinary cards rather than jumping
    // in front of unseen cards with the same source word.
    const aExtra = a.kind === "reinforce" ? 1 : 0;
    const bExtra = b.kind === "reinforce" ? 1 : 0;
    return aExtra - bExtra ||
      (positions.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b.item.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Switch order without resetting the current face, selected confidence or progress. */
export function reorderRemaining(
  queue: readonly StudyQueueItem[], currentIndex: number,
  order: StudyOrder, originalItems: readonly VocabularyItem[],
  random: () => number = Math.random,
): StudyQueueItem[] {
  const next = Math.max(0, Math.min(queue.length, currentIndex + 1));
  return [...queue.slice(0, next), ...orderQueue(queue.slice(next), order, originalItems, random)];
}
