import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from "ts-fsrs";
import type { Grade, StudyProgress, VocabularyItem } from "../types";

const grades: Record<Grade, Rating> = {
  again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy,
};
const engines = new Map<number, ReturnType<typeof fsrs>>();
function scheduler(targetRetention: number) {
  const percent = Math.min(97, Math.max(75, Math.round(targetRetention * 100)));
  let engine = engines.get(percent);
  if (!engine) {
    engine = fsrs(generatorParameters({ request_retention: percent / 100, enable_fuzz: true }));
    engines.set(percent, engine);
  }
  return engine;
}
export function isDue(progress?: StudyProgress, now = Date.now()) {
  return !!progress?.fsrs && Date.parse(progress.fsrs.dueAt) <= now;
}
/** FSRS is the single authority for due dates. Exam drills never mutate schedules. */
export function schedule(
  old: StudyProgress | undefined, item: VocabularyItem, grade: Grade,
  retention = .90, now = new Date(),
): StudyProgress {
  const previous = old?.fsrs;
  const card = previous
    ? { ...previous, due: new Date(previous.dueAt),
        last_review: previous.lastReviewAt ? new Date(previous.lastReviewAt) : undefined } as unknown as Card
    : createEmptyCard(now);
  const next = scheduler(retention).next(card, now, grades[grade] as Parameters<ReturnType<typeof fsrs>["next"]>[2]).card;
  const p = old ?? { itemId: item.id, seenCount: 0, againCount: 0,
    hardCount: 0, goodCount: 0, easyCount: 0, lastGrade: null, lastSeenAt: null };
  return {
    ...p,
    seenCount: p.seenCount + 1,
    againCount: p.againCount + (grade === "again" ? 1 : 0),
    hardCount: p.hardCount + (grade === "hard" ? 1 : 0),
    goodCount: p.goodCount + (grade === "good" ? 1 : 0),
    easyCount: p.easyCount + (grade === "easy" ? 1 : 0),
    lastGrade: grade, lastSeenAt: now.toISOString(),
    fsrs: { ...next, cardId: item.id, dueAt: next.due.toISOString(),
      lastReviewAt: next.last_review?.toISOString() ?? null },
    history: [...(p.history ?? []).slice(-199), { at: now.toISOString(), grade,
      scheduledFor: next.due.toISOString() }],
  };
}
