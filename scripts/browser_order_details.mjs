import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

await mkdir("artifacts/ui", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, serviceWorkers: "block",
});
const page = await context.newPage();
page.on("pageerror", error => console.error("PAGE ERROR",error.stack || error.message));
const words = ["casa","olá","livro","amigo","falar","comer"];
const storage = async () => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith("vocab-fsrs:"));
  return key ? JSON.parse(localStorage.getItem(key) || "{}") : {};
});
const orderSaved = async () => page.evaluate(() => {
  const books = JSON.parse(localStorage.getItem("vocab-wordbooks") || "[]");
  return books[0]?.studyOrder;
});
async function assertSingleViewport(name) {
  const x = await page.evaluate(() => {
    const doc = document.documentElement;
    const btns = [...document.querySelectorAll(".v4-rating,.v4-confirm-grid button")];
    return {
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      documentWidth: doc.scrollWidth, documentHeight: doc.scrollHeight,
      overflow: getComputedStyle(doc).overflowY,
      buttons: btns.length,
      visible: btns.every(node => {
        const r = node.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight + 1 && r.width >= 50 && r.height >= 45;
      }),
    };
  });
  assert.equal(x.overflow,"hidden");
  assert.ok(x.documentHeight <= x.viewportHeight + 2,name+" vertical page overflow: "+JSON.stringify(x));
  assert.ok(x.documentWidth <= x.viewportWidth + 2,name+" horizontal page overflow: "+JSON.stringify(x));
  assert.equal(x.visible,true,name+" grading buttons must all fit");
  await page.screenshot({path:"artifacts/ui/"+name+".png",fullPage:false});
}
try {
  await page.goto("http://127.0.0.1:4173/#/import", {waitUntil:"networkidle"});
  await page.getByText("不想建 CSV？直接粘贴词语和释义").click();
  const cols = [
    "word","meaning","example","exampleZh","collocations","synonyms",
    "antonyms","variants","grammar","conjugation","notes","source","unit","pronunciation","独家备注",
  ];
  const lines = [
    cols.join("\t"),
    [
      "casa","房子","Esta casa é grande.","这间房子很大。","em casa",
      "lar","rua","casas","阴性名词，需要注意冠词配合",
      "这里保留原始表格中的完整变位或其他词形资料，不做任何截断。",
      "一段较长的原始备注，不能因为手机屏幕小而隐藏起来。",
      "课本第二章","Unit 2","/ˈkazɐ/","最后一列完整保留的特殊备注内容",
    ].join("\t"),
    ...words.slice(1).map((word,i)=>[word,"中文意思"+i,"","","","","","","","","","","","",""].join("\t")),
  ].join("\n");
  await page.locator(".paste-box textarea").fill(lines);
  await page.getByRole("button",{name:/解析粘贴内容/}).click();
  await page.getByRole("heading",{name:"选择词卡字段"}).waitFor();
  await page.getByRole("button",{name:/快速导入并学习/}).click();
  await page.getByRole("heading",{name:"casa"}).waitFor();
  assert.equal(await page.getByRole("button",{name:"顺序模式"}).getAttribute("aria-pressed"),"true");
  await assertSingleViewport("v5-order-sequential-front");

  // Random can use the full eligible deck, not just a cosmetic order label.
  await page.getByRole("button",{name:"随机模式"}).click();
  assert.equal(await page.getByRole("button",{name:"随机模式"}).getAttribute("aria-pressed"),"true");
  assert.equal(await orderSaved(),"random");
  assert.equal(Object.values(await storage()).length,0,"Order cannot grade words");
  await page.getByRole("button",{name:"顺序模式"}).click();
  await page.getByRole("heading",{name:"casa"}).waitFor();
  assert.equal(await orderSaved(),"sequential");
  await assertSingleViewport("v5-order-toggle-front");

  // Every imported field is on the answer page without opening any modal.
  await page.getByRole("button",{name:/认识 基本能想起/}).click();
  await page.getByRole("heading",{name:"房子"}).waitFor();
  await page.getByRole("region",{name:"完整补充资料"}).waitFor();
  assert.equal(await page.getByRole("button",{name:/查看完整资料/}).count(),0);
  const full = page.locator(".v5-data-entry");
  assert.ok((await full.count()) >= 13,"All mapped, default and custom attributes should render inline");
  const text = await page.locator(".v5-full-data").innerText();
  for(const phrase of ["这间房子很大。","em casa","lar","rua","casas","阴性名词",
    "完整变位或其他词形资料","一段较长的原始备注",
    "课本第二章","Unit 2","/ˈkazɐ/","最后一列完整保留的特殊备注内容"]){
    assert.ok(text.includes(phrase),"Missing imported field: "+phrase);
  }
  assert.equal(Object.keys(await storage()).length,0,"Revealing must not write an FSRS rating");
  await assertSingleViewport("v5-all-details-390");

  await page.setViewportSize({width:320,height:568});
  await assertSingleViewport("v5-all-details-320x568");
  const areaInfo=await page.locator(".v5-answer-scroll").evaluate(node=>{
    const total=node.scrollHeight,visible=node.clientHeight;
    node.scrollTop=total;
    const last=node.querySelector(".v5-data-entry:last-child");
    const frame=node.getBoundingClientRect(),end=last?.getBoundingClientRect();
    return {total,visible,lastVisible:!!end && end.bottom <= frame.bottom+2};
  });
  assert.ok(areaInfo.total >= areaInfo.visible, "Full details remain in the answer region");
  assert.ok(areaInfo.lastVisible, "The last imported field must be reachable without another tap");
  await page.screenshot({path:"artifacts/ui/v5-all-details-end-320.png",fullPage:false});
  await page.setViewportSize({width:390,height:844});

  // Reorder while revealing must not switch the active word or discard confidence.
  await page.getByRole("button",{name:"随机模式"}).click();
  await page.getByRole("heading",{name:"房子"}).waitFor();
  assert.equal(await page.locator(".rapid-v4").getAttribute("data-phase"),"answer");
  await page.getByRole("button",{name:/判断正确.*下一词/}).click();
  assert.equal(Object.values(await storage()).length,1);

  // Switching sequential mid-session preserves the active question and graded prefix.
  const active=await page.locator(".v4-wordframe h1").innerText();
  await page.getByRole("button",{name:"顺序模式"}).click();
  assert.equal(await page.locator(".v4-wordframe h1").innerText(),active);
  assert.equal(Object.values(await storage()).length,1);
  await page.getByRole("button",{name:"随机模式"}).click();
  assert.equal(await page.locator(".v4-wordframe h1").innerText(),active);
  const visited=[active];
  for(let i=0;i<4;i++){
    await page.getByRole("button",{name:/认识 基本能想起/}).click();
    await page.getByRole("button",{name:/判断正确.*下一词/}).click();
    if(await page.locator(".v4-wordframe h1").count()){
      visited.push(await page.locator(".v4-wordframe h1").innerText());
    }
  }
  assert.equal(new Set(visited).size,visited.length,"Random order should not duplicate unreviewed cards");

  // Preference stored in wordbook metadata survives a complete navigation/reload.
  await page.goto("http://127.0.0.1:4173/#/");
  await page.reload({waitUntil:"networkidle"});
  const order=await orderSaved();
  assert.equal(order,"random");
  await page.getByRole("link",{name:/进入词书/}).first().click();
  assert.equal(await page.getByRole("button",{name:"随机模式"}).getAttribute("aria-pressed"),"true");
  console.log("PASS: real random/sequential ordering, all attributes inline, long details reachable, no main-page scrolling, local order persistence");
} finally {await browser.close();}
