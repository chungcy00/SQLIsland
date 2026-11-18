import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonComplete, lessonNote, migrateLessonBookmarks } from '../src/curriculum-progress.js';
const migration = {
  targets: { source: ['target', 'second'] },
  historyTargets: { source: 'target' },
  sourceTitles: { source: '来源课程' },
  removed: ['deleted'],
};
test('merged completion requires both target and its assigned sources', () => {
  const state = {completed:['target'],notes:{},favorites:[]};
  assert.equal(lessonComplete(state,migration,'target'),false);
  state.completed.push('source');
  assert.equal(lessonComplete(state,migration,'target'),true);
  assert.equal(lessonComplete(state,migration,'second'),false);
});
test('source notes and bookmarks migrate without deleting the old records', () => {
  const state = {completed:['source'],notes:{source:'旧笔记',target:'目标笔记'},favorites:['source'],lastLesson:'source'};
  assert.match(lessonNote(state,migration,'target'),/目标笔记[\s\S]*旧笔记/);
  assert.equal(lessonNote(state,migration,'second'),'');
  migrateLessonBookmarks(state,migration);
  assert.equal(state.lastLesson,'target');
  assert.ok(state.favorites.includes('source') && state.favorites.includes('target'));
  assert.equal(state.notes.source,'旧笔记');
  assert.equal(migrateLessonBookmarks(state,migration),false);
});
