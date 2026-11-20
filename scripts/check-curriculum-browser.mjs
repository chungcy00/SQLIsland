import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:4173/';
const content = await (await fetch(base + 'content.json')).json();
const points = content.chapters.flatMap(chapter => chapter.knowledgePoints);
assert.equal(points.length, 80);
assert.equal(content.questions.length, 200);
assert.equal(content.cards.length, 200);
const browser = await chromium.launch({channel:'chrome', headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function visit(path, selector) {
  await page.goto(base + '#' + path);
  await page.locator(selector).first().waitFor();
}

try {
  await visit('/learn', '.chapter-list');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('sql-shouji', 1);
    open.onsuccess = () => {
      const tx = open.result.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const request = store.get('state');
      request.onsuccess = () => {
        const state = request.result;
        state.curriculumBookmarksMigrated = false;
        state.completed = ['kp08-02','kp08-06','kp08-04','kp14-02','kp19-01'];
        state.favorites = ['kp08-06'];
        state.notes = {'kp08-02':'LEFT JOIN','kp08-06':'旧笔记保留','kp14-02':'已删除的旧笔记'};
        state.lastLesson = 'kp08-06';
        state.attempts = [
          { id:'old-rewrite', questionId:'q0255', pass:true, independent:true, input:'SELECT 1', time:'2026-11-01T00:00:00Z' },
          { id:'removed', questionId:'q0001', pass:true, independent:true, input:'SELECT 1', time:'2026-11-01T00:00:00Z' },
        ];
        state.drafts.q0255 = { code:'SELECT 123 AS stale', hints:3, answerShown:true };
        store.put(state, 'state');
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }));
  await page.reload();
  await page.getByText('1 / 80 已学', {exact:true}).waitFor();
  await visit('/lesson/kp08-06', '#note[data-id=kp08-02]');
  assert.match(await page.locator('#note').inputValue(), /LEFT JOIN[\s\S]+旧笔记保留/);
  await page.locator('#note').fill('合并后笔记');
  await page.locator('[data-action=saveLessonNote]').click();
  await page.locator('#note-status').getByText('已保存').waitFor();
  await page.reload();
  assert.equal(await page.locator('#note').inputValue(), '合并后笔记');
  await visit('/lesson/kp08-04', '#note[data-id=kp08-04]');
  assert.doesNotMatch(await page.locator('#note').inputValue(), /旧笔记保留/);
  await visit('/practice', '.route-summary');
  assert.match(await page.locator('.route-summary').innerText(), /0 \/ 200/);
  await visit('/question/q0255', '#sql-editor[data-id=q0255]');
  assert.equal(await page.locator('#sql-editor').inputValue(), '');
  await page.locator('[data-action=hint]').click();
  assert.equal(await page.locator('#sql-editor').inputValue(), '');

  // B5（用户修改 2026-11-20）：上一题/下一题位于页面内容末尾，不再固定在屏幕底部
  for (const width of [320,390,975]) {
    await page.setViewportSize({width,height:844});
    const footer = page.locator('.quiz-details .sequence-actions');
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await footer.evaluate(node => getComputedStyle(node).position), 'static');
    assert.equal(await footer.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await footer.evaluate(node => node === node.parentElement.lastElementChild), true);
    const firstButton = await footer.locator('button').first().boundingBox();
    const question = await page.locator('.quiz-details').boundingBox();
    assert.ok(Math.abs(firstButton.x - question.x) <= 1);
    await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); document.querySelector('.quiz-bottom')?.scrollTo(0, 1e6); }); // 作答页的上一题/下一题位于下方独立滚动区的末尾
    const atBottom = await footer.boundingBox();
    assert.ok(atBottom.y + atBottom.height <= 844 - 8 + 1, 'footer ends with spacing above the viewport bottom');
    await page.locator('[data-action=quizTab][data-arg=数据表]').click();
    await page.locator('.source-table').first().waitFor();
    await footer.getByRole('button', {name:'下一题'}).click({trial:true});
    await page.locator('[data-action=quizTab][data-arg=题目]').click();
    await page.locator('#sql-editor').waitFor();
  }

  for (const q of content.questions.filter(q => q.gradingRevision)) {
    await visit('/question/'+q.id, '#sql-editor[data-id='+q.id+']');
    await page.locator('#sql-editor').fill(q.referenceSolutions[1].mysqlSql);
    const submit = page.locator('[data-action=submitQuestion]');
    await submit.evaluate(button => {
      const header = document.querySelector('.appbar').getBoundingClientRect();
      const controls = document.querySelector('.keyboard-wrap:not(.hidden), .quiz-details .sequence-actions');
      const footer = controls.getBoundingClientRect();
      const position = button.getBoundingClientRect();
      window.scrollBy(0, (position.top + position.bottom - header.bottom - footer.top) / 2);
    });
    await submit.click();
    await page.locator('.judge-feedback').getByText('回答正确',{exact:true}).waitFor({timeout:60000});
  }

  for (const k of points) {
    await visit('/lesson/'+k.id, '#note[data-id='+k.id+']');
    const sections = await page.locator('[data-lesson-section]').evaluateAll(nodes => nodes.map(node => node.dataset.lessonSection));
    assert.ok(sections.indexOf('steps') < sections.indexOf('example'), k.id);
    assert.equal(await page.locator('#lesson-result table').count(),0,k.id);
    // 已转换课文：检查点以“分步执行”的可运行步骤显示，扩展示例仍是 .lesson-checkpoint
    assert.equal(await page.locator('.lesson-checkpoint').count(),(k.presentation?0:k.teaching.checkpoints.length)+k.teaching.mergeExamples.length,k.id);
    if(k.presentation)assert.equal(await page.locator('.step-item').count(),k.presentation.breakdown.length,k.id);
    await page.locator('[data-action=lessonRun]').click();
    await page.waitForFunction(() => document.querySelector('#lesson-result small')?.textContent.includes('本次 SQLite'),{},{timeout:6000}).catch(async error => {
      throw Error(k.id+' '+(await page.locator('#snackbar').textContent())+' '+error.message);
    });
    const rows = k.result.totalRows ?? k.result.rows.length;
    assert.match(await page.locator('#lesson-result small').innerText(), new RegExp(' · '+ rows +' 行'),k.id);
    assert.equal((await page.locator('.lesson-result-explanation p').allInnerTexts()).join(''),k.teaching.resultExplanation,k.id);
  }
  assert.deepEqual(errors,[]);
  console.log('80 browser lesson executions, four rewritten submissions, 80/200/200 counts, fixed separator-free footer, and historical-state migration passed.');
} finally {
  await browser.close();
}
