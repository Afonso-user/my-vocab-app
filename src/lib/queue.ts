import type { StudyProgress, StudyQueueItem, VocabularyItem } from "../types";

/** Fast deterministic per-session shortlist: overdue & repeatedly missed cards first.
 *  This is a supplementary exam drill, NOT a change to FSRS due dates. */
export function buildExamDrill(
  items: VocabularyItem[], records: Record<string, StudyProgress>,
  limit = 100, now = Date.now(), random = Math.random,
): StudyQueueItem[] {
  const annotated = items.map(item => {
    const p = records[item.id];
    const fsrs = p?.fsrs;
    const due = fsrs ? Date.parse(fsrs.dueAt) : NaN;
    const overdueDays = Number.isFinite(due) ? Math.max(0, (now - due) / 86400000) : 0;
    const stability = fsrs ? Number(fsrs.stability) : NaN;
    const difficult = p?.lastGrade === "again" ? 160 : p?.lastGrade === "hard" ? 75 : 0;
    const unread = !p?.seenCount ? 65 : 0;
    const weak = Number.isFinite(stability) ? 65 / (Math.max(.1, stability) + .6) : 0;
    const score = Math.min(overdueDays, 30) * 50 + difficult + unread + weak + random() * 10;
    return { item, score };
  });
  annotated.sort((a, b) => b.score - a.score);
  return annotated.slice(0, Math.max(0, Math.min(limit, items.length))).map(x => ({ item: x.item, kind: "cram" }));
}
