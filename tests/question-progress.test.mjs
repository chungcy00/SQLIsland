import test from 'node:test';
import assert from 'node:assert/strict';
import { isCurrentQuestionAttempt, questionDraft } from '../src/question-progress.js';
test('converted questions keep old records while SQL progress uses new SQL attempts', () => {
  const q = { previousExecutionMode:'predict_public_result', executionMode:'query_result' };
  const old = { pass:true, independent:true, input:'{"columns":["id"],"rows":[[1]]}' };
  assert.equal(isCurrentQuestionAttempt(old, q), false);
  assert.equal(isCurrentQuestionAttempt({...old,executionMode:'query_result',input:'SELECT id FROM orders'},q),true);
  assert.equal(isCurrentQuestionAttempt(old,{executionMode:'query_result'}),true);
  assert.deepEqual(questionDraft({prediction:'{}',answerShown:true,hints:3},q),{});
  assert.deepEqual(questionDraft({executionMode:'query_result',code:'SELECT 1'},q),{executionMode:'query_result',code:'SELECT 1'});
  assert.equal(old.pass,true);
});

test('redesigned and removed questions preserve history while isolating current completion', () => {
  const old = { pass: true, contentVersion: '4.2.2', executionMode: 'query_result' };
  const question = { gradingRevision: 'curriculum-20261119', executionMode: 'query_result' };
  assert.equal(isCurrentQuestionAttempt(old, question), false);
  assert.equal(isCurrentQuestionAttempt({...old, gradingRevision: question.gradingRevision}, question), true);
  assert.equal(isCurrentQuestionAttempt(old, undefined), false);
  assert.deepEqual(questionDraft({code:'SELECT old_result',hints:3},question),{});
  assert.equal(old.pass,true);
});
