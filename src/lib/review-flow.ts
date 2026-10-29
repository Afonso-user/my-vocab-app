import type { Grade, StudyProgress, VocabularyItem } from "../types";

/** The user's provisional confidence is not an FSRS rating until they have checked the answer. */
export function finalReviewGrade(selected: Grade, wasWrong: boolean): Grade {
  return wasWrong ? "again" : selected;
}

/** Exam-only judgments must never modify the FSRS scheduling card or official review counts. */
export function recordExamJudgment(
  old: StudyProgress | undefined, item: VocabularyItem, grade: Grade, at = new Date(),
): StudyProgress {
  const previous: StudyProgress = old ?? {
    itemId: item.id, seenCount: 0, againCount: 0, hardCount: 0,
    goodCount: 0, easyCount: 0, lastGrade: null, lastSeenAt: null,
  };
  return {
    ...previous,
    cramLastGrade: grade,
    cramAgainCount: (previous.cramAgainCount ?? 0) + (grade === "again" ? 1 : 0),
    cramLastAt: at.toISOString(),
  };
}
