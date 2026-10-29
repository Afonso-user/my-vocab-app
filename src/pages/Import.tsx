import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2,
  FileSpreadsheet, Info, Layers3, UploadCloud,
} from "lucide-react";
import { parseFile, type ParsedFile } from "../lib/parse";
import {
  autoMapColumns, buildItems, FIELD_GROUPS, FIELD_LABELS,
  REQUIRED_FIELDS, type FieldKey, type ImportError,
} from "../lib/mapping";
import { saveWordbook } from "../lib/store";
import type { WordbookMeta } from "../types";

type Step = "upload" | "map" | "config" | "confirm";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "选择文件" },
  { key: "map", label: "对应字段" },
  { key: "config", label: "学习设置" },
  { key: "confirm", label: "完成" },
];

export default function Import() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [source, setSource] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>(
    () => Object.fromEntries(Object.keys(FIELD_LABELS).map(key => [key, null])) as Record<FieldKey, string | null>
  );
  const [bookName, setBookName] = useState("");
  const [defaultLevel, setDefaultLevel] = useState("未分类");
  const [dailyNewLimit, setDailyNewLimit] = useState(20);
  const [examDate, setExamDate] = useState("");
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [createdId, setCreatedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mappedColumns = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const unmappedHeaders = parsed?.headers.filter(h => !mappedColumns.has(h)) ?? [];
  const previewRow = parsed?.rows[0];
  const previewWord = mapping.word && previewRow?.[mapping.word];
  const previewMeaning = mapping.meaning && previewRow?.[mapping.meaning];

  const handleFile = async (file: File, sheet?: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await parseFile(file, sheet);
      setSource(file);
      setParsed(result);
      setMapping(autoMapColumns(result.headers));
      setBookName(old => sheet ? old : (file.name.replace(/\.[^.]+$/, "") || "期中词书"));
      setStep("map");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解析失败，请检查文件格式");
    } finally {
      setLoading(false);
    }
  };

  const goToConfig = () => {
    const missing = REQUIRED_FIELDS.filter(f => !mapping[f]);
    if (missing.length) {
      setError("请先选择：" + missing.map(key => FIELD_LABELS[key]).join("、"));
      return;
    }
    if (mapping.word === mapping.meaning) {
      setError("正面词语和背面释义不能使用同一列");
      return;
    }
    setError("");
    setStep("config");
  };

  const confirm = () => {
    if (!parsed || !bookName.trim()) return;
    setError("");
    const id = "custom-" + crypto.randomUUID();
    const result = buildItems(parsed.rows, mapping, id, defaultLevel);
    if (!result.items.length) {
      setError("没有找到有效词卡，请返回上一步检查词语和释义");
      return;
    }
    const meta: WordbookMeta = {
      id, name: bookName.trim(), createdAt: new Date().toISOString(),
      wordCount: result.items.length, defaultLevel,
      dailyNewLimit, targetRetention: 0.9,
      examDate: examDate || undefined,
      sourceFile: parsed.fileName,
    };
    try {
      saveWordbook(meta, result.items);
      setErrors(result.errors);
      setItemCount(result.items.length);
      setCreatedId(id);
      setStep("confirm");
    } catch (cause) {
      const quota = cause instanceof DOMException && cause.name === "QuotaExceededError";
      setError(quota
        ? "浏览器本地空间不足。请先在首页导出备份、缩小本次词书，或使用存储空间更充足的浏览器。"
        : cause instanceof Error ? cause.message : "本地保存失败，请勿关闭页面并重试");
    }
  };

  return (
    <div className="page import-page">
      <header className="import-heading">
        <Link to="/" className="back-link"><ArrowLeft size={17} /> 我的词书</Link>
        <div className="kicker">BUILD YOUR OWN DECK</div>
        <h1>把自己的表格，<em>变成词卡。</em></h1>
        <p>无需整理成固定模板。选择列、确认预览，就能开始背诵。</p>
      </header>

      <div className="step-indicator" aria-label="导入进度">
        {STEPS.map(({ key, label }, i) => (
          <div key={key} className={"step-dot " +
            (step === key ? "active" : STEPS.findIndex(s => s.key === step) > i ? "done" : "")}>
            <span>{i + 1}</span>{label}
          </div>
        ))}
      </div>

      {error && <div className="import-alert" role="alert"><AlertCircle size={18} />{error}</div>}

      {step === "upload" && (
        <div className="step-body">
          <label className={"upload-zone " + (loading ? "is-loading" : "")}
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              if (event.dataTransfer.files[0]) void handleFile(event.dataTransfer.files[0]);
            }}>
            <span className="upload-icon"><UploadCloud size={30} strokeWidth={1.6} /></span>
            <strong>{loading ? "正在读取文件…" : "点此选择，或拖放表格"}</strong>
            <span>Excel / CSV / TSV · 最多 10,000 行</span>
            <span className="upload-badge">在浏览器内解析 · 不上传服务器</span>
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls"
              disabled={loading}
              onChange={event => {
                const file = event.currentTarget.files?.item(0);
                if (file) void handleFile(file);
                else setError("没有读取到文件，请重新选择");
              }} />
          </label>
          <div className="upload-footnotes">
            <div><FileSpreadsheet size={19}/><strong>直接使用现有表格</strong><p>第一行作为表头，支持 Excel 多工作表。</p></div>
            <div><Layers3 size={19}/><strong>字段尽量不丢失</strong><p>额外列会保存在词卡详情中，不强制修改原表。</p></div>
          </div>
        </div>
      )}

      {step === "map" && parsed && (
        <div className="step-body">
          <div className="import-status">
            <div><FileSpreadsheet size={22} /><div><strong>{parsed.fileName}</strong><small>{parsed.rows.length} 行 · {parsed.headers.length} 列 · 已映射 {mappedColumns.size} 列</small></div></div>
            {parsed.sheets && parsed.sheets.length > 1 && source && (
              <label className="sheet-choice">工作表
                <select value={parsed.selectedSheet ?? ""} disabled={loading}
                  onChange={event => void handleFile(source, event.target.value)}>
                  {parsed.sheets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="mapping-layout">
            <div className="mapping-panel">
              <div className="panel-heading"><div><span className="kicker">COLUMN MAPPING</span><h2>选择词卡字段</h2></div><span className="panel-help">* 必填</span></div>
              {FIELD_GROUPS.map((group, i) => {
                const rows = group.keys;
                const filled = rows.filter(key => mapping[key]).length;
                const body = rows.map(key => (
                  <label className="mapping-row" key={key}>
                    <span>{FIELD_LABELS[key]}{REQUIRED_FIELDS.includes(key) && <i>*</i>}</span>
                    <select value={mapping[key] ?? ""}
                      onChange={event => {
                        setMapping(old => ({ ...old, [key]: event.target.value || null }));
                        setError("");
                      }}>
                      <option value="">不使用</option>
                      {parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}
                    </select>
                  </label>
                ));
                return i === 0
                  ? <div key={group.label} className="mapping-required">{body}</div>
                  : <details key={group.label} className="mapping-group" open={i === 1}>
                    <summary>{group.label}<span>{filled} / {rows.length} 已识别</span></summary>
                    <div className="mapping-grid">{body}</div>
                  </details>;
              })}
              <p className="mapping-note"><Info size={15}/> 未映射的 {unmappedHeaders.length} 列也会作为补充资料保留在词卡背面。</p>
            </div>

            <aside className="mapping-preview">
              <span className="kicker">LIVE PREVIEW / 首张词卡</span>
              <div className="mini-card"><span>FRONT</span><strong>{previewWord || "请选择词语列"}</strong><div className="mini-divider"/><span>BACK</span><h3>{previewMeaning || "请选择释义列"}</h3>
                {mapping.example && previewRow?.[mapping.example] &&
                  <p className="mini-example">{previewRow[mapping.example]}</p>}
              </div>
              <div className="mini-meta">前 6 行数据预览</div>
              <div className="preview-table-wrap"><table className="preview-table"><thead><tr>
                {parsed.headers.map(h => <th key={h}>{h}</th>)}
              </tr></thead><tbody>{parsed.rows.slice(0, 6).map((row, i) =>
                <tr key={i}>{parsed.headers.map(h => <td key={h} title={row[h]}>{row[h]}</td>)}</tr>,
              )}</tbody></table></div>
            </aside>
          </div>
          <div className="step-actions"><button className="btn btn-ghost" onClick={() => {setStep("upload");setError("");}}><ArrowLeft size={16}/> 重新选择</button>
            <button className="btn btn-primary" onClick={goToConfig}>确认映射 <ArrowRight size={16}/></button></div>
        </div>
      )}

      {step === "config" && (
        <div className="step-body">
          <div className="config-form">
            <div className="config-title"><span className="kicker">FINAL DETAILS</span><h2>设置你的学习节奏</h2><p>也可以之后再调整，先开始背诵最重要。</p></div>
            <label>词书名称<input value={bookName} onChange={e => setBookName(e.target.value)} maxLength={80} placeholder="如：葡语期中·第1–6单元"/></label>
            <div className="config-columns">
              <label>默认难度<select value={defaultLevel} onChange={e => setDefaultLevel(e.target.value)}>
                {["未分类","A1","A2","B1","B2","C1","C2","自定义"].map(level =>
                  <option value={level} key={level}>{level}</option>)}
              </select></label>
              <label>每轮新词<input type="number" min={1} max={200} value={dailyNewLimit} onChange={e => setDailyNewLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}/></label>
            </div>
            <label>期中考试日期（可选）<input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}/></label>
            <p className="config-tip">FSRS 将根据每张卡的真实评价安排复习；考前速刷不改变复习记录。</p>
          </div>
          <div className="step-actions"><button className="btn btn-ghost" onClick={() => {setStep("map");setError("");}}><ArrowLeft size={16}/> 返回映射</button>
            <button className="btn btn-primary" disabled={!bookName.trim()} onClick={confirm}>创建词书 <Check size={17}/></button></div>
        </div>
      )}

      {step === "confirm" && (
        <div className="import-success">
          <div className="success-icon"><CheckCircle2 size={36}/></div>
          <span className="kicker">IMPORT COMPLETE</span>
          <h2>准备好了，开始记忆。</h2>
          <p><b>{bookName}</b> · {itemCount} 张词卡已保存在当前浏览器。</p>
          {errors.length > 0 && <details className="error-details"><summary>有 {errors.length} 行重复或缺少内容，已跳过</summary><ul>
            {errors.slice(0, 50).map(e => <li key={e.row}>第 {e.row} 行：{e.message}</li>)}
            {errors.length > 50 && <li>其余 {errors.length - 50} 行未展开</li>}
          </ul></details>}
          <div className="success-actions"><Link to={"/review/" + createdId} className="btn btn-primary">立即开始背诵 <ArrowRight size={17}/></Link>
            <button className="btn btn-ghost" onClick={() => {
              setStep("upload"); setSource(null); setParsed(null); setErrors([]);
              setError(""); setCreatedId("");
            }}>继续导入</button></div>
          <button className="text-action" onClick={() => nav("/")}>返回我的词书</button>
        </div>
      )}
    </div>
  );
}
