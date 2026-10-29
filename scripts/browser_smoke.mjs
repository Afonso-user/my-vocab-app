import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const ROOT = "http://127.0.0.1:4173";
const OUT = "artifacts/ui";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block" });
const page = await context.newPage();
page.on("framenavigated", frame => console.log("NAVIGATED", frame.url()));
page.on("pageerror", error => console.error("PAGE ERROR:", error.stack || error.message));
async function shot(name) {
  const horizontalOverflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
      document.documentElement.clientWidth + 2,
  );
  assert.equal(horizontalOverflow, false, "Page has horizontal overflow: " + name);
  await page.screenshot({ path: OUT + "/" + name + ".png", fullPage: true });
}
try {
  await page.goto(ROOT + "/#/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /我的词书/ }).waitFor();
  await shot("390-home");

  await page.getByRole("link", { name: /导入新词书/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "exam_sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("word,meaning,example,exampleZh,notes\ncasa,房子,Esta casa é grande.,这所房子很大。,名词\nolá,你好,Olá amigo!,你好朋友!,问候语"),
  });
  console.log("FILE INPUT STATE:", JSON.stringify(await page.locator('input[type="file"]').evaluate(node => ({value:node.value, files:Array.from(node.files || []).map(f => [f.name,f.size]), disabled:node.disabled}))));
  try { await page.getByRole("heading", { name: "选择词卡字段" }).waitFor({timeout:5000}); }
  catch (error) {
    console.error("IMPORT URL:", page.url());
    console.error("IMPORT BODY:", (await page.locator("body").innerText()).slice(0,2000));
    await page.screenshot({ path: OUT + "/390-import-debug.png", fullPage: true });
    throw error;
  }
  await shot("390-import-map");
  await page.getByRole("button", { name: /确认映射/ }).click();
  await page.getByRole("heading", { name: "设置你的学习节奏" }).waitFor();
  await page.getByRole("button", { name: /创建词书/ }).click();
  await page.getByRole("heading", { name: /准备好了/ }).waitFor();
  await page.getByRole("link", { name: /立即开始背诵/ }).click();
  await page.getByRole("button", { name: /开始今日学习/ }).click();
  await page.getByRole("heading", { name: "casa" }).waitFor();
  await shot("390-card-front");
  await page.getByRole("button", { name: /查看答案/ }).click();
  await page.getByRole("heading", { name: "房子" }).waitFor();
  await shot("390-card-back");
  await page.getByRole("button", { name: /记得/ }).click();
  await page.getByRole("button", { name: /撤销/ }).click();
  assert.equal(await page.getByRole("button", { name: /困难/ }).count(), 1);
  await page.getByRole("button", { name: /困难/ }).click();
  await page.getByRole("button", { name: /下一张/ }).click();
  const state = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith("vocab-fsrs:"));
    return key ? JSON.parse(localStorage.getItem(key) || "{}") : {};
  });
  assert.equal(Object.values(state).length, 1, "Rated card must be stored immediately");
  assert.equal(Object.values(state)[0].hardCount, 1);
  assert.equal(Object.values(state)[0].goodCount, 0, "Undo must remove the earlier grade");
  await page.reload();
  await page.getByRole("heading", { name: "exam_sample" }).waitFor();
  assert.equal(await page.getByText(/已学过 1 张/).count(), 1);

  await page.setViewportSize({ width: 320, height: 700 });
  await shot("320-study-select");
  await page.getByRole("button", { name: /开始今日学习/ }).click();
  await shot("320-card-front");

  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto(ROOT + "/#/");
  await shot("1280-home");
  console.log("Browser smoke PASS: import, mobile widths, FSRS save, undo and reload");
} finally {
  await browser.close();
}
