// “图示”数据契约（B9）：图示数据独立存放，不改动已转换课文；所有数值须能追溯到课程示例数据，并由执行检查核对。
const SLOTS = ['concept', 'syntax', 'breakdown', 'problem'];
const KINDS = ['truth-table', 'clause-map', 'row-flow', 'stage-flow', 'metric-card', 'function-map', 'join-map', 'compare-card', 'page-map', 'flow-map', 'tip-card'];
const TRUTH = ['true', 'false', 'unknown'];
const ROLES = ['select', 'from', 'where', 'group', 'having', 'order', 'limit', 'cte', 'setop'];
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
    if (figure.conclusion !== undefined) text(figure.conclusion, 'conclusion ' + figure.id);
    if (figure.kind === 'tip-card') {
      // 提示卡：每条提示必须逐字引用课文（概念、使用要点、易错点），不新增课文里没有的说法。
      if (figure.slot !== 'concept' || figure.merge) fail('tip-card belongs to the concept slot ' + figure.id);
      if (!Array.isArray(figure.items) || figure.items.length < 2 || figure.items.length > 4) fail('items ' + figure.id);
      const corpus = [];
      const walk = value => { if (typeof value === 'string') corpus.push(value); else if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') Object.values(value).forEach(walk); };
      walk(lesson.presentation?.conceptBlocks); walk(lesson.presentation?.cautions);
      const all = corpus.join('\n');
      for (const item of figure.items) {
        if (!['good', 'bad', 'neutral'].includes(item.tone)) fail('item tone ' + figure.id);
        text(item.label, 'item label ' + figure.id); text(item.text, 'item text ' + figure.id);
        if (!all.includes(item.text)) fail('tip text is not quoted from the lesson: ' + item.text);
      }
      continue;
    }
    if (figure.kind === 'flow-map') {
      // 处理前 → 处理中 → 处理后：每个阶段的每张表都带 sql，由 check-figures 实际执行核对；标 source 的表必须等于课程示例表（按所列列）。
      if (figure.slot !== 'concept' || figure.merge) fail('flow-map belongs to the concept slot ' + figure.id);
      const variants = figure.variants || [{stages: figure.stages, conclusion: figure.conclusion}];
      if (!variants.length || variants.length > 3) fail('variants ' + figure.id);
      for (const variant of variants) {
        if (!Array.isArray(variant.stages) || variant.stages.length < 2 || variant.stages.length > 4) fail('stages ' + figure.id);
        if (variants.length > 1) text(variant.label, 'variant label ' + figure.id);
        if (variant.conclusion !== undefined) text(variant.conclusion, 'variant conclusion ' + figure.id);
        for (const stage of variant.stages) {
          text(stage.label, 'stage label ' + figure.id);
          if (stage.via !== undefined) text(stage.via, 'stage via ' + figure.id);
          if (!Array.isArray(stage.tables) || !stage.tables.length || stage.tables.length > 2) fail('stage tables ' + figure.id);
          for (const tbl of stage.tables) {
            text(tbl.sql, 'table sql ' + figure.id);
            if (!/^(select|with)\b/i.test(tbl.sql.trim())) fail('table sql must be a SELECT ' + figure.id);
            if (!Array.isArray(tbl.columns) || !tbl.columns.length || !Array.isArray(tbl.rows) || tbl.rows.some(row => !Array.isArray(row) || row.length !== tbl.columns.length)) fail('table rows ' + figure.id);
            if (tbl.tags !== undefined && (!Array.isArray(tbl.tags) || tbl.tags.length !== tbl.rows.length || tbl.tags.some(tag => tag !== null && (typeof tag.text !== 'string' || !['take', 'skip', 'beyond', 'merge', 'tie'].includes(tag.tone))))) fail('table tags ' + figure.id);
            if (tbl.bandBy !== undefined && ![].concat(tbl.bandBy).every(name => tbl.columns.includes(name))) fail('bandBy ' + figure.id);
            if (tbl.source) {
              const src = lesson.sourceTables?.find(item => item.name === tbl.source) || fail('unknown source table ' + tbl.source);
              const idx = tbl.columns.map(name => { const i = src.columns.findIndex(c => c.name === name); if (i < 0) fail('unknown column ' + name); return i; });
              if (JSON.stringify(src.rows.map(row => idx.map(i => row[i]))) !== JSON.stringify(tbl.rows)) fail('source table rows differ from the sample data ' + figure.id);
            }
          }
        }
      }
      continue;
    }
    if (figure.kind === 'page-map') {
      // 分页位置示意图：用课程示例表按排序键排好，展示每一页“跳过 / 本次取出 / 超出取出范围”哪些记录；取出的记录由 check-figures 用 LIMIT/OFFSET 实际执行核对。
      if (figure.slot !== 'concept' || figure.merge) fail('page-map belongs to the concept slot ' + figure.id);
      const tbl = lesson.sourceTables?.find(item => item.name === figure.table) || fail('unknown table ' + figure.table);
      const idx = name => { const i = tbl.columns.findIndex(c => c.name === name); if (i < 0) fail('unknown column ' + name); return i; };
      const shown = figure.columns.map(idx);
      const keys = (figure.orderKeys || []).map(k => ({i: idx(k.column), sign: k.dir === 'desc' ? -1 : 1}));
      if (!keys.length) fail('orderKeys ' + figure.id);
      const sorted = [...tbl.rows].sort((a, b) => { for (const k of keys) { if (a[k.i] === b[k.i]) continue; return (a[k.i] < b[k.i] ? -1 : 1) * k.sign; } return 0; }).map(row => shown.map(i => row[i]));
      if (JSON.stringify(sorted) !== JSON.stringify(figure.rows)) fail('rows differ from the sample data sorted by orderKeys ' + figure.id);
      if (!Number.isInteger(figure.pageSize) || figure.pageSize < 1) fail('pageSize ' + figure.id);
      if (!normalized(lesson.sqliteSql).includes(normalized('ORDER BY ' + figure.orderBy))) fail('orderBy is not in the lesson query ' + figure.id);
      if (!Array.isArray(figure.pages) || !figure.pages.length || figure.pages.some(page => page.offset !== (page.page - 1) * figure.pageSize)) fail('pages must follow offset = (page - 1) * pageSize ' + figure.id);
      const ex = figure.example;
      if (!ex || !Number.isInteger(ex.limit) || !Number.isInteger(ex.offset) || ex.limit < 1 || ex.offset < 0) fail('example limit/offset ' + figure.id);
      if (!normalized(lesson.sqliteSql).includes(normalized(`LIMIT ${ex.limit} OFFSET ${ex.offset}`))) fail('example is not the lesson query ' + figure.id);
      if (figure.pagesNote !== undefined) text(figure.pagesNote, 'pagesNote ' + figure.id);
      continue;
    }
    if (figure.kind === 'compare-card') {
      // 对比卡：并列几块“原始数据 → 处理 → 数字”，大数字由 check.sql 实际执行核对（见 check-figures）。
      if (figure.slot !== 'concept' || figure.merge) fail('compare-card belongs to the concept slot ' + figure.id);
      if (!Array.isArray(figure.panels) || figure.panels.length < 2 || figure.panels.length > 3) fail('panels ' + figure.id);
      for (const panel of figure.panels) {
        text(panel.label, 'panel label'); if (!['bad', 'good', 'neutral'].includes(panel.tone)) fail('panel tone ' + figure.id);
        if (!Array.isArray(panel.columns) || !Array.isArray(panel.rows) || panel.rows.some(row => row.length !== panel.columns.length)) fail('panel table ' + figure.id);
        text(panel.big?.label, 'big label'); if (panel.big?.value === undefined) fail('big value ' + figure.id);
        text(panel.check?.sql, 'check sql'); if (JSON.stringify(panel.check.expected) !== JSON.stringify([[panel.big.value]])) fail('check expected must equal the big number ' + figure.id);
      }
      continue;
    }
    if (figure.kind === 'function-map' || figure.kind === 'join-map') {
      if (figure.slot !== 'concept' || figure.merge) fail(figure.kind + ' belongs to the concept slot ' + figure.id);
      const sqlText = [lesson.sqliteSql, lesson.mysqlSql].map(normalized);
      const inQuery = (value, label) => { text(value, label + ' ' + figure.id); if (!sqlText.some(sql => sql.includes(normalized(value)))) fail(label + ' is not in the lesson query: ' + value); };
      const sameRow = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const tableOf = name => lesson.sourceTables?.find(item => item.name === name) || fail('unknown table ' + name);
      const cols = (tbl, names) => names.map(name => { const i = tbl.columns.findIndex(c => c.name === name); if (i < 0) fail('unknown column ' + name); return i; });
      const concept = (lesson.presentation?.conceptBlocks || []).map(block => block.text || (block.items || []).map(item => item.text || item).join('\n')).join('\n');
      if (figure.caption !== undefined && !concept.includes(figure.caption)) fail('caption is not quoted from the lesson concept ' + figure.id);
      if (figure.kind === 'function-map') {
        if (!['scalar', 'aggregate', 'window'].includes(figure.form)) fail('form ' + figure.id);
        const tbl = tableOf(figure.table), idx = cols(tbl, figure.inputColumns || []);
        if (!idx.length) fail('inputColumns ' + figure.id);
        if (!Array.isArray(figure.outputs) || !figure.outputs.length || figure.outputs.length > 3) fail('outputs ' + figure.id);
        const expected = tbl.rows.map(row => idx.map(i => row[i])).map(row => JSON.stringify(row)).sort();
        if (!Array.isArray(figure.inputRows) || JSON.stringify(figure.inputRows.map(row => JSON.stringify(row)).sort()) !== JSON.stringify(expected)) fail('inputRows differ from the sample data ' + figure.id);
        for (const output of figure.outputs) {
          text(output.label, 'output label'); inQuery(output.sql, 'function call');
          if (figure.form === 'aggregate') { if (output.value === undefined || Array.isArray(output.values)) fail('aggregate output needs one value ' + figure.id); }
          else if (!Array.isArray(output.values) || output.values.length !== figure.inputRows.length) fail('output values must match the input rows ' + figure.id);
        }
        text(figure.orderBy, 'orderBy ' + figure.id);
      } else {
        if (!['inner', 'left', 'right', 'full'].includes(figure.joinType)) fail('joinType ' + figure.id);
        const left = tableOf(figure.left.table), right = tableOf(figure.right.table);
        const lk = cols(left, [figure.left.key])[0], rk = cols(right, [figure.right.key])[0];
        const ls = cols(left, figure.left.show), rs = cols(right, figure.right.show);
        inQuery(figure.on, 'join condition'); text(figure.sql, 'sql ' + figure.id);
        // 按样例数据重新做一遍等值连接，图中的匹配/未匹配必须与之完全一致（NULL 不匹配）。
        // rightFilter（可选）表示写在 ON 里的右表条件：先过滤右表再匹配，其字面值必须出现在课文查询里。
        const filter = figure.rightFilter;
        let rightRows = right.rows;
        if (filter) {
          const fi = cols(right, [filter.column])[0];
          for (const literal of [filter.gte, filter.lt]) inQuery(String(literal), 'rightFilter value');
          rightRows = right.rows.filter(r => r[fi] >= filter.gte && r[fi] < filter.lt);
        }
        const keepLeft = ['left', 'full'].includes(figure.joinType), keepRight = ['right', 'full'].includes(figure.joinType);
        const expected = [];
        for (const l of left.rows) {
          const hits = rightRows.filter(r => l[lk] !== null && r[rk] !== null && l[lk] === r[rk]);
          if (hits.length) for (const r of hits) expected.push({left: ls.map(i => l[i]), right: rs.map(i => r[i]), kept: true});
          else expected.push({left: ls.map(i => l[i]), right: null, kept: keepLeft});
        }
        for (const r of right.rows) if (!(rightRows.includes(r) && left.rows.some(l => l[lk] !== null && r[rk] !== null && l[lk] === r[rk]))) expected.push({left: null, right: rs.map(i => r[i]), kept: keepRight});
        const norm = list => JSON.stringify((list || []).map(pair => JSON.stringify([pair.left, pair.right, pair.kept])).sort());
        if (!Array.isArray(figure.pairs) || norm(figure.pairs) !== norm(expected)) fail('pairs differ from the sample data ' + figure.id);
      }
      continue;
    }
    if (figure.kind === 'metric-card') {
      // 指标公式卡 v2：名称 → 含义 → 中文公式 → 数值示例 → 结果解读 → 对应 SQL → 特殊情况。
      // 数值示例取自课程已验证的结果行（或经 check.sql 在课程数据上实际执行核对），公式与结果由校验器重新计算；
      // 范围/易错口径必须是课文原句的片段，不新增、不改写指标定义。
      if (figure.slot !== 'concept' || figure.merge) fail('metric-card belongs to the concept slot ' + figure.id);
      const sql = normalized(lesson.sqliteSql);
      for (const key of ['meaning', 'interpretation']) text(figure[key], key + ' ' + figure.id);
      text(figure.formula?.lhs, 'formula lhs ' + figure.id); text(figure.formula?.numerator, 'formula numerator ' + figure.id);
      if (figure.formula.denominator !== undefined) text(figure.formula.denominator, 'formula denominator ' + figure.id);
      if (!figure.interpretation.includes('{result}')) fail('interpretation must mention {result} ' + figure.id);
      const lines = figure.sql?.lines;
      if (!Array.isArray(lines) || !lines.length) fail('sql lines ' + figure.id);
      for (const line of lines) { text(line, 'sql line ' + figure.id); if (!sql.includes(normalized(line))) fail('sql line is not in the lesson query: ' + line); }
      const example = figure.example;
      const sourceResult = example?.source === 'result' ? lesson.result : lesson.presentation?.breakdown?.[example?.source?.step]?.result;
      if (!sourceResult) fail('example source ' + figure.id);
      const row = sourceResult.rows[example.row];
      if (!row) fail('example row ' + figure.id);
      const values = {};
      for (const input of example.inputs || []) {
        text(input.name, 'input name'); text(input.label, 'input label');
        if (input.column !== undefined) {
          const at = sourceResult.columns.indexOf(input.column);
          if (at < 0) fail('input column ' + input.column);
          if (row[at] !== input.value) fail('input value differs from the lesson data ' + figure.id + ':' + input.column);
        } else { if (typeof input.value !== 'number') fail('input value ' + figure.id); text(input.check?.sql, 'input check sql ' + figure.id); }
        values[input.name] = input.value;
      }
      if (!example.inputs?.length) fail('example inputs ' + figure.id);
      if (!/^[0-9a-zA-Z_+\-*/(). ]+$/.test(example.calc || '')) fail('calc ' + figure.id);
      const calc = Function('"use strict"; const v = arguments[0]; return (' + example.calc.replace(/[a-zA-Z_][a-zA-Z_0-9]*/g, name => { if (!(name in values)) fail('calc uses an unknown input ' + name); return 'v.' + name; }) + ');')(values);
      const decimals = example.result?.decimals;
      if (!Number.isInteger(decimals)) fail('result decimals ' + figure.id);
      const rounded = Math.round(calc * 10 ** decimals) / 10 ** decimals;
      if (Math.abs(rounded - example.result.value) > 1e-9) fail(`result value ${example.result.value} differs from the calculation ${rounded} ${figure.id}`);
      if (example.result.column !== undefined) {
        const resultRow = lesson.result.rows[example.resultRow ?? example.row];
        const at = lesson.result.columns.indexOf(example.result.column);
        if (at < 0 || !resultRow || Math.abs(resultRow[at] - example.result.value) > 1e-9) fail('result differs from the lesson result column ' + figure.id);
      }
      text(example.process, 'process ' + figure.id);
      const problem = lesson.presentation?.problem || '';
      const cautions = Object.values(lesson.presentation?.cautions || {}).flat().map(block => block.text || '').join('\n');
      for (const note of figure.notes || []) {
        text(note.text, 'note text ' + figure.id);
        if (note.kind === 'range') { if (!problem.includes(note.text)) fail('range note is not quoted from the lesson problem: ' + note.text); }
        else if (note.kind === 'pitfall') { if (!cautions.includes(note.text)) fail('pitfall note is not quoted from the lesson cautions: ' + note.text); }
        else if (note.kind === 'derived') {
          const rules = {
            'zero-denominator': ['分母为 0 时，结果为空（NULL），不会报错，也不会写成 0。', /nullif/i.test(lesson.sqliteSql)],
            'unit-cents': ['金额的单位是分，不是元。', /马币分|单位为马币分|金额以马币分/.test(problem + lesson.concept)],
          };
          const rule = rules[note.rule];
          if (!rule || note.text !== rule[0] || !rule[1]) fail('derived note ' + note.rule + ' ' + figure.id);
        } else fail('note kind ' + figure.id);
      }
      continue;
    }
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
      const limited = figure.steps.at(-1);
      if (limited.roles) {
        // 分页步骤：标出 跳过 / 本次取出 / 超出取出范围，必须与 LIMIT n OFFSET m 和取出的行一致。
        const match = /limit\s+(\d+)\s+offset\s+(\d+)/i.exec(limited.sql);
        const before = figure.steps.slice(0, -1).filter(step => !step.skip).at(-1);
        if (!match || !before) fail('roles need LIMIT n OFFSET m after a data step ' + figure.id);
        const [take, skip] = [Number(match[1]), Number(match[2])];
        const expectedRoles = before.rows.map((_, k) => k < skip ? 'skip' : k < skip + take ? 'take' : 'beyond');
        if (JSON.stringify(limited.roles) !== JSON.stringify(expectedRoles)) fail('roles differ from LIMIT/OFFSET ' + figure.id);
        if (JSON.stringify(before.rows.slice(skip, skip + take)) !== JSON.stringify(limited.rows)) fail('taken rows differ from the last step ' + figure.id);
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
  for (const block of lesson.presentation?.conceptBlocks || []) {
    if (block.type !== 'figure') continue;
    for (const id of block.ids) if (!data.figures.some(figure => figure.id === id && figure.slot === 'concept')) fail('concept block references an unknown concept figure ' + id);
  }
  return data;
}
