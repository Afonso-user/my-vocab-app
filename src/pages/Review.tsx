import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ListOrdered, RotateCcw, Settings2, Shuffle, Undo2, X } from "lucide-react";
import type { Grade, StudyMode, StudyOrder, StudyProgress, StudyQueueItem, VocabularyItem } from "../types";
import { getProgress, getWordbook, getWordbookItems, saveProgress, updateWordbook } from "../lib/store";
import { isDue, schedule } from "../lib/fsrs";
import { buildExamDrill } from "../lib/queue";
import { orderQueue, reorderRemaining } from "../lib/order";
import { finalReviewGrade, recordExamJudgment } from "../lib/review-flow";

type UndoEntry = {
  itemId: string;
  before?: StudyProgress;
  previousQueue: StudyQueueItem[];
  previousIndex: number;
  previousCompleted: number;
};

const RATINGS: { grade: Grade; label: string; hint: string; key: string }[] = [
  { grade: "again", label: "不认识", hint: "完全想不起来", key: "1" },
  { grade: "hard", label: "模糊", hint: "记得但费劲", key: "2" },
  { grade: "good", label: "认识", hint: "基本能想起", key: "3" },
  { grade: "easy", label: "很熟", hint: "不假思索", key: "4" },
];
const MODES: { value: StudyMode; label: string }[] = [
  { value: "today", label: "今日" },
  { value: "new", label: "新词" },
  { value: "cram", label: "突击" },
];

function createQueue(
  mode: StudyMode, items: VocabularyItem[], records: Record<string, StudyProgress>,
  limit: number, order: StudyOrder,
): StudyQueueItem[] {
  if (mode === "cram") return orderQueue(buildExamDrill(items, records, 120), order, items);
  const fresh: VocabularyItem[] = [], due: VocabularyItem[] = [];
  const now = Date.now();
  for (const item of items) {
    const record = records[item.id];
    if (!record?.fsrs) fresh.push(item);
    else if (isDue(record, now)) due.push(item);
  }
  due.sort((a, b) =>
    Date.parse(records[a.id].fsrs!.dueAt) - Date.parse(records[b.id].fsrs!.dueAt));
  const count = Math.max(1, Math.min(200, limit));
  // Random mode draws from the entire eligible deck, not just the first
  // N import rows; sequential retains the source CSV row order.
  const nextNew = orderQueue(
    fresh.map(item => ({ item, kind: "new" as const })), order, items,
  ).slice(0, count);
  if (mode === "new") return nextNew;
  const nextDue = orderQueue(
    due.map(item => ({ item, kind: "due" as const })), order, items,
  ).slice(0, 60);
  return orderQueue([...nextDue, ...nextNew], order, items);
}

function display(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(" · ") : value || "";
}
function extendedFields(item: VocabularyItem | undefined) {
  if (!item) return [];
  const entries: [string, string | string[] | undefined][] = [
    ["音标", item.pronunciation],
    ["词性", item.partOfSpeech],
    ["阴阳性", item.gender === "masculine" ? "阳性" : item.gender === "feminine" ? "阴性" : item.gender === "common" ? "通性" : undefined],
    ["等级", item.capleLevel], ["单元", item.unit],
    ["例句", item.example], ["例句翻译", item.exampleZh],
    ["固定搭配", item.collocations], ["近义词", item.synonyms],
    ["反义词", item.antonyms], ["词形", item.variants],
    ["语法", item.grammar], ["变位", item.conjugation],
    ["记忆提示", item.mnemonic], ["备注", item.notes],
    ["英文释义", item.translationEn], ["复数", item.plural],
    ["标签", item.tags], ["来源", item.source],
    ...Object.entries(item.extra ?? {}),
  ];
  return entries.map(([title, value]) => ({ title, value: display(value) })).filter(x => x.value);
}
function persistError(error: unknown) {
  return error instanceof Error ? error.message : "本地记录保存失败，请检查浏览器存储";
}

