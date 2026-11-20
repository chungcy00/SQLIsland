// “图示”数据契约（B9）：图示数据独立存放，不改动已转换课文；所有数值须能追溯到课程示例数据，并由执行检查核对。
const SLOTS = ['concept', 'syntax', 'breakdown'];
const KINDS = ['truth-table', 'clause-map', 'row-flow', 'stage-flow'];
const TRUTH = ['true', 'false', 'unknown'];
const ROLES = ['select', 'from', 'where', 'group', 'order'];
export function validateFigures(lesson, data) {
  const fail = message => { throw Error(`${lesson.id} figures: ${message}`); };
  const text = (value, label) => { if (typeof value !== 'string' || !value.trim()) fail(label); };
  const normalized = sql => sql.replace(/\s+/g, '').replace(/;$/, '').toLowerCase();
  if (data.schemaVersion !== 1 || data.id !== lesson.id) fail('schemaVersion/id');
  if (!Array.isArray(data.figures) || !data.figures.length) fail('figures');
  const ids = new Set();
  for (const figure of data.figures) {
    text(figure.id, 'id');
    if (ids.has(figure.id)) fail('duplicate id ' + figure.id);
    ids.add(figure.id);
    if (!SLOTS.includes(figure.slot)) fail('slot ' + figure.id);
    if (!KINDS.includes(figure.kind)) fail('kind ' + figure.id);
    text(figure.title, 'title ' + figure.id);
    const source = figure.table && lesson.sourceTables?.find(table => table.name === figure.table);
    const column = name => source?.columns.findIndex(item => item.name === name);
    if (figure.kind === 'clause-map') {
      text(figure.sql, 'sql ' + figure.id);
      if (normalized(figure.sql) !== normalized(lesson.sqliteSql)) fail('clause-map sql differs from the lesson query');
      if (!Array.isArray(figure.parts) || figure.parts.length < 2) fail('parts ' + figure.id);
      for (const part of figure.parts) { if (!ROLES.includes(part.role)) fail('role ' + figure.id); text(part.label, 'label'); text(part.sql, 'part sql'); text(part.note, 'note'); }
      if (normalized(figure.parts.map(part => part.sql).join(' ')) !== normalized(figure.sql)) fail('parts do not rebuild the query ' + figure.id);
      continue;
    }
    if (figure.kind === 'stage-flow') {
      // 每一步给出该步的列与行（由 SQL 执行核对）；skip 表示该步没有可独立展示的中间结果。
      const breakdown = lesson.presentation?.breakdown || [];
      if (figure.merge !== 'breakdown' || figure.slot !== 'breakdown') fail('stage-flow must merge into breakdown ' + figure.id);
      if (!Array.isArray(figure.steps) || figure.steps.length !== breakdown.length) fail('stage-flow steps must match the breakdown steps ' + figure.id);
      for (const [index, step] of figure.steps.entries()) {
        if (normalized(step.label) !== normalized(breakdown[index].sql)) fail('stage-flow label differs from breakdown step ' + (index + 1));
        if (step.skip) { if (step.sql || step.rows) fail('skipped step carries data ' + (index + 1)); continue; }
        text(step.sql, 'step sql');
        if (!Array.isArray(step.columns) || !step.columns.length || step.columns.some(name => typeof name !== 'string')) fail('step columns ' + (index + 1));
        if (!Array.isArray(step.rows) || step.rows.some(row => !Array.isArray(row) || row.length !== step.columns.length || row.some(value => value !== null && !['string', 'number'].includes(typeof value)))) fail('step rows ' + (index + 1));
        const whole = /^select \* from (\w+);?$/i.exec(step.sql.trim());
        const table = whole && lesson.sourceTables?.find(item => item.name === whole[1]);
        if (table && (JSON.stringify(step.rows) !== JSON.stringify(table.rows) || JSON.stringify(step.columns) !== JSON.stringify(table.columns.map(column => column.name)))) fail('first step differs from sample data ' + (index + 1));
      }
      const last = figure.steps.at(-1);
      if (last.skip || normalized(last.sql) !== normalized(lesson.sqliteSql)) fail('last step must be the full query ' + figure.id);
      if (JSON.stringify(last.rows) !== JSON.stringify(lesson.result.rows) || JSON.stringify(last.columns) !== JSON.stringify(lesson.result.columns)) fail('last step differs from the lesson result ' + figure.id);
      continue;
    }
    if (!source) fail('unknown table ' + figure.table);
    const key = column(figure.keyColumn || figure.keyColumn);
    if (key < 0 || key === undefined) fail('keyColumn ' + figure.id);
    if (figure.kind === 'truth-table') {
      text(figure.predicate, 'predicate'); text(figure.caption, 'caption');
      if (figure.rows.some(row => !TRUTH.includes(row.truth))) fail('truth ' + figure.id);
      if (figure.replacesTable) {
        // 图示取代课文里的同一张对照表：表中每一行都必须能在图示里找到相同的“值 → 真值 → 保留”。
        const table = lesson.presentation?.conceptBlocks.find(block => block.type === 'table');
        if (!table) fail('replacesTable needs a concept table ' + figure.id);
        const names = {true: ['真', '是'], false: ['假', '否'], unknown: ['未知', '否']};
        for (const [input, truth, kept] of table.rows) {
          const match = figure.rows.some(row => String(row.value === null ? 'NULL' : row.value) === input && names[row.truth][0] === truth && names[row.truth][1] === kept);
          if (!match) fail('figure does not cover concept table row ' + input);
        }
      }
      const value = column(figure.valueColumn);
      if (value < 0) fail('valueColumn ' + figure.id);
      if (figure.rows.length !== source.rows.length) fail('rows count ' + figure.id);
      for (const [index, row] of figure.rows.entries()) {
        if (!TRUTH.includes(row.truth)) fail('truth ' + figure.id);
        if (row.key !== source.rows[index][key] || row.value !== source.rows[index][value]) fail('row differs from sample data ' + figure.id);
      }
    } else {
      const allKeys = source.rows.map(row => row[key]);
      if (!Array.isArray(figure.steps) || figure.steps.length < 2) fail('steps ' + figure.id);
      for (const name of figure.columns || []) if (column(name) < 0) fail('column ' + name);
      let previous = allKeys;
      for (const step of figure.steps) {
        text(step.label, 'step label'); text(step.sql, 'step sql');
        if (!Array.isArray(step.keptKeys) || step.keptKeys.some(item => !previous.includes(item))) fail('keptKeys must be a subset of the previous step ' + figure.id);
        previous = step.keptKeys;
      }
      if (normalized(figure.steps.at(-1).sql) !== normalized(lesson.sqliteSql)) fail('last step must be the full query ' + figure.id);
      // 行数变化并入课文的“分步执行”：与 breakdown 逐步一一对应，标题须与该步 SQL 片段一致。
      const breakdown = lesson.presentation?.breakdown || [];
      if (figure.steps.length !== breakdown.length) fail('row-flow steps must match the breakdown steps ' + figure.id);
      for (const [index, step] of figure.steps.entries()) if (normalized(step.label) !== normalized(breakdown[index].sql)) fail('row-flow label differs from breakdown step ' + (index + 1));
    }
  }
  return data;
}
