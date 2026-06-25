import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Trash2, BookOpen, PlusCircle } from "lucide-react";
import type { WordbookMeta, WordStudyRecord } from "../types";
import {
  listWordbooks,
  deleteWordbook,
} from "../lib/store";
import { loadRecords } from "../lib/study";

export default function Dashboard() {
  const [books, setBooks] = useState<WordbookMeta[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, { learned: number; total: number }>>({});
  const [deleteTarget, setDeleteTarget] = useState<WordbookMeta | null>(null);

  const refresh = useCallback(() => {
    const list = listWordbooks();
    // 最新导入的排前面
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setBooks(list);

    // 计算每本词书学习进度
    const map: Record<string, { learned: number; total: number }> = {};
    for (const book of list) {
      const records = loadRecords(book.id);
      const learned = Object.values(records).filter(
        (r: WordStudyRecord) => r.firstLearnedAt !== null || r.seenCount > 0
      ).length;
      map[book.id] = { learned, total: book.wordCount };
    }
    setProgressMap(map);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = (book: WordbookMeta) => {
    deleteWordbook(book.id);
    refresh();
    setDeleteTarget(null);
  };

  return (
    <div className="page dashboard">
      <header className="page-header">
        <h1>📚 我的词书</h1>
        <p className="sub">点击词书开始背诵 · 左滑删除</p>
      </header>

      {books.length === 0 ? (
        <div className="empty">
          <BookOpen size={48} />
          <p>还没有词书，点击下方 "+" 导入</p>
          <Link to="/import" className="btn btn-primary">
            <PlusCircle size={18} />
            导入词书
          </Link>
        </div>
      ) : (
        <div className="book-list">
          {books.map((book) => {
            const prog = progressMap[book.id];
            const pct = prog && prog.total > 0 ? Math.round((prog.learned / prog.total) * 100) : 0;

            return (
              <div key={book.id} className="book-card-wrapper">
                <Link to={`/review/${book.id}`} className="book-card">
                  <div className="book-card-body">
                    <h2>{book.name}</h2>
                    <p className="book-meta">
                      {book.wordCount} 词 · {book.defaultLevel}
                    </p>
                    {prog && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <p className="progress-text">
                      {prog ? `${prog.learned} / ${prog.total} 已学 (${pct}%)` : "0 / 0"}
                    </p>
                  </div>
                </Link>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteTarget(deleteTarget?.id === book.id ? null : book);
                  }}
                >
                  <Trash2 size={16} />
                </button>
                {deleteTarget?.id === book.id && (
                  <div className="delete-confirm">
                    <span>确认删除「{book.name}」？</span>
                    <button className="btn btn-danger" onClick={() => handleDelete(book)}>
                      确认
                    </button>
                    <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                      取消
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
