import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, RotateCcw, Settings2, Undo2, X } from "lucide-react";
import type { Grade, StudyMode, StudyProgress, StudyQueueItem, VocabularyItem } from "../types";
import { getProgress, getWordbook, getWordbookItems, saveProgress, updateWordbook } from "../lib/store";
import { isDue, schedule } from "../lib/fsrs";
import { buildExamDrill } from "../lib/queue";

type UndoEntry = {
  itemId: string;
  previous?: StudyProgress;
  queue: StudyQueueItem[];
  position: number;
  count: number;
};
const RATING: { id: Grade; title: string; meaning: string; key: string }[] = [
  { id: "again", title: "重来", meaning: "忘了", key: "1" },
  { id: "hard", title: "困难", meaning: "想起但吃力", key: "2" },
  { id: "good", title: "记得", meaning: "正常想起", key: "3" },
  { id: "easy", title: "简单", meaning: "一眼就会", key: "4" },
];
const MODES: { value: StudyMode; label: string }[] = [
  { value: "today", label: "今日" },
  { value: "new", label: "新词" },
  { value: "cram", label: "突击" },
];

function makeQueue(mode: StudyMode, items: VocabularyItem[],
  records: Record<string, StudyProgress>, newLimit: number): StudyQueueItem[] {
  if (mode === "cram") return buildExamDrill(items, records, 120);
  const due: VocabularyItem[] = [];
  const fresh: VocabularyItem[] = [];
  const now = Date.now();
  for (const item of items) {
    const record = records[item.id];
    if (!record?.fsrs) fresh.push(item);
    else if (isDue(record, now)) due.push(item);
  }
  due.sort((a, b) =>
    Date.parse(records[a.id].fsrs!.dueAt) - Date.parse(records[b.id].fsrs!.dueAt));
  const limit = Math.max(1, Math.min(200, newLimit));
  if (mode === "new") return fresh.slice(0, limit).map(item => ({ item, kind: "new" }));
  return [
    ...due.slice(0, 60).map(item => ({ item, kind: "due" as const })),
    ...fresh.slice(0, limit).map(item => ({ item, kind: "new" as const })),
  ];
}

function emptyRecord(item: VocabularyItem): StudyProgress {
  return {
    itemId: item.id, seenCount: 0, againCount: 0, hardCount: 0,
    goodCount: 0, easyCount: 0, lastGrade: null, lastSeenAt: null,
  };
}
function drillRating(old: StudyProgress | undefined, item: VocabularyItem, grade: Grade): StudyProgress {
  const progress = old ?? emptyRecord(item);
  return {
    ...progress,
    cramLastGrade: grade,
    cramAgainCount: (progress.cramAgainCount ?? 0) + (grade === "again" ? 1 : 0),
    cramLastAt: new Date().toISOString(),
    // Intentionally preserve FSRS reviewCount, dates, difficulty and stability.
  };
}
function stringify(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(" · ") : value || "";
}
function saveError(error: unknown): string {
  return error instanceof Error ? error.message : "保存失败，请检查浏览器本地存储";
}
function deadline(date?: string): string {
  if (!date) return "";
  const at = new Date(date + "T23:59:59").getTime();
  const days = Math.ceil((at - Date.now()) / 86400000);
  return Number.isFinite(days) ? days > 0 ? "考前 " + days + " 天" : "考试日" : "";
}

