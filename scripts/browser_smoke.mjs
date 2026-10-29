import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:4173";
await mkdir("artifacts/ui", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block",
});
const page = await context.newPage();
page.on("pageerror", e => console.error("PAGE ERROR",e.message));
async function screenshot(label) {
  const checks = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll(".rapid-grade"));
    const usable = buttons.every(node => {
      const r = node.getBoundingClientRect();
      return r.bottom <= window.innerHeight + 1 && r.top >= -1 && r.height >= 40;
    });
    return { h: document.documentElement.scrollHeight, viewport: innerHeight,
      overflow: getComputedStyle(document.documentElement).overflowY,
      count: buttons.length, usable };
  });
  assert.equal(checks.overflow, "hidden");
  assert.ok(checks.h <= checks.viewport + 2,
    "Vertical scrolling detected at " + label + " " + JSON.stringify(checks));
  assert.equal(checks.count, 4);
  assert.equal(checks.usable, true);
  await page.screenshot({ path: "artifacts/ui/" + label + ".png", fullPage: false });
}
const storage = async () => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith("vocab-fsrs:"));
  return key ? JSON.parse(localStorage.getItem(key) || "{}") : {};
});
try {
  await page.goto(BASE + "/#/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /我的词书/ }).waitFor();
  await page.getByRole("link", { name: /导入新词书/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "rapid_exam.csv", mimeType: "text/csv",
    buffer: Buffer.from("word,meaning,example,notes\ncasa,房子,Esta casa é grande.,易错点\nolá,你好,Olá amigo!,问候语\nlivro,书,Este livro é novo.,名词"),
  });
  await page.getByRole("heading", { name: "选择词卡字段" }).waitFor();
  await page.getByRole("button", { name: /高级设置/ }).click();
  await page.getByRole("heading", { name: "设置你的学习节奏" }).waitFor();
  await page.getByRole("button", { name: /创建词书/ }).click();
  await page.getByRole("heading", { name: /准备好了/ }).waitFor();
  await page.getByRole("link", { name: /立即开始背诵/ }).click();
  await page.getByRole("heading", { name: "casa" }).waitFor();
  await page.getByRole("heading", { name: "房子" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /查看答案|朗读|下一张/ }).count(), 0);
  await screenshot("390-rapid-one-screen");
  await page.getByRole("button", { name: /记得/ }).click();
  await page.getByRole("heading", { name: "olá" }).waitFor();
  let records = Object.values(await storage());
  assert.equal(records.length, 1);
  assert.equal(records[0].goodCount, 1);
  await page.getByRole("button", { name: "撤销上次评分" }).click();
  await page.getByRole("heading", { name: "casa" }).waitFor();
  assert.equal(Object.values(await storage()).length, 0);
  await page.keyboard.press("2");
  await page.getByRole("heading", { name: "olá" }).waitFor();
  records = Object.values(await storage());
  assert.equal(records[0].hardCount, 1);
  assert.equal(records[0].goodCount, 0);
  await page.setViewportSize({ width: 320, height: 700 });
  await screenshot("320-rapid-one-screen");
  await page.setViewportSize({ width: 320, height: 568 });
  await screenshot("320-rapid-short");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("390-rapid-back");
  await page.getByRole("button", { name: "突击" }).click();
  await page.getByRole("heading", { name: /casa|olá|livro/ }).waitFor();
  await screenshot("390-rapid-cram");
  await page.getByRole("button", { name: /重来/ }).click();
  records = Object.values(await storage());
  assert.ok(records.some(r => r.cramLastGrade === "again"));
  await page.setViewportSize({ width: 1280, height: 850 });
  await screenshot("1280-rapid-desktop");
  console.log("PASS: no flip, one-tap grading, undo, cram, all controls in 320/390/1280 viewport");
} finally { await browser.close(); }
