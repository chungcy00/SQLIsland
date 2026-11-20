// Data contract shared by the import command, build and automated checks.
export function validateStructuredLesson(lesson, value) {
  const fail = message => { throw Error(`${lesson.id}: ${message}`); };
  const required = (text, label) => { if (typeof text !== 'string' || !text.trim()) fail(label); };
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const blocks = (items, label) => {
    if (!Array.isArray(items)) fail(label);
    for (const block of items) {
      if (['heading', 'paragraph'].includes(block.type)) required(block.text, label + '.text');
      else if (block.type === 'list') {
        if (!Array.isArray(block.items) || !block.items.length) fail(label + '.items');
        for (const item of block.items) required(typeof item === 'string' ? item : item.text, label + '.item');
      } else if (block.type === 'figure') { if (!Array.isArray(block.ids) || !block.ids.length || block.ids.some(id => typeof id !== 'string')) fail(label + '.figure'); }
      else if (block.type === 'table') result(block, label);
      else if (block.type === 'code') required(block.sql, label + '.sql');
      else fail(label + '.type');
      if (block.emphasis && (!Array.isArray(block.emphasis) || block.emphasis.some(word => !block.text?.includes(word)))) fail(label + '.emphasis');
    }
  };
  const result = (data, label) => {
    if (!Array.isArray(data?.columns) || !Array.isArray(data?.rows) || data.rows.some(row => row.length !== data.columns.length)) fail(label + '.result');
  };
  if (value.schemaVersion !== 1 || value.id !== lesson.id) fail('schemaVersion/id');
  if (!['concept', 'syntax', 'function', 'advanced', 'business'].includes(value.teachingKind)) fail('teachingKind');
  required(value.sourceBatch, 'sourceBatch'); required(value.sourcePath, 'sourcePath');
  if (!/^[a-f0-9]{64}$/.test(value.sourceSha256 || '')) fail('sourceSha256');
  blocks(value.conceptBlocks, 'conceptBlocks'); blocks(value.methodBlocks, 'methodBlocks'); blocks(value.resultBlocks, 'resultBlocks');
  // Concept source prose is retained exactly; comparisons are supplemental representations.
  const conceptText = value.conceptBlocks.map(block => block.type === 'paragraph' ? block.text : block.type === 'list' ? block.items.map(item => typeof item === 'string' ? item : item.text).join('') : '').join('');
  if (conceptText !== lesson.concept) fail('concept source text changed');
  required(value.syntax?.purpose, 'syntax.purpose'); required(value.problem, 'problem');
  if (!equal(value.completeCode, {mysqlSql: lesson.mysqlSql, sqliteSql: lesson.sqliteSql})) fail('complete SQL changed');
  if (!equal(value.expectedResult, lesson.result)) fail('expected result changed');
  for (const [name, description] of Object.entries(value.dataDescriptions || {})) {
    if (!lesson.sourceTables?.some(table => table.name === name)) fail('unknown data table ' + name);
    required(description, 'data description');
  }
  if (!Array.isArray(value.breakdown)) fail('breakdown');
  const normalized = sql => sql.replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
  for (const step of value.breakdown) {
    for (const key of ['title', 'sql', 'purpose', 'reason']) required(step[key], 'breakdown.' + key);
    if (step.kind === 'fragment') {
      if (!normalized(lesson.mysqlSql).includes(normalized(step.sql))) fail('fragment not in full query: ' + step.title);
    } else if (step.kind === 'runnable') {
      if (!Array.isArray(step.sourceTables) || !step.sourceTables.length) fail('runnable step requires self-contained tables');
      result(step.result, 'step');
    } else fail('breakdown.kind');
  }
  if (!Array.isArray(value.extensions)) fail('extensions');
  const originals = lesson.teaching?.mergeExamples || [];
  if (value.extensions.length !== originals.length) fail('extensions count');
  for (const [index, example] of value.extensions.entries()) {
    const original = originals[index];
    for (const key of ['label', 'sql', 'result', 'sourceTables']) if (!equal(example[key], original[key])) fail('extension changed: ' + key);
    blocks(example.explanationBlocks, 'extension.explanationBlocks');
  }
  for (const key of ['comparison', 'example', 'reason', 'correction', 'notes']) blocks(value.cautions?.[key], 'cautions.' + key);
  const plain = values => values.filter(block => block.type === 'paragraph').map(block => block.text).join('');
  if (plain(value.cautions.reason) === plain(value.cautions.comparison)) fail('duplicate comparison and cause');
  return value;
}
