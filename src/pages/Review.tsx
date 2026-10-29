import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Keyboard, RotateCcw, Undo2, Volume2 } from "lucide-react";
import type { Grade, StudyMode, StudyProgress, StudyQueueItem, VocabularyItem } from "../types";
import { getProgress, getWordbook, getWordbookItems, saveProgress, updateWordbook } from "../lib/store";
import { isDue, schedule } from "../lib/fsrs";

const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: "again", label: "重来", hint: "忘记了" },
  { grade: "hard", label: "困难", hint: "勉强想起" },
  { grade: "good", label: "记得", hint: "正常回忆" },
  { grade: "easy", label: "简单", hint: "非常熟悉" },
];
type UndoEntry = { itemId: string; before?: StudyProgress; previousQueue: StudyQueueItem[] };

function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function daysUntil(date: string) {
  if (!date) return null;
  const timestamp = new Date(date + "T23:59:59").getTime();
  return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000)) : null;
}
function dueLabel(iso?: string) {
  if (!iso) return "等待安排";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "等待安排";
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  if (minutes >= 0 && minutes < 60) return "约 " + Math.max(1, minutes) + " 分钟后";
  if (minutes >= 60 && minutes < 1440) return "约 " + Math.ceil(minutes / 60) + " 小时后";
  return new Date(iso).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}
function Details({ title, value }: { title: string; value?: string | string[] }) {
  const text = Array.isArray(value) ? value.join(" · ") : value;
  return text ? <div className="detail-line"><b>{title}</b><span>{text}</span></div> : null;
}
function storageError(error: unknown) {
  return error instanceof DOMException && error.name === "QuotaExceededError"
    ? "本地空间不足，请返回首页导出备份"
    : error instanceof Error ? error.message : "保存失败";
}

