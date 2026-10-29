import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from "ts-fsrs";
import type { Grade, StudyProgress, VocabularyItem } from "../types";
const grades: Record<Grade, Rating>={again:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy};
export function isDue(p?:StudyProgress){return !!p?.fsrs && new Date(p.fsrs.dueAt).getTime()<=Date.now()}
export function schedule(old:StudyProgress|undefined,item:VocabularyItem,grade:Grade,retention=0.9):StudyProgress{
 const now=new Date(), engine=fsrs(generatorParameters({request_retention:Math.max(.75,Math.min(.97,retention)),enable_fuzz:false}));
 const card=old?.fsrs?{...old.fsrs,due:new Date(old.fsrs.dueAt),last_review:old.fsrs.lastReviewAt?new Date(old.fsrs.lastReviewAt):undefined} as unknown as Card:createEmptyCard(now);
 const next=engine.next(card,now,grades[grade] as Parameters<typeof engine.next>[2]).card;
 const p=old??{itemId:item.id,seenCount:0,againCount:0,hardCount:0,goodCount:0,easyCount:0,lastGrade:null,lastSeenAt:null};
 return {...p,seenCount:p.seenCount+1,againCount:p.againCount+(grade==="again"?1:0),hardCount:p.hardCount+(grade==="hard"?1:0),goodCount:p.goodCount+(grade==="good"?1:0),easyCount:p.easyCount+(grade==="easy"?1:0),lastGrade:grade,lastSeenAt:now.toISOString(),fsrs:{...next,cardId:item.id,dueAt:next.due.toISOString(),lastReviewAt:next.last_review?.toISOString()??null},history:[...(p.history??[]).slice(-199),{at:now.toISOString(),grade,scheduledFor:next.due.toISOString()}]};
}
