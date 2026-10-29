import type { WorkBook } from "xlsx";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
  sheets?: string[];
  selectedSheet?: string;
  inferredHeaders?: boolean;
};
const LIMIT = 10000;
const workbooks = new WeakMap<File, import('xlsx').WorkBook>();
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const workbookCache = new WeakMap<File, WorkBook>();

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("gb18030").decode(bytes); }
}

function detectDelimiter(content: string): string {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0], ["|", 0]]);
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '"') {
      if (quoted && content[i+1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1])[0][0];
}

/** RFC 4180-style CSV/TSV: quoted delimiters, doubled quotes, line breaks, BOM. */
export function parseDelimitedText(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "");
  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i+1] === '"') { field += '"'; i++; }
      else if (quoted || field.trim() === "") quoted = !quoted;
      else field += ch;
    } else if (!quoted && ch === delim) { row.push(field.trim()); field = ""; }
    else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i+1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      if (rows.length > LIMIT + 2) throw new Error('最多允许 10,000 行');
      if (rows.length > LIMIT + 2) throw new Error("单次最多支持 10,000 行数据");
      row = []; field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("CSV 引号未闭合，请重新导出或检查引号");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

// Two-column, headerless word lists are frequent in school notes. Detect only
// when the first row looks like a word/translation pair; never silently drop it.
const headerRe = /^(word|english|term|front|back|meaning|translation|example|lemma|palavra|portugu[eê]s|chin[eê]s|chinese|definition|phrase|notes?|单词|词汇|词语|术语|葡语单词|葡文单词|英语单词|外语单词|正面|反面|背面|释义|含义|意思|中文|葡语|葡文|英语|翻译|解释|例句|题目|答案|单元|章节|名称|内容|词性|音标|备注|编号|序号|序列|序号id)(\s*[:：/(（【].*)?$/i;
function shouldInferHeaders(first: string[], second?: string[]): boolean {
  if (first.length !== 2 || !second || second.length < 2) return false;
  const values = first.map(x => x.trim());
  if (!values[0] || !values[1] || values.some(v => headerRe.test(v))) return false;
  const a = values[0], b = values[1];
  if (a.length > 100 || b.length > 180) return false;
  const hanA = /[\u3400-\u9FFF]/.test(a), hanB = /[\u3400-\u9FFF]/.test(b);
  // A genuine foreign-word/Chinese-meaning pair, including Chinese term cards.
  return (hanA !== hanB || (/\S/.test(a) && /\S/.test(b) && !/\d{4}[-/.]\d{1,2}/.test(a)));
}

export function parsePastedText(content: string): ParsedFile {
  if (!content.trim()) throw new Error("请先粘贴两列词汇内容");
  if (content.length > 4_000_000) throw new Error("粘贴内容过大，建议使用文件导入");
  return toParsed(parseDelimitedText(content), "粘贴的词卡");
}

export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error("文件超过 24MB，请按单元拆分导入");
  if(file.size>24*1024*1024)throw new Error("文件超过 24MB，请拆分导入");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (["csv", "txt", "tsv"].includes(ext || ""))
    return toParsed(parseDelimitedText(decodeText(await file.arrayBuffer())), file.name);
  if (ext !== "xlsx" && ext !== "xls") throw new Error("请选择 CSV、TSV 或 Excel 表格");
  // Load spreadsheet decoder only for Excel; cache workbook across sheet choices.
  const XLSX = await import("xlsx");
  let wb = workbookCache.get(file);
  if (!wb) {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: true });
    workbookCache.set(file, wb);
  }
  const sheets = wb.SheetNames;
  const chosen = sheetName && sheets.includes(sheetName) ? sheetName : sheets.find(name =>
    XLSX.utils.sheet_to_json<unknown[]>(wb!.Sheets[name], { header: 1, defval: "", raw: false }).length > 1);
  if (!chosen) throw new Error("没有找到包含词卡数据的工作表");
  const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[chosen], { header: 1, defval: "", raw: false });
  return toParsed(data, file.name, sheets, chosen);
}
