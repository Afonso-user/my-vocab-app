export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
  sheets?: string[];
  selectedSheet?: string;
};
const LIMIT = 10000;

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("gb18030").decode(bytes); }
}

function detectDelimiter(content: string): string {
  const counts = new Map([",",";","\t","|"].map(x => [x, 0]));
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '"') {
      if (quoted && content[i+1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && counts.has(c)) counts.set(c, counts.get(c)! + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1]-a[1])[0][0];
}

/** RFC-4180-style quoted fields, including embedded commas, line breaks and "" escaping. */
export function parseDelimitedText(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, "");
  const delim = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i=0; i<text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i+1] === '"') { field += '"'; i++; }
      else if (quoted || field.trim() === "") quoted = !quoted;
      else field += ch;
    } else if (!quoted && ch === delim) {
      row.push(field.trim()); field = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i+1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("CSV 引号未闭合，请检查原表格或重新导出");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function toParsed(data: unknown[][], fileName: string, sheets?: string[], selectedSheet?: string): ParsedFile {
  if (data.length < 2) throw new Error("需要至少一行表头和一行词语数据");
  const counts = new Map<string, number>();
  const headers = data[0].map((cell,i) => {
    const base = String(cell ?? "").replace(/^\uFEFF/, "").trim() || "未命名列" + (i+1);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : base + " (" + n + ")";
  });
  if (headers.length < 2) throw new Error("至少需要词语、释义两列");
  const rows = data.slice(1).filter(line => line.some(v => String(v ?? "").trim()))
    .map(line => Object.fromEntries(headers.map((h,i) => [h, String(line[i] ?? "").trim()])));
  if (rows.length === 0) throw new Error("没有可导入的数据行");
  if (rows.length > LIMIT) throw new Error("单次最多 10,000 行，请将词库分成多本");
  return { headers, rows, fileName, sheets, selectedSheet };
}

export async function parseFile(file: File, sheetName?: string): Promise<ParsedFile> {
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    return toParsed(parseDelimitedText(decodeText(await file.arrayBuffer())), file.name);
  }
  if (ext !== "xlsx" && ext !== "xls") throw new Error("请选择 .csv / .tsv / .xlsx / .xls 文件");
  // Excel parsing is an optional chunk; CSV and the home page never load it.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, raw: true });
  const sheets = wb.SheetNames;
  const chosen = sheetName && sheets.includes(sheetName) ? sheetName : sheets.find(name => {
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: false });
    return data.length > 1;
  });
  if (!chosen) throw new Error("文件中没有包含数据的工作表");
  const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[chosen], { header: 1, defval: "", raw: false });
  return toParsed(data, file.name, sheets, chosen);
}
