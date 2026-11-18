import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { formatSqlForDisplay } from '../src/sql-format.js';
const content = JSON.parse(fs.readFileSync('dist/content.json'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function visit(path, selector = 'main') {
  await page.goto('http://127.0.0.1:4173/#' + path);
  await page.locator(selector).first().waitFor();
  const id = path.split('/').pop();
  if (path.startsWith('/question/')) {
    await page.waitForFunction(id => document.querySelector('.question-meta small')?.textContent === id.toUpperCase(), id);
  } else if (path.startsWith('/lesson/') || path.startsWith('/chapter/')) {
    const item = path.startsWith('/lesson/') ? content.chapters.flatMap(c => c.knowledgePoints).find(k => k.id === id) : content.chapters.find(c => c.id === id);
    const titleSelector = path.startsWith('/lesson/') ? '.lesson-title' : '.appbar h1';
    await page.waitForFunction(({ title, selector }) => document.querySelector(selector)?.textContent === title, { title: item.title, selector: titleSelector });
  } else if (path.startsWith('/projects/')) {
    const title = { retail:'零售销售分析', inventory:'库存管理', ecommerce:'电商客户分析', finance:'财务数据分析', hr:'人力资源分析', procurement:'采购数据分析' }[id];
    await page.waitForFunction(title => document.querySelector('.appbar h1')?.textContent === title, title);
  }
}
try {
  for (const chapter of content.chapters) {
    await visit('/chapter/' + chapter.id, '.knowledge-row');
    assert.equal(await page.locator('.knowledge-row').count(), chapter.knowledgePoints.length);
    for (const kp of chapter.knowledgePoints) {
      await visit('/lesson/' + kp.id, '#note');
      assert.equal(await page.locator('.lesson-title').innerText(), kp.title);
      for (const selector of ['.lesson-intro', '.lesson-foundation']) {
        const style = await page.locator(selector).evaluate(n => ({ border: getComputedStyle(n).borderTopWidth, padding: getComputedStyle(n).padding }));
        assert.equal(style.border, '0px');
        assert.equal(style.padding, '0px');
      }
      const sharedExample = formatSqlForDisplay(kp.syntax) === formatSqlForDisplay(kp.mysqlSql);
      const sections = await page.locator('[data-lesson-section]').evaluateAll(nodes => nodes.map(n => n.dataset.lessonSection));
      assert.deepEqual(sections, ['purpose', 'concept', ...(!sharedExample ? ['syntax'] : []), 'steps', 'data', 'example']);
      const goal = (kp.learningObjective || kp.useCase || '').replace(/^(能够运用本节知识完成|在统一企业数据库中独立完成)[：:]\s*/, '');
      assert.equal(await page.locator('[data-lesson-section=purpose] p').innerText(), '能够运用本节知识完成：' + goal);
      assert.equal(await page.locator('[data-lesson-section=purpose] h2').count(), 0);
      if (kp.useCase !== goal) assert.equal(await page.locator('.lesson-scenario').innerText(), kp.useCase);
      assert.equal(await page.locator('.lesson-concept').textContent(), kp.concept);
      const completeSql = formatSqlForDisplay(kp.mysqlSql);
      const sqlBlocks = await page.locator('[data-lesson-section=example] pre code').allTextContents();
      assert.ok(sqlBlocks.includes(completeSql));
      if (sharedExample) assert.equal(await page.locator('[data-lesson-section=syntax]').count(), 0);
      assert.equal(await page.locator('.step').count(), kp.executionSteps.length);
      assert.equal(await page.locator('.step').first().evaluate(n => getComputedStyle(n).marginTop), '0px');
      assert.equal(await page.locator('.steps').evaluate(n => getComputedStyle(n).rowGap), '6px');
      assert.equal(await page.locator('.parameter-list li').count(), Object.keys(kp.parameters || {}).length);
      if (Object.keys(kp.parameters || {}).length) assert.equal(await page.locator('.parameter-list').evaluate(n => getComputedStyle(n).listStyleType), 'disc');
      assert.equal(await page.locator('.source-table').count(), kp.sourceTables.length);
      assert.equal(await page.locator('[data-lesson-section=data] > h2').innerText(), '示例数据');
      assert.equal(await page.locator('.source-table-label').count(), 0);
      assert.deepEqual(await page.locator('.source-table-name').allTextContents(), kp.sourceTables.map(t => t.name));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('.steps').evaluateAll(nodes => nodes.some(n => n.scrollWidth > n.clientWidth)), false);
      for (const code of await page.locator('.long-code > pre code').allTextContents()) assert.ok(code.length);
    }
  }
  for (const q of content.questions) {
    await visit('/question/' + q.id, '.quiz-title');
    assert.equal(await page.locator('.quiz-title').innerText(), q.title.split(' · ')[0]);
    assert.match(await page.locator('.question-location').innerText(), new RegExp('第 ' + Number(q.chapterId.slice(2)) + ' 章'));
    assert.equal(await page.locator('.sequence-actions button').count(), 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.notEqual(q.type, '结果预测');
  }
  await visit('/lesson/kp20-23', '#note');
  const height = await page.locator('main').evaluate(n => n.scrollHeight);
  assert.ok(height < 9818);
  const remaining = page.locator('.remaining-rows').first();
  if (await remaining.count()) {
    await remaining.locator('summary').click();
    assert.ok(await remaining.locator('tbody tr').count());
  }
  const longCode = page.locator('.long-code').first();
  await longCode.locator('summary').click();
  assert.equal(await longCode.getAttribute('open'), '');
  await visit('/lesson/kp01-01', '#note');
  assert.equal(await page.getByRole('button', { name: '上一节', exact: true }).isDisabled(), true);
  for (const selector of ['.mistake-comparison > div:first-child dt', '.mistake-comparison > div:first-child dd']) {
    assert.equal(await page.locator(selector).evaluate(n => getComputedStyle(n).color), 'rgb(163, 78, 70)');
  }
  await page.getByRole('button', { name: '下一节', exact: true }).click();
  await page.waitForURL('**/#/lesson/kp01-02');
  await visit('/question/q0003', '.quiz-title');
  await page.locator('[data-action=option][data-arg=A]').click();
  await page.getByRole('radio', { checked: true }).waitFor();
  await page.locator('[data-action=submitQuestion]').click();
  await page.locator('.option-explanation').first().waitFor();
  assert.equal(await page.locator('.option-explanation').count(), 4);
  assert.match(await page.locator('.judge-feedback').innerText(), /答案不符/);
  await page.locator('[data-action=adjacentQuestion]').last().click();
  await page.waitForURL('**/#/question/q0005');
  await visit('/question/q0048', '.quiz-title');
  assert.equal(await page.locator('#sql-editor').inputValue(), '');
  await page.locator('#sql-editor').fill(content.questions.find(q => q.id === 'q0048').referenceSolutions[0].mysqlSql);
  await page.locator('[data-action=submitQuestion]').click();
  await page.waitForFunction(() => document.querySelector('.judge-feedback')?.textContent.includes('回答正确'));
  assert.equal(await page.locator('[data-action=showAnswer]').isDisabled(), false);
  await visit('/question/q0009', '.quiz-title');
  await page.locator('#sql-editor').fill('SELECT 1 AS wrong;');
  await page.locator('[data-action=submitQuestion]').click();
  await page.waitForFunction(() => document.querySelector('.judge-feedback')?.textContent.includes('答案不符'));
  const comparison = page.locator('.judge-feedback details').first();
  assert.match(await comparison.innerText(), /公开数据结果对比/);
  await comparison.locator('summary').click();
  assert.equal(await comparison.locator('table').count(), 2);
  const hidden = await page.evaluate(async () => {
    const c = await fetch('content.json').then(r => r.json());
    const original = c.questions.find(q => q.id === 'q0009');
    const question = { ...original, testFixtures: [{ ...original.testFixtures.find(f => f.visibility === 'public'), visibility: 'hidden' }] };
    return new Promise((resolve, reject) => {
      const worker = new Worker('sql-worker.js');
      worker.onmessage = ({ data }) => { worker.terminate(); data.error ? reject(Error(data.error)) : resolve(data.result); };
      worker.onerror = error => { worker.terminate(); reject(error); };
      worker.postMessage({ id: 1, action: 'exercise', payload: { question, sql: 'SELECT 1 AS wrong;', submit: true } });
    });
  });
  assert.equal(hidden.result, undefined);
  assert.equal(hidden.publicComparison, undefined);
  assert.match(hidden.message, /隐藏场景未通过/);
  await visit('/practice', '.practice-selectors');
  await page.locator('[data-filter=type]').selectOption('选择');
  await page.locator('[data-filter=chapter]').selectOption('ch01');
  const scoped = content.questions.filter(q => q.type === '选择' && q.chapterId === 'ch01');
  await page.waitForFunction(count => document.querySelectorAll('.chapter-question-row').length === count, scoped.length);
  await page.locator('.chapter-question-row').first().click();
  await page.waitForURL('**/#/question/' + scoped[0].id);
  for (const q of scoped.slice(1)) {
    await page.locator('[data-action=adjacentQuestion]').last().click();
    await page.waitForURL('**/#/question/' + q.id);
    await page.waitForFunction(id => document.querySelector('.question-meta small')?.textContent === id.toUpperCase(), q.id);
  }
  assert.equal(await page.locator('[data-action=adjacentQuestion]').last().isDisabled(), true);
  await visit('/lesson/kp08-01', '#note');
  await page.locator('[data-action=lessonLab]').click();
  await page.waitForURL('**/#/lab/example-kp08-01');
  await page.locator('#sql-editor').waitFor();
  const kp = content.chapters.flatMap(c => c.knowledgePoints).find(k => k.id === 'kp08-01');
  assert.equal(await page.locator('#sql-editor').inputValue(), formatSqlForDisplay(kp.sqliteSql || kp.mysqlSql));
  await page.locator('[data-action=runLab]').click();
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('返回'));
  assert.ok(await page.locator('table').count());
  for (const project of ['retail', 'inventory', 'ecommerce', 'finance', 'hr', 'procurement']) {
    await visit('/projects/' + project, '.project-schema');
    assert.equal(await page.locator('.project-tasks .chapter-question-row').count(), content.questions.filter(q => q.chapterId === 'ch19' && q.projectId === project).length);
    await page.locator('.project-schema summary').click();
    assert.ok(await page.locator('.project-schema dt').count());
  }
  for (const width of [320, 390, 430, 975]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/lesson/kp20-23', '/question/q0251', '/question/q0003', '/projects/retail']) {
      await visit(path, path.startsWith('/lesson') ? '#note' : path.startsWith('/projects') ? '.project-schema' : '.quiz-title');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `.tooling/detail-${width}-${path.split('/').pop()}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log(`Verified 20 chapter pages, 80 knowledge points, 200 questions, six projects, navigation, SQL conversion, option explanations, public comparison and real lesson SQL execution. Complex lesson height ${height}px.`);
} finally { await browser.close(); }