export default function Review() {
  const { wordbookId = "" } = useParams();
  const book = getWordbook(wordbookId);
  const items = useMemo(() => getWordbookItems(wordbookId), [wordbookId]);
  const [records, setRecords] = useState<Record<string, StudyProgress>>(() => getProgress(wordbookId));
  const [mode, setMode] = useState<StudyMode>("today");
  const [limit, setLimit] = useState(book?.dailyNewLimit ?? 20);
  const [retention, setRetention] = useState(book?.targetRetention ?? 0.9);
  const [exam, setExam] = useState(book?.examDate ?? "");
  const [studyOrder, setStudyOrder] = useState<StudyOrder>(book?.studyOrder === "random" ? "random" : "sequential");
  const [queue, setQueue] = useState<StudyQueueItem[]>(() =>
    createQueue("today", items, getProgress(wordbookId), book?.dailyNewLimit ?? 20, book?.studyOrder === "random" ? "random" : "sequential"));
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);

  const current = queue[index];
  const word = current?.item;
  const finished = !word;
  const showingAnswer = selectedGrade !== null;
  const details = useMemo(() => extendedFields(word), [word]);
  const chosen = RATINGS.find(r => r.grade === selectedGrade);

  useEffect(() => {
    document.documentElement.classList.add("rapid-studying");
    return () => { document.documentElement.classList.remove("rapid-studying"); };
  }, []);
  useEffect(() => { lock.current = false; }, [index]);

  function switchMode(next: StudyMode) {
    setMode(next);
    setQueue(createQueue(next, items, records, limit, studyOrder));
    setIndex(0);
    setCompleted(0);
    setSelectedGrade(null);
    setUndo(null);
    setShowSettings(false);
    setMessage("");
    lock.current = false;
  }

  function changeStudyOrder(next: StudyOrder) {
    if (next === studyOrder || !book) return;
    try {
      updateWordbook({ ...book, studyOrder: next });
      setStudyOrder(next);
      const atUntouchedStart = index === 0 && completed === 0 && selectedGrade === null && !undo;
      setQueue(previous => atUntouchedStart
        ? createQueue(mode, items, records, limit, next)
        : reorderRemaining(previous, index, next, items));
      setUndo(previous => previous ? {
        ...previous,
        previousQueue: reorderRemaining(
          previous.previousQueue, previous.previousIndex, next, items,
        ),
      } : null);
      // No FSRS grading, active question change or progress reset on toggle.
      setMessage("");
    } catch (error) {
      setMessage(persistError(error));
    }
  }

  /** Phase one: note confidence and reveal. No localStorage write yet. */
  function choose(grade: Grade) {
    if (!word || lock.current || selectedGrade !== null || showSettings) return;
    setSelectedGrade(grade);
    setMessage("");
  }

  /** Phase two: only the final verification writes a review event. */
  function confirm(mistake: boolean) {
    if (!current || !word || selectedGrade === null || lock.current || showSettings) return;
    lock.current = true;
    const grade = finalReviewGrade(selectedGrade, mistake);
    const previous = records[word.id];
    try {
      const next = mode === "cram" || current.kind === "reinforce"
        ? recordExamJudgment(previous, word, grade)
        : schedule(previous, word, grade, retention);
      const updated = { ...records, [word.id]: next };
      saveProgress(wordbookId, updated);
      setUndo({
        itemId: word.id, before: previous,
        previousQueue: queue, previousIndex: index, previousCompleted: completed,
      });
      setRecords(updated);
      if (grade === "again" && mode !== "cram" && current.kind !== "reinforce"
        && !queue.some(entry => entry.item.id === word.id && entry.kind === "reinforce")) {
        const nextQueue = [...queue];
        nextQueue.splice(Math.min(index + 4, nextQueue.length), 0, { item: word, kind: "reinforce" });
        setQueue(nextQueue);
      }
      setIndex(value => value + 1);
      setCompleted(value => value + 1);
      setSelectedGrade(null);
        setMessage("");
    } catch (error) {
      lock.current = false;
      setMessage(persistError(error));
    }
  }

  function undoLast() {
    if (!undo || lock.current) return;
    lock.current = true;
    const updated = { ...records };
    if (undo.before) updated[undo.itemId] = undo.before;
    else delete updated[undo.itemId];
    try {
      saveProgress(wordbookId, updated);
      setRecords(updated);
      setQueue(undo.previousQueue);
      setIndex(undo.previousIndex);
      setCompleted(undo.previousCompleted);
      setSelectedGrade(null);
      setUndo(null);
      setMessage("");
    } catch (error) {
      setMessage(persistError(error));
    } finally {
      lock.current = false;
    }
  }

  function saveSettings() {
    if (!book) return;
    try {
      updateWordbook({
        ...book, dailyNewLimit: limit, targetRetention: retention,
        examDate: exam || undefined,
      });
      setShowSettings(false);
      setMessage("设置已保存。切换模式即可按新数量重新组队。");
    } catch (error) { setMessage(persistError(error)); }
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat
        || target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape" && showSettings) {
        setShowSettings(false); event.preventDefault(); return;
      }
      if (showSettings) return;
      if (target?.closest("button, a") && (event.key === " " || event.key === "Enter")) return;
      if (!showingAnswer && (event.key === "z" || event.key === "Z")) {
        event.preventDefault(); undoLast(); return;
      }
      if (!word) return;
      if (!showingAnswer && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        choose(RATINGS[Number(event.key) - 1].grade);
      } else if (showingAnswer && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); confirm(false);
      } else if (showingAnswer && (event.key === "Backspace" || event.key.toLowerCase() === "x")) {
        event.preventDefault(); confirm(true);
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  if (!book) return <div className="rapid-missing"><Link to="/">返回词书</Link><p>未找到该词书。</p></div>;

  return <div className="rapid-study rapid-v4" data-phase={showingAnswer ? "answer" : "question"}>
    <header className="rapid-header">
      <Link className="rapid-return" to="/" aria-label="返回词书"><ArrowLeft size={18}/></Link>
      <div className="rapid-book" title={book.name}>
        <span>记忆工坊 / SPRINT</span>
        <strong>{book.name}</strong>
      </div>
      <nav className="rapid-modes" aria-label="学习模式">
        {MODES.map(entry => <button key={entry.value} onClick={() => switchMode(entry.value)}
          aria-pressed={mode === entry.value} className={mode === entry.value ? "active" : ""}>
          {entry.label}
        </button>)}
      </nav>
      <button type="button" className="rapid-small-btn" aria-label="撤销上次判断" title="撤销"
        onClick={undoLast} disabled={!undo || showingAnswer}><Undo2 size={17}/></button>
      <button type="button" className="rapid-small-btn" aria-label="学习设置" title="设置"
        onClick={() => setShowSettings(v => !v)}><Settings2 size={17}/></button>
    </header>

    <div className="rapid-progress">
      <div className="rapid-progress-copy">
        <span>{mode === "today" ? "今日学习" : mode === "new" ? "集中新词" : "考前突击"}
          <span className="rapid-phase-text"> / {showingAnswer ? "核对答案" : "先回忆"}</span>
        </span>
        <div className="v5-order-toggle" role="group" aria-label="词书出题顺序">
          <button type="button" className={studyOrder === "sequential" ? "active" : ""}
            aria-label="顺序模式" aria-pressed={studyOrder === "sequential"}
            onClick={() => changeStudyOrder("sequential")}><ListOrdered size={13}/>顺序</button>
          <button type="button" className={studyOrder === "random" ? "active" : ""}
            aria-label="随机模式" aria-pressed={studyOrder === "random"}
            onClick={() => changeStudyOrder("random")}><Shuffle size={13}/>随机</button>
        </div>
        <span className="v5-queue-position"><strong>{Math.min(index + 1, queue.length)}</strong> / {queue.length}</span>
      </div>
      <div className="rapid-progress-track">
        <span style={{ width: (queue.length ? Math.min(100, index / queue.length * 100) : 100) + "%" }}/>
      </div>
    </div>

    {finished ? <main className="rapid-done">
      <div className="rapid-done-mark"><Check size={30}/></div>
      <p className="rapid-eyebrow">SESSION COMPLETE</p>
      <h1>{completed ? "本轮结束，继续保持。" : "本轮暂无到期词卡"}</h1>
      <p>已完成 {completed} 张 {mode === "cram" ? "· 仅记录突击薄弱项" : "· FSRS 已按最终判断保存"}</p>
      <div className="rapid-done-actions">
        <button onClick={() => switchMode("cram")}>继续突击 <ArrowRight size={14}/></button>
        <button onClick={() => switchMode("today")}>刷新今日任务</button>
      </div>
    </main> : <main className={"rapid-card v4-card" + (showingAnswer ? " v4-revealed" : "")} aria-label="当前词卡">
      <div className="rapid-card-meta">
        <span>{current.kind === "new" ? "NEW / 新词" :
          current.kind === "due" ? "REVIEW / 复习" :
          current.kind === "reinforce" ? "REINFORCE / 加固" : "SPRINT / 突击"}</span>
        <span>{word.unit || word.capleLevel || "PRIVATE DECK"}</span>
      </div>

      {!showingAnswer ? <div className="v4-front">
        <div className="v4-wordframe">
          <span className="v4-eyebrow">PORTUGUÊS</span>
          <h1 className={word.word.length > 42 ? "v4-longword" : ""} lang="pt">{word.word}</h1>
          <div className="v4-word-rule"/>
          <p>你能想起它的意思吗？</p>
        </div>
        <div className="v4-front-guide">先在心里回忆，再判断熟悉程度</div>
      </div> : <div className={"v4-back v5-answer-back" + (details.length >= 8 ? " v5-dense" : "") + (details.length >= 14 ? " v5-packed" : "")}>
        <div className="v5-answer-scroll" tabIndex={0} aria-label="全部完整词卡资料">
          <div className="v5-answer-content">
            <div className="v4-back-word">
              <span>PORTUGUÊS</span>
              <h1 lang="pt">{word.word}</h1>
            </div>
            <div className="v4-answer">
              <span className="v4-eyebrow">中文释义 / ANSWER</span>
              <h2 className={word.meaning.length > 95 ? "v4-longmeaning" : ""}>{word.meaning}</h2>
              <div className="v4-selected"><Check size={13}/> 先前判断：{chosen?.label}</div>
            </div>
            {details.length > 0 ? <section className="v5-full-data" aria-label="完整补充资料">
              <div className="v5-full-data-heading">
                <span>完整资料</span><small>{details.length} 项 · 已全部展开</small>
              </div>
              <div className="v5-data-grid">
                {details.map(entry => <div className={"v5-data-entry" + (entry.value.length > 32 || entry.value.includes("\n") ? " v5-long" : "")}
                  key={entry.title}>
                  <span>{entry.title}</span>
                  <p>{entry.value}</p>
                </div>)}
              </div>
            </section> : <div className="v5-no-more">这张词卡暂无补充资料</div>}
          </div>
        </div>
      </div>
    </main>}

    <footer className="v4-actionbar">
      {finished ? <div className="v4-finish-hint">已完成本轮，点击上方按钮继续</div> : !showingAnswer ? <>
        <div className="v4-action-caption">
          <span>STEP 01 · 你对这个词的熟悉程度？</span>
          <span className="v4-keys">键盘 1–4</span>
        </div>
        <div className="v4-rating-grid" role="group" aria-label="选择熟悉程度并查看答案">
          {RATINGS.map(entry => <button type="button" key={entry.grade}
            className={"v4-rating v4-" + entry.grade}
            onClick={() => choose(entry.grade)}>
            <strong>{entry.label}</strong><span>{entry.hint}</span>
            <kbd>{entry.key}</kbd>
          </button>)}
        </div>
      </> : <>
        <div className="v4-action-caption">
          <span>STEP 02 · 核对答案后再确认</span>
          <span className="v4-keys">Enter 下一词 / X 记错</span>
        </div>
        <div className="v4-confirm-grid" role="group" aria-label="核对答案">
          <button type="button" className="v4-incorrect" onClick={() => confirm(true)}>
            <RotateCcw size={17}/> <span>记错了</span>
            <small>按不认识记录</small>
          </button>
          <button type="button" className="v4-next" onClick={() => confirm(false)}>
            <span>判断正确 · 下一词</span> <ArrowRight size={18}/>
          </button>
        </div>
      </>}
      {message && <p className="rapid-toast" role="status">{message}</p>}
    </footer>

    {showSettings && <section className="rapid-settings" aria-label="学习设置">
      <div className="rapid-settings-heading"><b>学习设置</b>
        <button onClick={() => setShowSettings(false)} aria-label="关闭设置"><X size={17}/></button></div>
      <label>每轮新词 <input type="number" min="1" max="200" value={limit}
        onChange={e => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}/></label>
      <label>目标记忆率 <select value={retention} onChange={e => setRetention(Number(e.target.value))}>
        <option value={0.85}>85%</option><option value={0.9}>90%</option>
        <option value={0.95}>95%</option></select></label>
      <label>考试日期 <input type="date" value={exam} onChange={e => setExam(e.target.value)}/></label>
      <p className="v4-settings-note">仅在核对答案、点击确认后才记录复习评价。</p>
      <button className="rapid-settings-save" onClick={saveSettings}>保存设置</button>
    </section>}
  </div>;
}
