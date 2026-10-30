import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const ROOT = "http://127.0.0.1:4173";
const OUT = "artifacts/ui";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1, serviceWorkers: "block",
});
const page = await context.newPage();
page.on("pageerror", err => console.error("PAGE ERROR", err.stack || err.message));

async function assertViewport(label, phase) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const footer = document.querySelector(".v4-actionbar");
    const choices = Array.from(document.querySelectorAll(".v4-rating"));
    const confirms = Array.from(document.querySelectorAll(".v4-confirm-grid button"));
    const buttons = choices.length ? choices : confirms;
    const rects = buttons.map(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    });
    const foot = footer?.getBoundingClientRect();
    return {
      viewportHeight: innerHeight, viewportWidth: innerWidth,
      documentHeight: root.scrollHeight, documentWidth: root.scrollWidth,
      overflowY: getComputedStyle(root).overflowY,
      controls: buttons.length, rects, footerBottom: foot?.bottom,
      phase: document.querySelector(".rapid-v4")?.getAttribute("data-phase"),
      noAudio: !document.querySelector("button[aria-label*=朗读]"),
    };
  });
  assert.equal(result.phase, phase, label + " phase");
  assert.equal(result.overflowY, "hidden", label + " no vertical scrolling");
  assert.ok(result.documentHeight <= result.viewportHeight + 2,
    label + " document overflow " + JSON.stringify(result));
  assert.ok(result.documentWidth <= result.viewportWidth + 2,
    label + " horizontal overflow " + JSON.stringify(result));
  assert.equal(result.controls, phase === "question" ? 4 : 2, label + " buttons count");
  assert.equal(result.noAudio, true);
  for (const r of result.rects) {
    assert.ok(r.width >= 54 && r.height >= 52 && r.top >= 0 && r.bottom <= result.viewportHeight + 1
      && r.left >= -1 && r.right <= result.viewportWidth + 1,
    label + " rating control outside viewport " + JSON.stringify(r));
  }
  assert.ok(result.footerBottom <= result.viewportHeight + 1, label + " footer invisible");
  await page.screenshot({ path: OUT + "/" + label + ".png", fullPage: false });
}

async function progress() {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith("vocab-fsrs:"));
    return key ? JSON.parse(localStorage.getItem(key) || "{}") : {};
  });
}

try {
  await page.goto(ROOT + "/#/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /我的词书/ }).waitFor();
  await page.getByRole("link", { name: /导入新词书/ }).click();
  await page.getByText("不想建 CSV？直接粘贴词语和释义").click();
  const tab = "\t", line = "\n";
  await page.locator(".paste-box textarea").fill([
    ["word","meaning","example","notes"].join(tab),
    ["casa","房子","Esta casa é grande.","考试易错点"].join(tab),
    ["olá","你好","Olá amigo!","问候语"].join(tab),
    ["livro","书","Este livro é novo.","名词"].join(tab),
  ].join(line));
  await page.getByRole("button",{name:/解析粘贴内容/}).click();
  await page.getByRole("heading", { name: "选择词卡字段" }).waitFor();
  await page.getByRole("button", { name: /高级设置/ }).click();
  await page.getByRole("heading", { name: "设置你的学习节奏" }).waitFor();
  await page.getByRole("button", { name: /创建词书/ }).click();
  await page.getByRole("heading", { name: /准备好了/ }).waitFor();
  await page.getByRole("link", { name: /立即开始背诵/ }).click();

  await page.getByRole("heading", { name: "casa" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "房子" }).count(), 0,
    "Do not leak the answer before a confidence decision");
  assert.equal(Object.keys(await progress()).length, 0);
  await assertViewport("390-front-only-word", "question");

  await page.getByRole("button", { name: /认识 基本能想起/ }).click();
  await page.getByRole("heading", { name: "房子" }).waitFor();
  assert.equal(Object.keys(await progress()).length, 0,
    "Selecting confidence must never write FSRS progress");
  await assertViewport("390-revealed-answer", "answer");

  await page.getByRole("button", { name: /记错了/ }).click();
  await page.getByRole("heading", { name: "olá" }).waitFor();
  let entries = Object.values(await progress());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].againCount, 1, "Wrong answer must override optimistic confidence");
  assert.equal(entries[0].goodCount, 0);

  await page.getByRole("button", { name: /撤销上次判断/ }).click();
  await page.getByRole("heading", { name: "casa" }).waitFor();
  assert.equal(Object.keys(await progress()).length, 0, "Undo must restore storage");

  await page.keyboard.press("2");
  await page.getByRole("heading", { name: "房子" }).waitFor();
  assert.equal(Object.keys(await progress()).length, 0, "Keyboard grade also needs confirmation");
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "olá" }).waitFor();
  entries = Object.values(await progress());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].hardCount, 1);

  await page.setViewportSize({ width: 320, height: 700 });
  await assertViewport("320-front", "question");
  await page.setViewportSize({ width: 320, height: 568 });
  await assertViewport("320-front-short", "question");

  await page.getByRole("button", { name: /不认识/ }).click();
  await page.getByRole("heading", { name: "你好" }).waitFor();
  await assertViewport("320-answer-short", "answer");
  await page.getByRole("button", { name: /判断正确.*下一词/ }).click();
  await page.getByRole("heading", { name: "livro" }).waitFor();
  entries = Object.values(await progress());
  assert.equal(entries.length, 2);
  assert.equal(entries.filter(r => r.againCount === 1).length, 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "突击" }).click();
  await assertViewport("390-cram-front", "question");
  await page.getByRole("button", { name: /很熟/ }).click();
  await assertViewport("390-cram-answer", "answer");
  const beforeCram = await progress();
  await page.getByRole("button", { name: /记错了/ }).click();
  const afterCram = await progress();
  const changed = Object.keys(afterCram).find(key => afterCram[key].cramLastGrade === "again");
  assert.ok(changed, "Cram must preserve mistake judgment");
  assert.deepEqual(afterCram[changed].fsrs, beforeCram[changed]?.fsrs,
    "Cram judgments cannot mutate FSRS schedules");
  await page.setViewportSize({ width: 1280, height: 850 });
  await assertViewport("1280-front", "question");
  await page.getByRole("button", { name: /认识 基本能想起/ }).click();
  await assertViewport("1280-answer", "answer");

  console.log("PASS: two-stage reveal, confirmed-only FSRS, wrong override, undo, cram, zero scroll at 320/390/1280");
} finally {
  await browser.close();
}
