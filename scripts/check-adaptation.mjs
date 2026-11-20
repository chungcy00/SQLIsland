// B11 适配检查（桌面 Chrome 模拟，非真机）：多档手机宽度下无整页横向溢出、触控区尺寸、
// 系统字体放大 1.3 倍、系统“减少动画”（Chromium 真实 reducedMotion 模拟）。
// 需要先 `npm run preview`（127.0.0.1:4173）。结果写入 artifacts/adaptation-report.json。
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base = 'http://127.0.0.1:4173/#';
const routes = ['/', '/learn', '/practice', '/cards', '/mine', '/stats', '/updates', '/settings', '/lab', '/review', '/lesson/kp03-01', '/lesson/kp05-01', '/lesson/kp08-02', '/lesson/kp08-05', '/lesson/kp15-02', '/lesson/kp19-02', '/question/q0009', '/question/q0207', '/projects/retail'];
const widths = [320, 360, 390, 430];
const browser = await chromium.launch({channel: 'chrome', headless: true});
const report = {overflow: [], smallTargets: {}, fontScale: [], reducedMotion: {}};
const errors = [];
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const visit = async route => { await page.goto(base + route); await page.locator('.appbar').waitFor(); await page.waitForTimeout(700); };
  const measure = () => page.evaluate(() => {
    const visible = element => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const small = [...document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, summary')].filter(visible).map(element => {
      const r = element.getBoundingClientRect();
      return {tag: element.tagName.toLowerCase(), cls: String(element.className).slice(0, 40), text: (element.innerText || element.getAttribute('aria-label') || '').trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height)};
    }).filter(item => item.h < 44 && item.w < 44);
    return {overflow: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth, small};
  });
  // 1. 多档宽度：整页无横向溢出；统计触控区小于 44×44 的元素
  for (const width of widths) {
    await page.setViewportSize({width, height: 844});
    for (const route of routes) {
      await visit(route);
      const result = await measure();
      if (result.overflow) report.overflow.push({width, route, scrollWidth: result.scrollWidth});
      if (width === 390) report.smallTargets[route] = result.small;
    }
  }
  // 2. 系统字体放大 1.3 倍（把根字号放大到 130%）
  for (const width of [360, 390]) {
    await page.setViewportSize({width, height: 844});
    for (const route of routes) {
      await page.goto(base + route); await page.locator('.appbar').waitFor();
      await page.evaluate(() => { document.documentElement.style.fontSize = '130%'; });
      await page.waitForTimeout(500);
      const result = await measure();
      if (result.overflow) report.fontScale.push({width, route, scrollWidth: result.scrollWidth});
    }
  }
  // 3. 减少动画：用 Chromium 的真实 prefers-reduced-motion 模拟
  await page.setViewportSize({width: 390, height: 844});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await visit('/lesson/kp14-01');
  await page.getByRole('button', {name: /完成学习|已完成学习/}).first().click().catch(() => {});
  await page.waitForTimeout(600);
  const milestone = await page.evaluate(() => {
    const dialog = document.querySelector('.dialog.celebrate');
    const svg = dialog?.querySelector('svg');
    const on = dialog ? dialog.querySelectorAll('.tile.on').length : null;
    const flag = dialog?.querySelector('#flag');
    return {dialog: !!dialog, tilesOn: on, flagOpacity: flag ? getComputedStyle(flag).opacity : null, flagTransform: flag?.style.transform || '', animations: document.getAnimations().length};
  });
  report.reducedMotion = milestone;
  await writeFile('artifacts/adaptation-report.json', JSON.stringify({widths, routes: routes.length, ...report, errors}, null, 2));
  console.log(JSON.stringify({routes: routes.length, overflow: report.overflow, fontScaleOverflow: report.fontScale, reducedMotion: milestone, smallTargetCounts: Object.fromEntries(Object.entries(report.smallTargets).map(([k, v]) => [k, v.length])), errors}));
  assert.deepEqual(report.overflow, []);
  assert.deepEqual(report.fontScale, []);
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