export default function Review() {
  const { wordbookId = "" } = useParams();
  const book = getWordbook(wordbookId);
  const items = useMemo(() => getWordbookItems(wordbookId), [wordbookId]);
  const [progress, setProgress] = useState<Record<string, StudyProgress>>(
    () => getProgress(wordbookId),
  );
  const [limit, setLimit] = useState(book?.dailyNewLimit ?? 20);
  const [retention, setRetention] = useState(book?.targetRetention ?? 0.9);
  const [exam, setExam] = useState(book?.examDate ?? "");
  const [mode, setMode] = useState<StudyMode>("today");
  const [queue, setQueue] = useState<StudyQueueItem[]>(() =>
    makeQueue("today", items, getProgress(wordbookId), book?.dailyNewLimit ?? 20),
  );
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const busy = useRef(false);
  const current = queue[index];
  const word = current?.item;
  const remaining = Math.max(0, queue.length - index);
  const isFinished = !current;

  useEffect(() => {
    document.documentElement.classList.add("rapid-studying");
    return () => document.documentElement.classList.remove("rapid-studying");
  }, []);
  useEffect(() => { busy.current = false; }, [index]);

  function selectMode(next: StudyMode) {
    setMode(next);
    setQueue(makeQueue(next, items, progress, limit));
    setIndex(0);
    setCompleted(0);
    setUndo(null);
    setShowSettings(false);
    setMessage("");
    busy.current = false;
  }
  function rate(grade: Grade) {
    if (busy.current || !current || !word || showSettings) return;
    busy.current = true;
    try {
      const before = progress[word.id];
      const next = mode === "cram" || current.kind === "reinforce"
        ? drillRating(before, word, grade)
        : schedule(before, word, grade, retention);
      const saved = { ...progress, [word.id]: next };
      // Synchronous local write before moving to the next card.
      saveProgress(wordbookId, saved);
      setUndo({ itemId: word.id, previous: before, queue, position: index, count: completed });
      setProgress(saved);
      if (grade === "again" && mode !== "cram" && current.kind !== "reinforce"
        && !queue.some(entry => entry.item.id === word.id && entry.kind === "reinforce")) {
        const replacement = [...queue];
        replacement.splice(Math.min(index + 4, replacement.length), 0, { item: word, kind: "reinforce" });
        setQueue(replacement);
      }
      setIndex(value => value + 1);
      setCompleted(value => value + 1);
      setMessage("");
    } catch (error) {
      busy.current = false;
      setMessage(saveError(error));
    }
  }
  function undoLast() {
    if (!undo || busy.current) return;
    try {
      const restored = { ...progress };
      if (undo.previous) restored[undo.itemId] = undo.previous;
      else delete restored[undo.itemId];
      saveProgress(wordbookId, restored);
      setProgress(restored);
      setQueue(undo.queue);
      setIndex(undo.position);
      setCompleted(undo.count);
      setUndo(null);
      setMessage("");
      busy.current = false;
    } catch (error) { setMessage(saveError(error)); }
  }
  function saveSettings() {
    if (!book) return;
    try {
      updateWordbook({
        ...book, dailyNewLimit: limit, targetRetention: retention,
        examDate: exam || undefined,
      });
      setShowSettings(false);
      setMessage("设置已保存，可选择模式刷新本轮词卡");
    } catch (error) { setMessage(saveError(error)); }
  }
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat
        || target?.closest("button, a, input, textarea, select, [contenteditable=true]")) return;
      if (event.key.toLowerCase() === "z" || event.key === "Backspace") {
        event.preventDefault(); undoLast(); return;
      }
      if (showSettings || !current) return;
      const num = /^[1-4]$/.test(event.key) ? Number(event.key) - 1 : event.key === " " ? 2 : -1;
      if (num >= 0) { event.preventDefault(); rate(RATING[num].id); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const details = useMemo(() => {
    if (!word) return [];
    const fields: [string, string | string[] | undefined][] = [
      ["例句", word.example],
      ["例句译文", word.exampleZh],
      ["搭配", word.collocations],
      ["同义词", word.synonyms],
      ["反义词", word.antonyms],
      ["词形", word.variants],
      ["语法", word.grammar],
      ["动词变位", word.conjugation],
      ["记忆提示", word.mnemonic],
      ["备注", word.notes],
      ["英文", word.translationEn],
      ["复数", word.plural],
      ["标签", word.tags],
      ["来源", word.source],
      ...Object.entries(word.extra ?? {}),
    ];
    return fields.map(([label, value]) => ({ label, text: stringify(value) }))
      .filter(entry => entry.text.length > 0);
  }, [word]);

  if (!book) return <div className="rapid-missing"><Link to="/">返回词书</Link><p>该词书不存在。</p></div>;

  return <div className="rapid-study" data-mode={mode}>
    <header className="rapid-header">
      <Link className="rapid-return" to="/" aria-label="返回我的词书"><ArrowLeft size={18}/></Link>
      <div className="rapid-book" title={book.name}>{book.name}</div>
      <nav className="rapid-modes" aria-label="学习模式">
        {MODES.map(entry => <button key={entry.value}
          className={mode === entry.value ? "active" : ""}
          onClick={() => selectMode(entry.value)}
          aria-pressed={mode === entry.value}>{entry.label}</button>)}
      </nav>
      <button className="rapid-small-btn rapid-undo" onClick={undoLast} disabled={!undo} title="撤销上一次评分"
        aria-label="撤销上次评分"><Undo2 size={17}/></button>
      <button className="rapid-small-btn" onClick={() => setShowSettings(v => !v)}
        title="学习设置" aria-label="学习设置"><Settings2 size={17}/></button>
    </header>

    <div className="rapid-progress">
      <div className="rapid-progress-copy">
        <span>{mode === "today" ? "今日任务" : mode === "new" ? "新词速记" : "考前突击"}</span>
        <span><strong>{Math.min(index + 1, queue.length)}</strong> / {queue.length}
          {remaining > 0 && <em> · 剩 {remaining} 张</em>}</span>
      </div>
      <div className="rapid-progress-track"><span style={{
        width: (queue.length ? Math.min(100, index / queue.length * 100) : 100) + "%",
      }}/></div>
    </div>

    {isFinished
      ? <main className="rapid-done">
        <div className="rapid-done-mark"><Check size={34}/></div>
        <p className="rapid-eyebrow">SESSION COMPLETE</p>
        <h1>{completed ? "这一轮，刷完了。" : mode === "today" ? "今日已清空。" : "暂无可学词卡"}</h1>
        <p>已处理 {completed} 张 · {mode === "cram" ? "正式 FSRS 日程保持不变" : "评分已经保存在本地"}</p>
        <div className="rapid-done-actions">
          <button onClick={() => selectMode("cram")}>继续突击</button>
          <button onClick={() => selectMode("today")}>刷新今日任务</button>
        </div>
      </main>
      : <main className="rapid-card" aria-label="当前词卡">
        <div className="rapid-card-meta">
          <span>{current.kind === "due" ? "到期复习" :
            current.kind === "new" ? "首次学习" :
            current.kind === "reinforce" ? "薄弱补记" : "弱项突击"}</span>
          <span>{word?.unit ?? word?.capleLevel ?? deadline(exam) ?? ""}</span>
        </div>
        <div className="rapid-word-area">
          <h1 lang="pt" className={word!.word.length > 40 ? "rapid-long" : ""}>{word?.word}</h1>
          <div className="rapid-word-meta">
            {word?.partOfSpeech && <span>{word.partOfSpeech}</span>}
            {word?.gender && <span>{word.gender === "masculine" ? "阳性" :
              word.gender === "feminine" ? "阴性" : "通性"}</span>}
            {word?.pronunciation && <span className="rapid-phonetic">{word.pronunciation}</span>}
          </div>
        </div>
        <div className="rapid-meaning-area">
          <span className="rapid-label">释义 / ANSWER</span>
          <h2 className={word!.meaning.length > 80 ? "rapid-long-answer" : ""}>{word?.meaning}</h2>
        </div>
        {details.length > 0 && <section className="rapid-facts" aria-label="补充资料">
          {details.map(entry => <div className="rapid-fact" key={entry.label}>
            <span>{entry.label}</span><p title={entry.text}>{entry.text}</p>
          </div>)}
        </section>}
        {details.length === 0 && <div className="rapid-space-note">看词与释义，直接判断熟悉程度</div>}
      </main>}

    {showSettings && <section className="rapid-settings" aria-label="学习设置">
      <div className="rapid-settings-heading"><b>快速设置</b>
        <button onClick={() => setShowSettings(false)} aria-label="关闭设置"><X size={17}/></button></div>
      <label>每轮新词 <input type="number" min="1" max="200" value={limit}
        onChange={e => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}/></label>
      <label>目标记忆率 <select value={retention} onChange={e => setRetention(Number(e.target.value))}>
        <option value={0.85}>85%</option><option value={0.9}>90%</option>
        <option value={0.95}>95%</option></select></label>
      <label>考试日期 <input type="date" value={exam}
        onChange={e => setExam(e.target.value)}/></label>
      <button className="rapid-settings-save" onClick={saveSettings}>保存设置</button>
    </section>}

    <footer className="rapid-footer">
      <div className="rapid-footer-hint">
        <span>{mode === "cram" ? "突击评分只记录薄弱项，不改变 FSRS 到期日" :
          "看完词义立即选，评分后自动进入下一张"}</span>
        <span className="rapid-shortcuts">键盘 1–4 · 空格记得 · Z 撤销</span>
      </div>
      <div className="rapid-ratings" role="group" aria-label="一键评分并自动下一张">
        {RATING.map(entry => <button key={entry.id}
          className={"rapid-grade rapid-" + entry.id}
          disabled={isFinished || showSettings}
          onClick={() => rate(entry.id)}>
          <span className="rapid-grade-title">{entry.title}</span>
          <span className="rapid-grade-hint">{entry.meaning}</span>
          <kbd>{entry.key}</kbd>
        </button>)}
      </div>
      {message && <p className="rapid-toast" role="status">{message}</p>}
    </footer>
  </div>;
}
