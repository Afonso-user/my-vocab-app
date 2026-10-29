import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, serviceWorkers: "block",
});
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:4173/#/import", {waitUntil:"networkidle"});
  await page.getByText("不想建 CSV？直接粘贴词语和释义").click();
  await page.locator(".paste-box textarea").fill("casa\t房子\nolá\t你好");
  await page.getByRole("button", {name:/解析粘贴内容/}).click();
  await page.getByText(/识别到无表头的双列词表/).waitFor();
  await page.getByRole("button", {name:/快速导入并学习/}).click();
  await page.getByRole("heading", {name:"casa"}).waitFor();
  assert.equal(await page.getByRole("heading", {name:"房子"}).count(), 0);
  await page.setViewportSize({width:320,height:700});
  const xOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert.equal(xOverflow, false);
  await page.getByRole("button", {name:/认识 基本能想起/}).click();
  await page.getByRole("heading", {name:"房子"}).waitFor();
  await page.getByRole("button", {name:/判断正确.*下一词/}).click();
  await page.getByRole("heading", {name:"olá"}).waitFor();
  console.log("PASS: two-column paste -> preview -> two-step FSRS study on 320px mobile");
} finally {
  await browser.close();
}
