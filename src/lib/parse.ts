// 浏览器端 CSV / XLSX 文件解析
import * as XLSX from "xlsx";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
};

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "txt") return parseCSV(file);
  if (ext === "xlsx" || ext === "xls") return parseExcel(file);
  throw new Error("不支持的文件格式，请上传 .csv / .xlsx / .xls 文件");
}

async function parseCSV(file: File): Promise<ParsedFile> {
  const text = await readText(file);

  // 检测分隔符
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  const lines = text.split(/\r?\n/);
  if (lines.length < 2) throw new Error("文件至少需要包含表头行和一行数据");

  const headers = parseCSVLine(lines[0], delim);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line, delim);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx]?.trim() ?? ""; });
    if (Object.values(row).some((v) => v)) rows.push(row);
  }

  if (rows.length === 0) throw new Error("文件中没有数据行");
  if (rows.length > 5000) throw new Error("最多支持 5000 行数据");

  return { headers, rows, fileName: file.name };
}

async function parseExcel(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("文件中没有工作表");
  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];

  if (data.length < 2) throw new Error("文件至少需要包含表头行和一行数据");

  const headers = (data[0] || []).map((h) => String(h ?? "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < data.length; i++) {
    const rowData = data[i] || [];
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = String(rowData[idx] ?? "").trim(); });
    if (Object.values(row).some((v) => v)) rows.push(row);
  }

  if (rows.length === 0) throw new Error("文件中没有数据行");
  if (rows.length > 5000) throw new Error("最多支持 5000 行数据");

  return { headers, rows, fileName: file.name };
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// 解析 CSV 行（处理引号包裹和 BOM）
function parseCSVLine(line: string, delim: string): string[] {
  const BOM = "﻿";
  let s = line.trim();
  if (s.startsWith(BOM)) s = s.slice(1);
  const result: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuote && s[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === delim && !inQuote) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
