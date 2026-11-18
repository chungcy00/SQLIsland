import test from 'node:test';
import assert from 'node:assert/strict';
import { requirementSections, readingChunks } from '../src/lesson-presentation.js';

test('requirement display preserves formulas, null rules, output columns and ordering', () => {
  const text = '2025年门店；毛利=净销售-成本，分母为0返回NULL。\n输出字段名称及顺序：id, net_cents。输出顺序（含决胜键）：net_cents DESC,id。金额单位分。';
  const sections = requirementSections(text);
  assert.equal(sections.length, 3);
  assert.equal(sections.map((section, index) => (index ? section.label + '：' : '') + section.text).join(''), text);
  assert.deepEqual(requirementSections('保留全部重复记录。'), [{ label: '任务要求', text: '保留全部重复记录。' }]);
  assert.deepEqual(requirementSections(''), []);
});

test('long reading blocks preserve every character including formulas and punctuation', () => {
  const text = '近30日销量≥30且库存低于15日需求；零分母返回NULL。'.repeat(8) + '\n金额单位分。';
  assert.equal(readingChunks(text, true).join(''), text);
  assert.equal(readingChunks(text).join(''), text);
});
