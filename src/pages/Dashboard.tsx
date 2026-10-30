import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookOpen, CheckCircle2, Download, FilePlus2,
  Search, ShieldCheck, Sparkles, Trash2, Upload,
} from "lucide-react";
import { deleteWordbook, exportBackup, getProgress, getWordbookItems, listWordbooks, restoreBackup } from "../lib/store";
import { isDue } from "../lib/fsrs";
import type { WordbookMeta } from "../types";

type DeckStat = { total: number; studied: number; due: number; newWords: number };
function countDeck(id: string, now: number): DeckStat {
  const items = getWordbookItems(id);
  const records = getProgress(id);
  const result = { total: items.length, studied: 0, due: 0, newWords: 0 };
  // One pass instead of three array filters, and one localStorage read per deck.
  for (const item of items) {
    const record = records[item.id];
    if (record?.seenCount) result.studied++;
    if (isDue(record, now)) result.due++;
    if (!record?.fsrs) result.newWords++;
  }
  return result;
}
export default function Dashboard() {
  const [books, setBooks] = useState<WordbookMeta[]>(() => listWordbooks().sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const refresh = () => setBooks(listWordbooks().sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  const { stats, summary, dueDeckId } = useMemo(() => {
    const now = Date.now();
    const stats: Record<string, DeckStat> = {};
    const summary: DeckStat = { total: 0, studied: 0, due: 0, newWords: 0 };
    let dueDeckId: string | null = null;
    for (const book of books) {
      const count = countDeck(book.id, now);
      stats[book.id] = count;
      for (const key of ["total", "studied", "due", "newWords"] as const) summary[key] += count[key];
      if (count.due && dueDeckId === null) dueDeckId = book.id;
    }
    return { stats, summary, dueDeckId };
  }, [books]);
  const visible = books.filter(b => b.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const backup = () => {
    const url = URL.createObjectURL(new Blob([exportBackup()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "记忆工坊备份-" + new Date().toISOString().slice(0,10) + ".json";
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = async (file?: File) => {
    if (!file) return;
    try { const n = restoreBackup(await file.text()); refresh(); setMessage("恢复成功：" + n + " 本词书"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "恢复失败"); }
  };
  return <div className="page dashboard">
    <div className="eyebrow"><span className="workshop-edition">记忆工坊 / PERSONAL EDITION</span><span><ShieldCheck size={14}/> 本地使用，不用登录</span></div>
    <header className="hero hero-r3">
      <span className="kicker">FOCUS ON WHAT MATTERS</span>
      <h1>每天一点，<br/><em>考前更从容。</em></h1>
      <p>上传表格或直接粘贴词语。按记忆情况安排下一次复习。</p>
      <div className="hero-actions">
        <Link to="/import" className="btn btn-primary hero-action"><FilePlus2 size={17}/> 导入新词书 <ArrowRight size={16}/></Link>
        {dueDeckId && <Link to={"/review/" + dueDeckId} className="btn btn-ghost hero-review"><Sparkles size={16}/> 复习到期词</Link>}
      </div>
      <span className="hero-counter" aria-hidden="true">03 <small>/ STUDY</small></span>
    </header>
    <div className="metrics">
      <div><span>今日待复习</span><strong>{summary.due}</strong><small>{summary.due ? "优先处理" : "今日无到期任务"}</small></div>
      <div><span>待首次排程</span><strong>{summary.newWords}</strong><small>包含旧版记录</small></div>
      <div><span>已学过</span><strong>{summary.studied}</strong><small>词库共 {summary.total} 张</small></div>
    </div>
    <div className="section-heading"><div><span className="kicker">MY COLLECTION</span><h2>我的词书 <sup>{books.length}</sup></h2></div><Link to="/import" className="text-action">添加词书 <ArrowRight size={15}/></Link></div>
    {books.length > 3 && <label className="deck-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="查找词书" aria-label="查找词书"/></label>}
    {books.length === 0 ? <div className="empty-state"><BookOpen size={34}/><h3>从自己的学习资料开始</h3><p>Excel、CSV、WPS 复制粘贴都可以；不必额外整理格式。</p><Link to="/import" className="btn btn-primary">创建第一本词书 <ArrowRight size={16}/></Link></div>
    : visible.length === 0 ? <div className="empty-state"><p>没有找到匹配的词书。</p><button className="btn btn-ghost" onClick={() => setSearch("")}>清除搜索</button></div>
    : <div className="deck-list">{visible.map((book, index) => {
      const c = stats[book.id]; const percent = c.total ? Math.round(c.studied/c.total*100) : 0;
      return <div className="deck-card" key={book.id}>
        <Link className="deck-main" to={"/review/" + book.id}>
          <div className="deck-head"><span>{String(index+1).padStart(2,"0")} / MY DECK</span><span>{c.total} 张词卡</span></div>
          <h3>{book.name}</h3>
          <p className="deck-meta"><span className={c.due > 0 ? "due-highlight" : ""}>{c.due} 待复习</span><span>{c.newWords} 待排程</span></p>
          <div className="deck-progress"><span style={{width: percent + "%"}}/></div>
          <div className="deck-foot"><small>已学习 {percent}%</small><span>进入词书 <ArrowRight size={16}/></span></div>
        </Link>
        <button className="deck-delete" aria-label={"删除词书 " + book.name} onClick={() => setDeleting(deleting === book.id ? null : book.id)}><Trash2 size={16}/></button>
        {deleting === book.id && <div className="delete-inline"><p>删除「{book.name}」和全部学习记录？</p><button onClick={() => { deleteWordbook(book.id); setDeleting(null); refresh(); }}><Trash2 size={14}/> 确认删除</button><button onClick={() => setDeleting(null)}>取消</button></div>}
      </div>;
    })}</div>}
    <section className="backup-bar"><div className="backup-copy"><CheckCircle2 size={19}/><div><h3>你的学习记录只属于你</h3><p>本地数据不会自动跨设备同步。换设备或清除浏览器数据前，记得导出备份。</p></div></div><div className="backup-actions"><button onClick={backup}><Download size={16}/> 导出备份</button><label><Upload size={16}/> 恢复备份<input hidden type="file" accept=".json" onChange={e => {void restore(e.target.files?.[0]);e.currentTarget.value = "";}}/></label></div>{message && <p role="status">{message}</p>}</section>
  </div>;
}
