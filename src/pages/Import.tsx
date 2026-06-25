import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft, ArrowRight, Check, AlertCircle } from "lucide-react";
import { parseFile, type ParsedFile } from "../lib/parse";
import { autoMapColumns, buildItems, FIELD_LABELS, REQUIRED_FIELDS, type FieldKey, type ImportError } from "../lib/mapping";
import { saveWordbook } from "../lib/store";
import type { WordbookMeta } from "../types";

type Step = "upload" | "map" | "config" | "confirm";

export default function Import() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({} as any);
  const [bookName, setBookName] = useState("");
  const [defaultLevel, setDefaultLevel] = useState("A1");
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = async (file: File) => {
    setLoading(true);
    setUploadError("");
    try {
      const result = await parseFile(file);
      setParsed(result);
      const auto = autoMapColumns(result.headers);
      setMapping(auto);
      setBookName(result.fileName.replace(/\.[^.]+$/, ""));
      setStep("map");
    } catch (e: any) {
      setUploadError(e.message || "解析文件失败");
    }
    setLoading(false);
  };

  const handleGoConfig = () => {
    const missing = REQUIRED_FIELDS.filter((f) => !mapping[f]);
    if (missing.length > 0) {
      alert(`请为以下必填字段选择列：${missing.map((f) => FIELD_LABELS[f]).join("、")}`);
      return;
    }
    setStep("config");
  };

  const handleConfirm = () => {
    if (!parsed || !bookName.trim()) return;
    const wordbookId = `custom-${Date.now()}`;
    const result = buildItems(parsed.rows, mapping, wordbookId, defaultLevel);
    setErrors(result.errors);
    setItemCount(result.items.length);

    if (result.items.length === 0) {
      alert("没有有效数据可导入，请检查列映射和文件内容");
      setStep("map");
      return;
    }

    const meta: WordbookMeta = {
      id: wordbookId,
      name: bookName.trim(),
      createdAt: new Date().toISOString(),
      wordCount: result.items.length,
      defaultLevel,
    };
    saveWordbook(meta, result.items);
    setStep("confirm");
  };

  return (
    <div className="page import-page">
      <header className="page-header">
        <h1>📥 导入词书</h1>
      </header>

      {/* Step 指示器 */}
      <div className="step-indicator">
        {["upload", "map", "config", "confirm"].map((s, i) => (
          <div key={s} className={`step-dot ${step === s ? "active" : ""} ${["upload", "map", "config", "confirm"].indexOf(step) > i ? "done" : ""}`}>
            {["上传", "映射", "配置", "完成"][i]}
          </div>
        ))}
      </div>

      {/* Step 1: 上传 */}
      {step === "upload" && (
        <div className="step-body">
          <label className="upload-zone">
            <Upload size={40} />
            <p>点击选择 CSV / Excel 文件</p>
            <p className="upload-hint">支持 .csv / .xlsx / .xls，最多 5000 行</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              hidden
            />
          </label>
          {loading && <p className="msg">正在解析...</p>}
          {uploadError && <p className="msg error"><AlertCircle size={16} /> {uploadError}</p>}
        </div>
      )}

      {/* Step 2: 列映射 */}
      {step === "map" && parsed && (
        <div className="step-body">
          <p className="sub">共 {parsed.rows.length} 行数据 · {parsed.headers.length} 列</p>

          {/* 预览表格 */}
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  {parsed.headers.map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {parsed.headers.map((h) => <td key={h}>{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 列映射 */}
          <div className="mapping-grid">
            {Object.entries(FIELD_LABELS).map(([key, label]) => {
              const fk = key as FieldKey;
              const required = REQUIRED_FIELDS.includes(fk);
              return (
                <div key={fk} className="mapping-row">
                  <label>
                    {label}
                    {required && <span className="required">*</span>}
                  </label>
                  <select
                    value={mapping[fk] || ""}
                    onChange={(e) => setMapping({ ...mapping, [fk]: e.target.value || null })}
                  >
                    <option value="">-- 不映射 --</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="step-actions">
            <button className="btn btn-ghost" onClick={() => setStep("upload")}>
              <ArrowLeft size={16} /> 返回
            </button>
            <button className="btn btn-primary" onClick={handleGoConfig}>
              下一步 <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 配置 */}
      {step === "config" && (
        <div className="step-body">
          <div className="config-form">
            <label>
              词书名称
              <input
                type="text"
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                placeholder="我的词书"
              />
            </label>
            <label>
              默认等级
              <select value={defaultLevel} onChange={(e) => setDefaultLevel(e.target.value)}>
                <option value="A1">A1 - 入门</option>
                <option value="A2">A2 - 初级</option>
                <option value="B1">B1 - 中级</option>
                <option value="B2">B2 - 中高级</option>
              </select>
            </label>
          </div>
          <div className="step-actions">
            <button className="btn btn-ghost" onClick={() => setStep("map")}>
              <ArrowLeft size={16} /> 返回
            </button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={!bookName.trim()}>
              确认导入 <Check size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: 完成 */}
      {step === "confirm" && (
        <div className="step-body">
          <div className="result-card">
            <Check size={48} className="success-icon" />
            <h2>导入成功！</h2>
            <p>{bookName}</p>
            <p>{itemCount} 个单词 · {defaultLevel} 等级</p>
            {errors.length > 0 && (
              <details className="error-details">
                <summary>跳过了 {errors.length} 行（点击查看）</summary>
                <ul>
                  {errors.map((e, i) => (
                    <li key={i}>第 {e.row} 行: {e.message}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="step-actions">
            <button className="btn btn-ghost" onClick={() => nav("/")}>
              返回词书列表
            </button>
            <button className="btn btn-primary" onClick={() => { setStep("upload"); setParsed(null); setErrors([]); }}>
              继续导入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
