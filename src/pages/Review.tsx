import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Shuffle } from "lucide-react";
import type { StudyQueueItem, WordStudyRecord, ReviewRating } from "../types";
import { getWordbook, getWordbookItems } from "../lib/store";
import {
  loadRecords,
  saveRecords,
  createRecord,
  updateRecord,
  getGrapeFeedback,
  buildLearningQueue,
  buildRollingReviewQueue,
  getWordKey,
} from "../lib/study";

type DeckMode = "select" | "learning" | "rolling";

export default function Review() {
  const { wordbookId } = useParams<{ wordbookId: string }>();
  const book = getWordbook(wordbookId ?? "");
  const allItems = useMemo(() => getWordbookItems(wordbookId ?? ""), [wordbookId]);

  const [mode, setMode] = useState<DeckMode>("select");
  const [queue, setQueue] = useState<StudyQueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [selectedRating, setSelectedRating] = useState<ReviewRating | null>(null);
  const [grapeFeedback, setGrapeFeedback] = useState<{ text: string; icon: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [records, setRecords] = useState<Record<string, WordStudyRecord>>({});
  const [roundStats, setRoundStats] = useState<Record<ReviewRating, number>>({ known: 0, fuzzy: 0, unknown: 0 });

  const recordsRef = useRef(records);
  recordsRef.current = records;

  const load = useCallback(() => {
    if (!wordbookId) return;
    setRecords(loadRecords(wordbookId));
  }, [wordbookId]);

  useEffect(() => { load(); }, [load]);

  // 当前项
  const current = queue[index] ?? null;
  const isNew = current?.queueType === "new";

  // 开始学习
  const handleStartLearning = () => {
    const newWords = shuffle(allItems);
    const q = buildLearningQueue({ newWords, allItems, records: recordsRef.current });
    if (q.length === 0) { alert("暂无可学词汇"); return; }
    setQueue(q);
    setIndex(0);
    setMode("learning");
    setShowAnswer(false);
    setSelectedRating(null);
    setGrapeFeedback(null);
    setRoundStats({ known: 0, fuzzy: 0, unknown: 0 });
  };

  // 滚动复习
  const handleStartRolling = () => {
    const q = buildRollingReviewQueue({ allItems, records: recordsRef.current });
    if (q.length === 0) { alert("还没有学过的词"); return; }
    setQueue(q);
    setIndex(0);
    setMode("rolling");
    setShowAnswer(false);
    setSelectedRating(null);
    setGrapeFeedback(null);
    setRoundStats({ known: 0, fuzzy: 0, unknown: 0 });
  };

  // 评分
  const handleRate = (rating: ReviewRating) => {
    if (!current) return;
    const key = getWordKey(current.item.word);
    let record = recordsRef.current[key];
    if (!record) record = createRecord(current.item.word, wordbookId ?? "");
    const updated = updateRecord(record, rating);
    const updatedRecords = { ...recordsRef.current, [key]: updated };
    recordsRef.current = updatedRecords;
    setRecords(updatedRecords);
    saveRecords(wordbookId ?? "", updatedRecords);

    setGrapeFeedback(getGrapeFeedback(rating));
    setSelectedRating(rating);
    setShowAnswer(true);
    setRoundStats((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));
  };

  // 下一个
  const handleNext = () => {
    setSelectedRating(null);
    setGrapeFeedback(null);
    setShowAnswer(false);
    if (index + 1 >= queue.length) { setMode("select"); return; }
    setIndex((v) => v + 1);
  };

  // 乱序
  const handleShuffle = () => {
    const remaining = queue.slice(index);
    const shuffled = shuffle(remaining);
    setQueue([...queue.slice(0, index), ...shuffled]);
    setShowAnswer(false);
    setSelectedRating(null);
    setGrapeFeedback(null);
  };

  // ── 选择模式 ──
  if (mode === "select") {
    if (!book || allItems.length === 0) {
      return (
        <div className="page review-page">
          <div className="empty">
            <p>词书不存在或为空</p>
            <Link to="/" className="btn btn-primary">返回</Link>
          </div>
        </div>
      );
    }

    const learnedCount = Object.values(records).filter(
      (r: WordStudyRecord) => r.firstLearnedAt !== null || r.seenCount > 0
    ).length;

    return (
      <div className="page review-page">
        <header className="page-header">
          <Link to="/" className="back-link"><ArrowLeft size={18} /> 返回</Link>
          <h1>{book.name}</h1>
          <p className="sub">{book.wordCount} 词 · 已学 {learnedCount} · {book.defaultLevel}</p>
        </header>

        <div className="mode-cards">
          <div className="mode-card">
            <h3>📖 学习新词</h3>
            <p>新词 + 旧词回访交替进行</p>
            <p className="hint">每天学一点，🍇 慢慢累积</p>
            <button className="btn btn-primary full" onClick={handleStartLearning}>
              开始学习
            </button>
          </div>
          <div className="mode-card">
            <h3>🔄 滚动复习</h3>
            <p>回顾已学过的词汇</p>
            <p className="hint">高优先级旧词优先出现</p>
            <button
              className="btn btn-secondary full"
              onClick={handleStartRolling}
              disabled={learnedCount === 0}
            >
              {learnedCount === 0 ? "暂无已学词" : "开始复习"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 完成状态 ──
  if (!current) {
    return (
      <div className="page review-page">
        <div className="result-card">
          <h2>{mode === "learning" ? "今日任务完成！" : "复习完成！"}</h2>
          <div className="stats">
            <p>认识 {roundStats.known} · 模糊 {roundStats.fuzzy} · 陌生 {roundStats.unknown}</p>
            <p className="grape-total">
              🍇 +{roundStats.known * 3 + roundStats.fuzzy * 2 + roundStats.unknown} 葡萄
            </p>
          </div>
          <div className="step-actions">
            <button className="btn btn-ghost" onClick={() => setMode("select")}>返回</button>
            <button className="btn btn-primary" onClick={mode === "learning" ? handleStartRolling : handleStartLearning}>
              {mode === "learning" ? "滚动复习" : "继续学习"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 复习卡片 ──
  return (
    <div className="page review-page">
      {/* 顶部状态栏 */}
      <div className="review-top">
        <button className="btn-icon" onClick={() => setMode("select")} title="返回">
          <ArrowLeft size={18} />
        </button>
        <span className="progress-text">{index + 1} / {queue.length}</span>
        <span className={`tag ${isNew ? "tag-new" : "tag-review"}`}>
          {isNew ? "新词" : "回访"}
        </span>
        <button className="btn-icon" onClick={handleShuffle} title="乱序">
          <Shuffle size={16} />
        </button>
      </div>

      {/* 卡片 */}
      <div className="review-card">
        <div className="card-word-wrap">
          <span className="card-word" lang="pt-BR">
            {current.item.word}
          </span>
        </div>

        <p className="card-hint">{selectedRating ? "" : "看词想义，然后评分"}</p>

        {/* 显示答案 */}
        {showAnswer && (
          <div className="card-answer">
            <div className="card-meaning">{current.item.meaning}</div>

            {current.item.partOfSpeech && (
              <p className="card-pos">{current.item.partOfSpeech}{current.item.gender ? ` · ${current.item.gender === "masculine" ? "阳" : current.item.gender === "feminine" ? "阴" : "通"}` : ""}</p>
            )}

            {current.item.example && (
              <div className="card-example">
                <p lang="pt-BR">{current.item.example}</p>
                {current.item.exampleZh && <p className="card-example-zh">{current.item.exampleZh}</p>}
              </div>
            )}

            {current.item.notes && (
              <p className="card-notes">💡 {current.item.notes}</p>
            )}

            {grapeFeedback && (
              <div className="grape-feedback">
                {grapeFeedback.text} {grapeFeedback.icon}
              </div>
            )}

            <button className="btn btn-primary full" onClick={handleNext}>
              {index + 1 >= queue.length ? "完成" : "下一个"}
            </button>
          </div>
        )}

        {/* 评分按钮（未翻面时） */}
        {!showAnswer && (
          <div className="rating-buttons">
            <button className="btn-rate unknown" onClick={() => handleRate("unknown")}>
              陌生
            </button>
            <button className="btn-rate fuzzy" onClick={() => handleRate("fuzzy")}>
              模糊
            </button>
            <button className="btn-rate known" onClick={() => handleRate("known")}>
              认识
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 工具函数
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
