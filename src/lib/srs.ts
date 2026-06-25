// 从 Ponte lib/review.ts 移植
import type { ReviewRating } from "../types";

export function calculateNextReviewDate(
  rating: ReviewRating,
  familiarity: number,
  now = new Date()
): { nextDueAt: string; nextFamiliarity: number } {
  const next = new Date(now);
  if (rating === "unknown") {
    next.setHours(next.getHours() + 6);
    return { nextDueAt: next.toISOString(), nextFamiliarity: Math.max(0, familiarity - 1) };
  }
  if (rating === "fuzzy") {
    next.setDate(next.getDate() + Math.max(1, familiarity));
    return { nextDueAt: next.toISOString(), nextFamiliarity: familiarity + 1 };
  }
  next.setDate(next.getDate() + Math.max(3, familiarity * 2 + 1));
  return { nextDueAt: next.toISOString(), nextFamiliarity: familiarity + 2 };
}