export default function Review() {
  const { wordbookId = "" } = useParams();
  const book = getWordbook(wordbookId);
  const items = useMemo(() => getWordbookItems(wordbookId), [wordbookId]);
  const [progress, setProgress] = useState<Record<string, StudyProgress>>(() => getProgress(wordbookId));
  const [mode, setMode] = useState<StudyMode | "select">("select");
  const [queue, setQueue] = useState<StudyQueueItem[]>([]);
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [rated, setRated] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [newLimit, setNewLimit] = useState(book?.dailyNewLimit ?? 20);
  const [retention, setRetention] = useState(book?.targetRetention ?? 0.9);
  const [exam, setExam] = useState(book?.examDate ?? "");
  const [speechLanguage, setSpeechLanguage] = useState<"pt-BR" | "pt-PT" | "en-US">("pt-BR");
  const [message, setMessage] = useState("");

  const fresh = items.filter(item => !progress[item.id]?.fsrs);
  const due = items.filter(item => isDue(progress[item.id]))
    .sort((a, b) => new Date(progress[a.id]?.fsrs?.dueAt ?? 0).getTime()
      - new Date(progress[b.id]?.fsrs?.dueAt ?? 0).getTime());
  const learned = items.filter(item => (progress[item.id]?.seenCount ?? 0) > 0).length;
  const legacy = fresh.filter(item => progress[item.id]?.legacySeen).length;
  const days = daysUntil(exam);
  const perDay = days && days > 0 ? Math.ceil(fresh.length / days) : null;
  const current = queue[position];
  const item: VocabularyItem | undefined = current?.item;
  const finished = mode !== "select" && !current;

  function start(type: StudyMode) {
    let next: StudyQueueItem[] = [];
    if (type === "today") next = [
      ...due.slice(0, 60).map(item => ({ item, kind: "due" as const })),
      ...fresh.slice(0, newLimit).map(item => ({ item, kind: "new" as const })),
    ];
    if (type === "new") next = fresh.slice(0, newLimit).map(item => ({ item, kind: "new" }));
    if (type === "cram") next = shuffle(items).slice(0, 100).map(item => ({ item, kind: "cram" }));
    if (!next.length) return;
    setMode(type); setQueue(next); setPosition(0); setRevealed(false);
    setRated(false); setUndo(null); setCompletedCount(0); setMessage("");
  }
  function rate(grade: Grade) {
    if (!item || rated || mode === "cram") return;
    const before = progress[item.id];
    try {
      const nextCard = schedule(before, item, grade, retention);
      const updated = { ...progress, [item.id]: nextCard };
      saveProgress(wordbookId, updated);
      setUndo({ itemId: item.id, before, previousQueue: queue });
      setProgress(updated); setRated(true); setCompletedCount(n => n + 1);
      if (grade === "again" && queue.filter(q => q.item.id === item.id).length === 1)
        setQueue(q => [...q, { item, kind: "due" }]);
      setMessage("");
    } catch (error) { setMessage(storageError(error)); }
  }
  function undoRating() {
    if (!undo || !rated) return;
    const updated = { ...progress };
    if (undo.before) updated[undo.itemId] = undo.before;
    else delete updated[undo.itemId];
    try {
      saveProgress(wordbookId, updated);
      setProgress(updated); setQueue(undo.previousQueue);
      setCompletedCount(n => Math.max(0, n - 1)); setRated(false); setUndo(null); setMessage("");
    } catch (error) { setMessage(storageError(error)); }
  }
  function next() {
    if (mode === "cram") setCompletedCount(n => n + 1);
    setPosition(n => n + 1); setRated(false); setRevealed(false); setUndo(null);
  }
  function speak(text: string) {
    if (!("speechSynthesis" in window)) { setMessage("当前浏览器不支持语音合成"); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLanguage; utterance.rate = 0.9;
    speechSynthesis.cancel(); speechSynthesis.speak(utterance);
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat
        || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement || mode === "select" || !current) return;
      if (!revealed && [" ", "Enter"].includes(event.key)) {
        event.preventDefault(); setRevealed(true);
      } else if (revealed && !rated && mode !== "cram" && /^[1-4]$/.test(event.key)) {
        event.preventDefault(); rate(GRADES[Number(event.key) - 1].grade);
      } else if (revealed && (rated || mode === "cram") && ["Enter", "ArrowRight"].includes(event.key)) {
        event.preventDefault(); next();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  if (!book) return <div className="page review-page"><Link to="/" className="back-link">返回词书</Link><p>未找到此词书</p></div>;
  return <div className={"page review-page " + (mode === "select" ? "" : "session-page")}>
    <div className="back-row">
      {mode === "select" ? <Link to="/" className="back-link"><ArrowLeft size={17}/> 我的词书</Link>
        : <button className="back-link back-button" onClick={() => setMode("select")}><ArrowLeft size={17}/> 退出本轮</button>}
      <span className="review-algorithm"><Clock3 size={14}/> FSRS 记忆曲线</span>
    </div>

    {mode === "select" ? <>
      <header className="review-intro"><span className="kicker">YOUR STUDY DECK</span><h1>{book.name}</h1>
        <p>{items.length} 张词卡 · 已学过 {learned} 张 · 今日到期 {due.length} 张</p></header>
      {days !== null && <div className="exam-brief"><CalendarDays size={20}/><div>
        <strong>{days === 0 ? "考试就在今天" : "距离考试还有 " + days + " 天"}</strong>
        <p>{!fresh.length ? "所有词卡已完成首次排程，继续按期复习。"
          : perDay ? "还有 " + fresh.length + " 张待首次排程；建议每天完成约 " + perDay + " 张。" : "先熟悉词卡，随后再集中速刷。"}</p>
      </div></div>}
      <div className="review-summary">
        <div><span>到期复习</span><strong>{due.length}</strong><small>优先处理</small></div>
        <div><span>待首次排程</span><strong>{fresh.length}</strong><small>{legacy ? "含 " + legacy + " 张旧记录" : "新词与旧记录"}</small></div>
        <div><span>学习覆盖</span><strong>{items.length ? Math.round(learned / items.length * 100) : 0}%</strong><small>接触过的词卡</small></div>
      </div>
      <section className="study-settings"><div className="settings-heading"><h3>本轮学习设置</h3><span>随时可更改</span></div>
        <label>每轮新词 <input type="number" min={1} max={200} value={newLimit}
          onChange={e => setNewLimit(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}/></label>
        <label>目标记忆率 <select value={retention} onChange={e => setRetention(Number(e.target.value))}>
          <option value={0.85}>85% · 轻量</option><option value={0.9}>90% · 均衡</option>
          <option value={0.95}>95% · 密集</option></select></label>
        <label>考试日期 <input type="date" value={exam} onChange={e => setExam(e.target.value)}/></label>
        <label>朗读语言 <select value={speechLanguage} onChange={e => setSpeechLanguage(e.target.value as typeof speechLanguage)}>
          <option value="pt-BR">葡语 · 巴西</option><option value="pt-PT">葡语 · 葡萄牙</option><option value="en-US">英语</option>
        </select></label>
        <button className="save-settings" onClick={() => {
          try { updateWordbook({ ...book, dailyNewLimit: newLimit, targetRetention: retention, examDate: exam || undefined }); setMessage("设置已保存"); }
          catch (error) { setMessage(storageError(error)); }
        }}>保存为本词书默认设置</button>
      </section>
      <div className="mode-cards">
        <div className="mode-card primary-mode"><span className="kicker">DAILY FOCUS</span><BookOpen size={23}/>
          <h3>今日学习</h3><p>优先处理 {Math.min(60, due.length)} 张到期词，再加入 {Math.min(newLimit, fresh.length)} 张待排程词卡。</p>
          <button className="btn btn-primary full" disabled={!due.length && !fresh.length} onClick={() => start("today")}>开始今日学习 <ArrowRight size={17}/></button></div>
        <div className="mode-card"><CheckCircle2 size={23}/><h3>新词排程</h3><p>为未建立 FSRS 计划的词卡安排首次复习。</p>
          <button className="btn btn-secondary full" disabled={!fresh.length} onClick={() => start("new")}>学习 {Math.min(newLimit, fresh.length)} 张</button></div>
        <div className="mode-card"><RotateCcw size={23}/><h3>考前速刷</h3><p>每轮随机最多 100 张，不修改记忆计划。</p>
          <button className="btn btn-ghost full" disabled={!items.length} onClick={() => start("cram")}>立即速刷</button></div>
      </div>
      {legacy > 0 && <p className="legacy-notice">已保留 {legacy} 张词卡的旧版学习次数。首次在新版评分后，才会建立真正的 FSRS 日程。</p>}
    </> : finished ? <div className="finish-screen"><div className="finish-symbol"><CheckCircle2 size={37}/></div>
      <span className="kicker">SESSION COMPLETE</span><h1>这一轮，完成了。</h1>
      <p>本轮回忆了 {completedCount} 次。{mode === "cram" ? "速刷不会改变记忆计划。" : "下一次复习时间已保存在本地。"}</p>
      <button className="btn btn-primary" onClick={() => setMode("select")}>返回词书 <ArrowRight size={17}/></button></div> :
      <>
        <div className="session-head"><span>{mode === "cram" ? "考前速刷" : mode === "new" ? "新词排程" : "今日学习"}</span>
          <strong>{position + 1} <i>/</i> {queue.length}</strong></div>
        <div className="session-progress"><span style={{ width: (position / queue.length * 100) + "%" }}/></div>
        <article className={"flashcard " + (revealed ? "flipped" : "")}>
          <div className="card-topline"><span>{current.kind === "new" ? "LEARN / 待排程" : current.kind === "due" ? "REVIEW / 到期" : "CRAM / 速刷"}</span>
            <span>{item?.unit ?? item?.capleLevel ?? "FLASHCARD"}</span></div>
          <div className="word-center"><h1 lang="pt">{item?.word}</h1>
            {item?.pronunciation && <p className="phonetic">{item.pronunciation}</p>}
            <button className="speaker" onClick={() => speak(item?.word ?? "")} aria-label="朗读词语"><Volume2 size={19}/></button>
          </div>
          {revealed ? <div className="answer-content"><div className="answer-label">ANSWER / 释义</div>
              <h2>{item?.meaning}</h2>
              {(item?.partOfSpeech || item?.gender) && <p className="answer-pos">{item.partOfSpeech}
                {item.gender === "masculine" ? " · 阳性" : item.gender === "feminine" ? " · 阴性" : item.gender === "common" ? " · 通性" : ""}</p>}
              {item?.example && <div className="example"><p lang="pt">{item.example}</p>{item.exampleZh && <small>{item.exampleZh}</small>}</div>}
              {item?.mnemonic && <div className="memory-tip"><b>记忆提示</b><p>{item.mnemonic}</p></div>}
              <details className="answer-more"><summary>查看全部补充资料</summary>
                <Details title="固定搭配" value={item?.collocations}/><Details title="同义词" value={item?.synonyms}/>
                <Details title="反义词" value={item?.antonyms}/><Details title="词形变体" value={item?.variants}/>
                <Details title="语法" value={item?.grammar}/><Details title="动词变位" value={item?.conjugation}/>
                <Details title="备注" value={item?.notes}/><Details title="英文释义" value={item?.translationEn}/>
                <Details title="复数" value={item?.plural}/><Details title="标签" value={item?.tags}/>
                <Details title="来源" value={item?.source}/>
                {item?.extra && Object.entries(item.extra).map(([key, value]) => <Details key={key} title={key} value={value}/>)}
              </details>
            </div> :
            <div className="think-hint"><div className="hint-line"/><p>先回想含义，再揭晓答案</p><small>尽量不要直接猜</small></div>}
        </article>
        <div className="card-controls">
          {!revealed ? <button className="btn btn-primary full reveal-button" onClick={() => setRevealed(true)}>查看答案 <ArrowRight size={17}/></button>
          : mode === "cram" ? <button className="btn btn-primary full" onClick={next}>下一张 <ArrowRight size={17}/></button>
          : !rated ? <><p className="grade-title">你刚刚回想得怎么样？</p>
              <div className="grade-grid">{GRADES.map((grade, index) => <button key={grade.grade} className={"grade-" + grade.grade} onClick={() => rate(grade.grade)}>
                <strong>{grade.label}</strong><small>{grade.hint}</small><kbd>{index + 1}</kbd></button>)}</div></>
          : <><div className="rating-confirmation"><CheckCircle2 size={17}/><span>已保存 · 下次复习 {dueLabel(item && progress[item.id]?.fsrs?.dueAt)}</span>
              <button onClick={undoRating}><Undo2 size={14}/> 撤销</button></div>
              <button className="btn btn-primary full" onClick={next}>下一张 <ArrowRight size={17}/></button></>}
        </div>
        <p className="keyboard-note"><Keyboard size={14}/> 空格翻面 · 数字 1–4 评价 · Enter 下一张</p>
      </>}
    {message && <p role="status" className="inline-message">{message}</p>}
  </div>;
}
