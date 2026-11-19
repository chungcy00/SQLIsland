/* 教学图解组件库：全部由 window.FIGDATA（真实课程/闪卡/任务字段 + SQLite 核对）驱动。无手写数值。 */
(function () {
  const D = window.FIGDATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = (v) => v === null || v === undefined ? '<span class="null">NULL</span>' : v === "" ? '<span class="null">空字符串</span>' : esc(v);
  const isNum = (v) => typeof v === "number";
  const KW = ["SELECT", "DISTINCT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "LEFT JOIN", "INNER JOIN", "ON"];
  const clauseColor = (k) => ({ SELECT: "var(--c-fetch)", FROM: "var(--c-fetch)", WHERE: "var(--c-filter)", HAVING: "var(--c-filter)", "GROUP BY": "var(--c-group)", "ORDER BY": "var(--c-sort)" }[k] || "var(--c-join)");
  const clauseName = (k) => ({ SELECT: "取数", FROM: "取数", WHERE: "筛选", HAVING: "筛选", "GROUP BY": "聚合", "ORDER BY": "排序" }[k] || "连接");

  /* ---------- 组件：迷你表 ---------- */
  function mini(cols, rows, o = {}) {
    const { maxRows = 5, total = rows.length, rowCls = () => "", cellCls = () => "", colCls = () => "", extra = null, numCols = [] } = o;
    const shown = rows.slice(0, maxRows);
    let h = '<div class="tw"><table class="t"><thead><tr>' + cols.map((c, j) => `<th class="${numCols.includes(j) ? "num " : ""}${colCls(j)}">${esc(c)}</th>`).join("") + (extra ? `<th>${esc(extra.head)}</th>` : "") + "</tr></thead><tbody>";
    shown.forEach((r, i) => {
      h += `<tr class="${rowCls(i, r)}">` + r.map((v, j) => `<td class="${numCols.includes(j) ? "num " : ""}${colCls(j)} ${cellCls(i, j, v, r)}">${cell(v)}</td>`).join("") + (extra ? `<td class="why">${extra.fn(i, r)}</td>` : "") + "</tr>";
    });
    if (total > shown.length) h += `<tr class="more"><td colspan="${cols.length + (extra ? 1 : 0)}">…共 ${total} 行</td></tr>`;
    return h + "</tbody></table></div>";
  }
  const col = (t, names) => ({ cols: names, rows: t.rows.map((r) => names.map((n) => r[t.columns.indexOf(n)])) });

  /* ---------- C. 概念图：数据变化类（去重，kp02-02） ---------- */
  function figDistinct() {
    const d = D.distinct, orders = D.tables.orders;
    const opts = d.conceptTable.rows.map((r) => ({ key: r[0], cols: r[0].split(",").map((s) => s.trim()), meaning: r[1], n: +r[2] }));
    let cur = 1;
    const root = $("fig-distinct");
    function draw() {
      const o = opts[cur];
      const inc = ["id", ...o.cols.filter((c) => c !== "id")].filter((v, i, a) => a.indexOf(v) === i);
      const view = col(orders, ["id", "store_id", "category"]);
      const keyOf = (r) => o.cols.map((c) => r[view.cols.indexOf(c)]).join("\u0001");
      const groups = []; const idx = new Map();
      view.rows.forEach((r) => { const k = keyOf(r); if (!idx.has(k)) { idx.set(k, groups.length); groups.push({ r, ids: [] }); } groups[idx.get(k)].ids.push(r[0]); });
      const ok = groups.length === o.n; // 与课文“结果行数”核对
      const out = groups.map((g) => [...o.cols.map((c) => g.r[view.cols.indexOf(c)]), g.ids.join("、")]);
      root.innerHTML = `
        <div class="cap"><span class="t-sub">输出列决定去重粒度</span><span class="t-micro">${esc(d.id)} · orders</span></div>
        <div class="seg" role="group" aria-label="选择输出列">${opts.map((x, i) => `<button data-i="${i}" aria-pressed="${i === cur}"><span class="mono">${esc(x.key)}</span></button>`).join("")}</div>
        <div class="tbl-cap"><span class="t-aux">源表 orders（不变）</span><span class="rowbadge">${orders.rows.length} 行</span></div>
        ${mini(view.cols, view.rows, { colCls: (j) => (o.cols.includes(view.cols[j]) ? "sel" : ""), numCols: [0] })}
        <div class="arrow" style="margin:10px 0"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v13M5 11l5 5 5-5"/></svg>SELECT DISTINCT ${esc(o.key)}</div>
        <div class="tbl-cap"><span class="t-aux">输出：一行代表「${esc(o.meaning)}」</span><span class="rowbadge">${orders.rows.length} → ${groups.length} 行</span></div>
        ${mini([...o.cols, "合并自订单"], out, { cellCls: (i, j) => (j === o.cols.length && groups[i].ids.length > 1 ? "hl" : "") })}
        <p class="cap-line">${groups.length === orders.rows.length ? "每行都不同，没有任何行被合并。" : `共合并 ${orders.rows.length - groups.length} 行重复结果（黄色为被合并的订单）。`} 源表记录不会被删除。${ok ? "" : "（与课文结果行数不一致！）"}</p>`;
      root.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { cur = +b.dataset.i; draw(); }));
    }
    draw();
  }

  /* ---------- D. 语法结构图（kp02-02 的 syntax / parameters / 完整代码） ---------- */
  function figSyntax() {
    const d = D.distinct, root = $("fig-syntax");
    const syn = d.syntax.replace(/;\s*$/, "");
    const m = syn.match(/^(SELECT(?: DISTINCT)?)\s+(.+?)\s+(FROM)\s+(.+)$/i);
    const eg = { cols: (d.sql.match(/SELECT\s+DISTINCT\s+(.+?)\s+FROM/i) || [])[1], table: (d.sql.match(/FROM\s+(\w+)/i) || [])[1] };
    const pdesc = (k) => d.params[k];
    const row = (kw, kws, ph, noteKey, example) => `
      <div class="syn-row"><span class="bar" style="background:${clauseColor(kw)}"></span><div class="inner">
        <div class="lab" style="color:${clauseColor(kw)}">${clauseName(kw)}</div>
        <code>${kws.map((k) => (pdesc(k) ? `<button class="kwb" data-n="n-${k}" aria-expanded="false">${k}</button>` : `<span class="kw">${k}</span>`)).join(" ")} ${ph.map((p) => `<button class="ph${pdesc(noteKey) ? "" : " static"}" ${pdesc(noteKey) ? `data-n="n-${noteKey}" aria-expanded="false"` : ""}>${esc(p)}</button>`).join(", ")}</code>
        ${kws.filter(pdesc).map((k) => `<div class="ph-note" id="n-${k}" hidden>${esc(pdesc(k))}</div>`).join("")}
        ${pdesc(noteKey) ? `<div class="ph-note" id="n-${noteKey}" hidden>${esc(pdesc(noteKey))}<span class="eg">本节示例：<span class="mono">${esc(example)}</span></span></div>` : ""}
      </div></div>`;
    const selKws = m[1].toUpperCase().split(" ");
    root.innerHTML = `
      <div class="cap"><span class="t-sub">${esc(d.title)}</span><span class="t-micro">${esc(d.id)}</span></div>
      <div class="syn">
        ${row("SELECT", selKws, m[2].split(",").map((s) => s.trim()), m[2].trim(), eg.cols)}
        ${row("FROM", [m[3].toUpperCase()], [m[4]], m[4], eg.table)}
      </div>
      <p class="cap-line">点关键字或占位符查看说明。说明文字来自课程「参数」字段；没有说明的占位符（如 ${esc(m[4])}）不展开。</p>`;
    root.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => {
      const n = $(b.dataset.n), open = n.hidden; n.hidden = !open; b.setAttribute("aria-expanded", open);
      // 同一说明被多个占位符共用时一并同步
      root.querySelectorAll(`[data-n="${b.dataset.n}"]`).forEach((x) => x.setAttribute("aria-expanded", open));
    }));
  }

  /* ---------- E. 函数用法图（标量 kp05-02 / 聚合 fc0007 / 窗口待补） ---------- */
  function figFunc() {
    const f = D.func, root = $("fig-func");
    let form = "scalar", pick = null, sample = null;
    const lines = (kind, n) => {
      const ys = Array.from({ length: n }, (_, i) => 6 + i * (22 / Math.max(1, n - 1)));
      const p = ys.map((y) => (kind === "scalar" ? `<path d="M2 ${y} H98" />` : `<path d="M2 ${y} C50 ${y} 50 17 98 17"/>`)).join("");
      return `<svg class="lines" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true" fill="none" stroke="#CFE0EA" stroke-width="1.25" vector-effect="non-scaling-stroke">${p}</svg>`;
    };
    function scalar() {
      const t = D.tables.nullable_values, exp = f.expected;
      const first = f.syntax.split("\n")[0].replace(";", "");
      const mm = first.match(/^(\w+)\((.+)\)$/); const name = mm[1]; const args = mm[2].split(",").map((s) => s.trim());
      const act = (f.sql.match(new RegExp(name + "\\(([^,]+),\\s*([^)]+)\\)")) || []).slice(1).map((s) => s.trim());
      const desc = (a) => { const k = Object.keys(f.params).find((k) => k.split(",").map((s) => s.trim()).includes(a)); return f.params[k]; };
      const vi = t.columns.indexOf("value"), oi = exp.columns.indexOf("filled");
      const rows = t.rows.map((r, i) => ({ id: r[0], v: r[vi], o: exp.rows[i][oi] }));
      const kindOf = (r) => (r.v === null ? "NULL" : r.v === 0 ? "边界" : "典型");
      const kinds = ["典型", "边界", "NULL"].filter((k) => rows.some((r) => kindOf(r) === k));
      const inR = rows.map((r) => [r.id, r.v]), outR = rows.map((r) => [r.id, r.o]);
      const dimmed = (i) => sample && kindOf(rows[i]) !== sample;
      return `
        <div class="anat" aria-label="函数调用解剖"><span class="fnm">${name}</span>(${args.map((a, i) => `<button class="argb" data-a="${i}" aria-pressed="${pick === i}">${esc(a)}<small>${esc(desc(a) || "")}</small></button>`).join(" , ")})</div>
        <p class="t-aux" style="margin-bottom:10px">示例：<span class="mono">${esc(name)}(${esc(act.join(", "))})</span> · 点参数高亮对应列</p>
        <div class="seg" role="group" aria-label="样例切换">${kinds.map((k) => `<button data-s="${k}" aria-pressed="${sample === k}">${k}样例</button>`).join("")}</div>
        <div class="fn-grid">
          <div><div class="t-micro" style="margin-bottom:4px">输入 ${esc(t.name)}</div>${mini(["id", "value"], inR, { numCols: [0, 1], colCls: (j) => (pick === 0 && j === 1 ? "sel" : ""), rowCls: (i) => (dimmed(i) ? "dim" : "") })}</div>
          <div class="fn-block">${name}<small>${esc(act.join(", "))}</small></div>
          <div><div class="t-micro" style="margin-bottom:4px">输出 ${esc(exp.columns[oi])}</div>${mini(["id", exp.columns[oi]], outR, { numCols: [0, 1], rowCls: (i) => (dimmed(i) ? "dim" : ""), cellCls: (i, j) => (j === 1 && rows[i].v !== rows[i].o && (pick === null || pick === 1) ? "hl" : "") })}</div>
        </div>
        ${lines("scalar", 4)}
        <div class="rowmark">${rows.length} 行 → ${rows.length} 行 · 逐行一一对应${sample ? ` · 当前看「${sample}」：${esc(sample === "NULL" ? "缺失被替换" : sample === "边界" ? "真实 0 不被替换" : "非空值原样返回")}` : ""}</div>`;
    }
    function aggregate() {
      const it = D.tables.items, a = f.agg;
      const which = pick === 1 ? "price" : "*";
      const n = which === "*" ? a.countAll : a.countPrice;
      const v = col(it, ["id", "price"]);
      return `
        <p class="t-sub" style="margin-bottom:4px">${esc(f.aggQuestion)}</p>
        <p class="t-aux" style="margin-bottom:10px">来自闪卡 fc0007 · 点参数切换计数对象</p>
        <div class="seg"><button data-a="0" aria-pressed="${pick !== 1}"><span class="mono">COUNT(*)</span></button><button data-a="1" aria-pressed="${pick === 1}"><span class="mono">COUNT(price)</span></button></div>
        <div class="fn-grid">
          <div><div class="t-micro" style="margin-bottom:4px">输入 items</div>${mini(v.cols, v.rows, { maxRows: 4, total: v.rows.length, numCols: [0, 1], cellCls: (i, j, val) => (which === "price" && j === 1 && val === null ? "drop" : "") })}</div>
          <div class="fn-block">COUNT<small>${which === "*" ? "*" : "price"}</small></div>
          <div><div class="t-micro" style="margin-bottom:4px">输出</div>${mini([which === "*" ? "rows_n" : "priced_n"], [[n]], { numCols: [0], cellCls: () => "hl" })}</div>
        </div>
        ${lines("agg", 4)}
        <div class="rowmark">${a.countAll} 行 → 1 行 · ${which === "*" ? "数所有行" : `跳过 price 为 NULL 的行，只数 ${a.countPrice} 行`}</div>`;
    }
    function windowTab() {
      const bars = [0, 1, 2].map((i) => `<rect x="4" y="${6 + i * 14}" width="40" height="10" rx="3" fill="#E2ECF2" stroke="#B7CBD8"/><rect x="104" y="${6 + i * 14}" width="40" height="10" rx="3" fill="#E2ECF2" stroke="#B7CBD8"/><rect x="150" y="${6 + i * 14}" width="26" height="10" rx="3" fill="#FDF1D2" stroke="#F0B94D"/><path d="M46 ${11 + i * 14}H102" stroke="#CFE0EA" stroke-width="1.25"/>`).join("");
      return `<svg viewBox="0 0 180 50" role="img" aria-label="窗口函数形态示意：行数不变，右侧多出一列" style="width:100%;max-width:300px;margin:0 auto 8px"><g fill="none">${bars}</g></svg>
        <div class="note"><b>窗口形态尚无课程样例。</b>已转换的 7 节课不含窗口函数，按规范「不编造数据」，此处只给无数值的形态示意；对应课程转换并带完整夹具后，再用同一组件生成样稿。</div>`;
    }
    function draw() {
      root.innerHTML = `
        <div class="cap"><span class="t-sub">行数如何变化</span><span class="t-micro">${form === "scalar" ? f.id : form === "aggregate" ? "fc0007" : "形态示意"}</span></div>
        <div class="seg" role="tablist">${[["scalar", "标量 N→N"], ["aggregate", "聚合 N→1"], ["window", "窗口 N→N+列"]].map(([k, l]) => `<button data-f="${k}" aria-pressed="${form === k}">${l}</button>`).join("")}</div>
        ${form === "scalar" ? scalar() : form === "aggregate" ? aggregate() : windowTab()}`;
      root.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { form = b.dataset.f; pick = null; sample = null; draw(); }));
      root.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { const i = +b.dataset.a; pick = form === "scalar" ? (pick === i ? null : i) : i; draw(); }));
      root.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { sample = sample === b.dataset.s ? null : b.dataset.s; draw(); }));
    }
    draw();
  }

  /* ---------- F. 执行流水线 + 数据变化步进（kp01-03 查询） ---------- */
  function figPipeline() {
    const j = D.join, root = $("fig-pipe"), cu = D.tables.customers, od = D.tables.orders;
    const left = j.joins.LEFT.rows;           // SQLite 实际执行：客户 LEFT JOIN 订单
    const det = j.detail.result;               // 课文扩展示例结果（客户编号, 订单编号）
    const same = JSON.stringify(left.map((r) => [r[0], r[2]])) === JSON.stringify(det.rows);
    const groups = {}; left.forEach((r) => (groups[r[0]] = (groups[r[0]] || 0) + 1));
    const exp = j.expected;
    const bd = (kw) => j.breakdown.find((b) => b.sql.toUpperCase().startsWith(kw));
    const steps = [
      { kw: "FROM", b: bd("FROM"), badge: `${cu.rows.length} → ${left.length} 行`, name: "读取并左连接" },
      { kw: "GROUP BY", b: bd("GROUP BY"), badge: `${left.length} → ${Object.keys(groups).length} 行`, name: "分组收拢" },
      { kw: "SELECT", b: bd("SELECT"), badge: `${exp.rows.length} 行 · ${exp.columns.length} 列`, name: "计算输出列" },
      { kw: "ORDER BY", b: bd("ORDER BY"), badge: `${exp.rows.length} 行`, name: "排序" },
    ];
    let cur = 0;
    const body = (s) => {
      let t = "";
      if (s.kw === "FROM") {
        const cnt = {}; det.rows.forEach((r) => (cnt[r[0]] = (cnt[r[0]] || 0) + 1));
        t = mini(det.columns, det.rows, { numCols: [0, 1], cellCls: (i, jx, v, r) => (jx === 1 && v === null ? "hl" : jx === 0 && cnt[r[0]] > 1 ? "sel" : ""), extra: { head: "说明", fn: (i, r) => (r[1] === null ? "补 NULL" : cnt[r[0]] > 1 ? `重复 ×${cnt[r[0]]}` : "") } });
      } else if (s.kw === "GROUP BY") {
        t = mini(["customer_id", "收拢的行"], Object.entries(groups).map(([k, n]) => [+k, n + " 行 → 1 行"]), { numCols: [0] });
      } else if (s.kw === "SELECT" || s.kw === "ORDER BY") {
        t = mini(exp.columns, exp.rows, { numCols: [0, 1], cellCls: (i, jx, v) => (s.kw === "SELECT" && jx === 1 && v === 0 ? "hl" : "") });
      }
      const note = s.kw === "SELECT" && s.b.reason ? s.b.reason : s.b.reason;
      return `${t}<div class="frag"><span class="tag line" style="margin-bottom:6px">片段 · 不能单独运行</span><br>${esc(s.b.sql)}</div>
        <p class="t-aux"><b style="color:var(--ink)">${esc(s.b.purpose)}</b> ${esc(note)}</p>`;
    };
    function draw() {
      root.innerHTML = `
        <div class="t-sub" style="padding:16px 16px 4px">分步执行 · 按逻辑执行顺序</div>
        <p class="t-aux" style="padding:0 16px 8px">${esc(j.id)} · ${esc(D.join.sql.replace(/\s+/g, " ").slice(0, 60))}…</p>
        ${steps.map((s, i) => `<div class="st-item ${i === cur ? "cur" : ""}"><button class="st-head" data-i="${i}" aria-expanded="${i === cur}"><span class="bar" style="background:${clauseColor(s.kw)}"></span><span class="n">${i + 1}</span><span class="tx"><b style="color:${clauseColor(s.kw)}">${esc(clauseName(s.kw))} · ${esc(s.name)}</b>${i === cur ? "" : `<code>${esc(s.b.sql)}</code>`}</span><span class="rowbadge">${s.badge}</span></button><div class="st-body" ${i === cur ? "" : "hidden"}>${i === cur ? body(s) : ""}</div></div>`).join("")}
        <div class="ctrl"><button class="btn sec" id="pv" ${cur === 0 ? "disabled" : ""}>上一步</button><button class="btn" id="nx" ${cur === steps.length - 1 ? "disabled" : ""}>下一步</button></div>`;
      root.querySelectorAll(".st-head").forEach((b) => (b.onclick = () => { cur = +b.dataset.i; draw(); }));
      $("pv").onclick = () => { cur--; draw(); }; $("nx").onclick = () => { cur++; draw(); };
    }
    draw();
    D.checks.pipelineDetailMatchesSqlite = same;
  }

  /* ---------- G. 表关系图（连接） ---------- */
  function figRelation() {
    const j = D.join, root = $("fig-rel"), cu = D.tables.customers, od = D.tables.orders;
    const cid = od.columns.indexOf("customer_id"), oid = od.columns.indexOf("id");
    let kind = "LEFT";
    const rowH = 36, headH = 32;
    function draw() {
      const res = j.joins[kind].rows;
      const keepL = kind === "LEFT" || kind === "FULL", keepR = kind === "RIGHT" || kind === "FULL";
      const matchedCust = new Set(od.rows.filter((r) => r[cid] !== null && cu.rows.some((c) => c[0] === r[cid])).map((r) => r[cid]));
      const dupCnt = {}; od.rows.forEach((r) => { if (r[cid] !== null) dupCnt[r[cid]] = (dupCnt[r[cid]] || 0) + 1; });
      // 与 SQLite 结果核对：已匹配连线数 + 保留的未匹配行数 == 结果行数
      const unmatchedL = cu.rows.filter((c) => !matchedCust.has(c[0])).length, unmatchedR = od.rows.filter((r) => r[cid] === null || !cu.rows.some((c) => c[0] === r[cid])).length;
      const matches = od.rows.filter((r) => r[cid] !== null && cu.rows.some((c) => c[0] === r[cid])).length;
      const expected = matches + (keepL ? unmatchedL : 0) + (keepR ? unmatchedR : 0);
      const ok = expected === res.length;
      const lrows = cu.rows.map((c) => `<tr class="${!matchedCust.has(c[0]) && !keepL ? "drop dim" : ""}"><td class="num">${c[0]}</td></tr>`).join("");
      const rrows = od.rows.map((r) => { const m = r[cid] !== null && cu.rows.some((c) => c[0] === r[cid]); return `<tr class="${!m && !keepR ? "drop dim" : ""}"><td class="num">${r[oid]}</td><td class="num">${cell(r[cid])}</td></tr>`; }).join("");
      const kinds = ["INNER", "LEFT", "RIGHT", "FULL"];
      root.innerHTML = `
        <div class="cap"><span class="t-sub">按 customer_id 匹配</span><span class="t-micro">${esc(j.id)} · customers ↔ orders</span></div>
        <div class="seg" role="tablist">${kinds.map((k) => `<button data-k="${k}" aria-pressed="${k === kind}">${k}</button>`).join("")}</div>
        <div class="rel" id="relbox"><div><div class="t-micro" style="margin-bottom:4px">customers 客户</div><div class="tw"><table class="t rel-t" id="lt"><thead><tr><th class="num">customer_id</th></tr></thead><tbody>${lrows}</tbody></table></div></div>
          <div class="mid"><svg id="relsvg" aria-hidden="true"></svg></div>
          <div><div class="t-micro" style="margin-bottom:4px">orders 订单</div><div class="tw"><table class="t rel-t" id="rt"><thead><tr><th class="num">id</th><th class="num">customer_id</th></tr></thead><tbody>${rrows}</tbody></table></div></div></div>
        <div class="legend"><span>━ 匹配连线</span><span>┅○ 未匹配，补 NULL</span><span>灰删除线 = 不保留</span>${dupCnt[1] > 1 ? `<span>客户 1 重复 ×${dupCnt[1]}</span>` : ""}</div>
        <div class="tbl-cap" style="margin-top:12px"><span class="t-aux">${kind} JOIN 结果</span><span class="rowbadge">${res.length} 行</span></div>
        ${mini(["customer_id", "customer_name", "order_id"], res, { maxRows: 5, total: res.length, numCols: [0, 2] })}
        <p class="cap-line">${{ INNER: "只保留两边都匹配的行。", LEFT: "左表客户全部保留，没有订单的客户订单列补 NULL。", RIGHT: "右表订单全部保留，客户编号为空的订单客户列补 NULL。", FULL: "两边未匹配的行都保留并补 NULL。" }[kind]} ${dupCnt[1] > 1 ? `客户 1 有 ${dupCnt[1]} 笔订单，所以出现 ${dupCnt[1]} 次。` : ""}${ok ? "" : "（行数与 SQLite 不一致！）"}</p>
        <p class="t-micro" style="margin-top:6px">行数已与 SQLite 实际执行结果核对；${kind === "LEFT" ? "LEFT 与课文结果一致。" : "INNER/RIGHT/FULL 为同一夹具的推演，正式启用前须逐项验证。"}韦恩图仅作补充，不作主图。</p>`;
      root.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { kind = b.dataset.k; draw(); }));
      const box = $("relbox").getBoundingClientRect(), mid = root.querySelector(".mid").getBoundingClientRect(), svgEl = $("relsvg");
      const ys = (id) => [...$(id).querySelectorAll("tbody tr")].map((tr) => { const r = tr.getBoundingClientRect(); return r.top + r.height / 2 - box.top; });
      const ly = ys("lt"), ry = ys("rt"), Wm = mid.width;
      svgEl.setAttribute("viewBox", `0 0 ${Wm} ${box.height}`); svgEl.setAttribute("width", Wm); svgEl.setAttribute("height", box.height);
      let p = "";
      od.rows.forEach((r, ri) => {
        const ci = cu.rows.findIndex((c) => c[0] === r[cid]);
        if (ci >= 0) p += `<path d="M0 ${ly[ci]} C${Wm / 2} ${ly[ci]} ${Wm / 2} ${ry[ri]} ${Wm} ${ry[ri]}" stroke="#38607F" stroke-width="1.75" fill="none"/>`;
        else if (keepR) p += `<path d="M${Wm} ${ry[ri]} H${Wm * 0.6}" stroke="#7E98A9" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/><circle cx="${Wm * 0.6}" cy="${ry[ri]}" r="2.5" fill="#fff" stroke="#7E98A9" stroke-width="1.5"/>`;
      });
      cu.rows.forEach((c, ci) => { if (!matchedCust.has(c[0]) && keepL) p += `<path d="M0 ${ly[ci]} H${Wm * 0.4}" stroke="#7E98A9" stroke-width="1.5" stroke-dasharray="3 3" fill="none"/><circle cx="${Wm * 0.4}" cy="${ly[ci]}" r="2.5" fill="#fff" stroke="#7E98A9" stroke-width="1.5"/>`; });
      svgEl.innerHTML = p;
    }
    draw();
  }

  /* ---------- H. 指标公式卡（BP11）+ 面试知识图（fc0005） ---------- */
  function figMetric() {
    const m = D.metric, root = $("fig-metric");
    const num = (m.sql.match(/SUM\((\w+)\)/) || [])[1], den = "COUNT(*)";
    const want = m.requirements;
    const win = (want.match(/(\d{4})年/) || [])[1];
    const scope = (want.match(/^(仅[^。]+?)。/) || [])[1];
    root.innerHTML = `
      <div class="cap"><span class="t-sub">${esc(m.title)}</span><span class="t-micro">${esc(m.id)} · ${esc(m.projectId)}</span></div>
      <div class="formula" role="group" aria-label="指标公式">
        <button id="m-num" aria-expanded="false"><small>分子 · 净收入合计（分）</small><b>SUM(${esc(num)})</b></button>
        <div class="slash" aria-hidden="true"></div>
        <button class="den" id="m-den" aria-expanded="false"><small>分母 · 订单数</small><b>${den}</b></button>
      </div>
      <div class="explain" id="m-ex" hidden></div>
      <div class="cal"><span class="tag">粒度：${esc(m.grain)}</span><span class="tag">时间窗口：${esc(win)} 年</span><span class="tag">范围：${esc(scope)}</span></div>
      <div class="note" style="margin-top:12px"><b>易错口径</b> ${esc(m.commonError)}</div>
      <p class="src">数据来源：<span class="mono">v_order_net</span>（${["net_cents", "order_date", "channel", "customer_id", "order_id"].filter((f) => m.sql.includes(f)).join("、")}）· 输出列 ${esc(m.columns.join(" / "))}</p>
      <div class="steps3">${m.executionSteps.map((s, i) => `<div><i style="background:${["var(--c-join)", "var(--c-filter)", "var(--c-group)"][i % 3]}"></i><span>${i + 1} · ${esc(s)}</span></div>`).join("")}</div>`;
    const ex = $("m-ex");
    const say = { "m-num": `净收入合计，对应输出列 net_cents；来自任务要求「${want.split("。").find((s) => s.includes("净收入")) || ""}」。`, "m-den": "订单数，对应输出列 orders；首购标记按日期、订单编号决胜（任务要求原文）。" };
    ["m-num", "m-den"].forEach((id) => ($(id).onclick = () => {
      const open = $(id).getAttribute("aria-expanded") === "true";
      ["m-num", "m-den"].forEach((x) => $(x).setAttribute("aria-expanded", "false"));
      ex.hidden = open; if (!open) { $(id).setAttribute("aria-expanded", "true"); ex.textContent = say[id]; }
    }));
  }

  function figCard() {
    const c = D.card, root = $("fig-card"), od = D.tables.orders;
    const [A, B] = (() => { const q = c.front.question; const a = q.split("，与")[0], b = (q.split("，与")[1] || "").split("，")[0]; return [a, b]; })();
    const ci = od.columns.indexOf("customer_id");
    const withRow = od.rows, without = od.rows.filter((r) => r[ci] !== null);
    const stat = (rows) => ({ all: rows.length, id: rows.filter((r) => r[ci] !== null).length });
    const sa = stat(withRow), sb = stat(without);
    let back = false;
    function draw() {
      root.innerHTML = back ? `
        <button class="flip" aria-label="翻回正面"><div class="t-micro">${esc(c.type)} · 背面 · 点按翻回</div>
          <div class="qa">${esc(c.back.answer)}</div>
          <div class="cmp" style="margin-top:12px">
            <div class="a"><div class="k">${esc(A)}</div><div class="v">COUNT(*) = <b>${sa.all}</b><br>COUNT(customer_id) = <b>${sa.id}</b></div></div>
            <div><div class="k">${esc(B)}</div><div class="v">COUNT(*) = <b>${sb.all}</b><br>COUNT(customer_id) = <b>${sb.id}</b></div></div>
          </div>
          <p class="t-aux" style="margin-top:10px">${esc(c.back.explanation)}</p>
          <p class="t-micro" style="margin-top:6px">数值由 orders 夹具计算：左列含订单 4（客户编号 NULL），右列不含。</p></button>` : `
        <button class="flip" aria-label="翻到背面"><div class="t-micro">${esc(c.type)} · 正面（不放图）· 点按翻面</div><div class="qa">${esc(c.front.question)}</div></button>`;
      root.querySelector(".flip").onclick = () => { back = !back; draw(); };
    }
    draw();
  }

  /* ---------- I. 状态岛（同一座岛的不同状态） ---------- */
  const TILE_ORDER = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) TILE_ORDER.push([i, j]);
  const INK = 'stroke="#17293A" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  const MARK = {
    question: `<g ${INK} fill="none" transform="translate(120 99)"><circle r="10" fill="#fff"/><path d="M-3.5 -3a3.6 3.6 0 1 1 5.4 3.1C0.6 0.8 0 1.6 0 3"/><circle cx="0" cy="6.2" r=".6" fill="#17293A"/></g>`,
    magnifier: `<g ${INK} fill="none" transform="translate(120 99)"><circle cx="-1.5" cy="-1.5" r="6.5" fill="#fff"/><path d="M3.5 3.5L9 9"/></g>`,
    lighthouse: `<g ${INK} transform="translate(122 100)"><path d="M-5 6L-3 -16H3L5 6Z" fill="#fff"/><path d="M-4 -6H4M-4.4 -1.5H4.4" fill="none"/><rect x="-3.6" y="-22" width="7.2" height="6" fill="#F0B94D"/><path d="M-5 -22L0 -27 5 -22Z" fill="#fff"/><path d="M-9 -20l-4 -1.5M9 -20l4 -1.5" fill="none"/></g>`,
    anchor: `<g ${INK} fill="none" transform="translate(120 96)"><circle cy="-9" r="3" fill="#fff"/><path d="M0 -6V9M-5 -2H5M-8 3Q-7 9 0 9T8 3"/></g>`,
  };
  window.islandSVG = function ({ lit = 0, only = null, marker = null, flag = true, view = "0 0 160 160", w = 160, h = 160, label = "", id = "", flagUp = true }) {
    const tiles = TILE_ORDER.map(([i, j], n) => {
      if (only !== null && n !== only) return "";
      const on = n < lit;
      return `<rect class="tile" data-n="${n}" x="${-36.5 + i * 19}" y="${-27 + j * 19}" width="16" height="16" rx="3" fill="${on ? "#38607F" : "#F3F8FA"}" stroke="${on ? "#38607F" : "#A9C2D2"}" stroke-width="1.4"/>`;
    }).join("");
    const ring = "M22 92C20 74 38 60 60 57 72 55 80 47 98 50 120 53 141 66 145 86 148 100 138 111 123 116 110 121 104 133 86 132 70 131 62 124 47 122 31 119 24 106 22 92Z";
    const flagY = flagUp ? 50 : 66;
    return `<svg ${id ? `id="${id}"` : ""} viewBox="${view}" width="${w}" height="${h}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>
      <g fill="none" stroke="#CFE0EA" stroke-width="1.5"><path opacity=".35" transform="translate(80 92) scale(1.26) translate(-80 -92)" d="${ring}"/><path opacity=".6" transform="translate(80 92) scale(1.12) translate(-80 -92)" d="${ring}"/></g>
      <path d="${ring}" transform="translate(0 5)" fill="#BCCFDB"/>
      <path d="${ring}" fill="#E4EEF4" stroke="#8FB1C8" stroke-width="1.75" stroke-linejoin="round"/>
      <g transform="translate(80 90) scale(1 .58) rotate(45)">${tiles}</g>
      ${flag ? `<g class="flag" ${INK}><path d="M99 79V${flagY}" fill="none"/><path d="M99 ${flagY}l17 6.500-17 6.500z" fill="#F0B94D"/></g>` : ""}
      ${marker ? MARK[marker] : ""}
    </svg>`;
  };
  function figStates() {
    const root = $("fig-states");
    const F = "../../resources/ASSETS/v2/illustrations/final/";
    const img = (f, w, h) => `<img src="${F}${f}.png" ${w ? `width="${w}"` : ""} ${h ? `height="${h}"` : ""} alt="" loading="lazy" style="width:100%;height:auto;max-width:${w || 240}px;display:block;margin:0 auto">`;
    const card = (title, sub, f, big) => `<div class="card st-card${big ? " st-big" : ""}">${img(f, big ? 360 : 240)}<div class="nm">${title}</div><div class="t-micro">${sub}</div></div>`;
    root.innerHTML = `<div class="states">
      ${card("14 加载失败", "离线资源读取、初始化或实际加载失败。普通无网络不用此图", "14_load_failed_lighthouse_off")}
      ${card("08 空态 · 问号", "通用空态：无错题 / 收藏 / 个人卡 / 查询历史", "08_empty_question")}
      ${card("09 空态 · 放大镜", "搜索无结果 / 暂无统计数据", "09_empty_magnifier")}
      ${card("10 就绪 · 灯塔", "离线资源就绪", "10_ready_lighthouse")}
      ${card("11 就绪 · 小锚", "备份及恢复成功", "11_ready_anchor")}
      <div class="card st-card st-big"><div id="milestone" aria-hidden="true">${window.MILESTONE_SVG || img("12_milestone", 360)}</div><div class="nm">12 里程碑</div><div class="t-micro">章节完成 / 今日闪卡完成 / 全部课程完成 · 地块依次亮起一次（约 600ms）后旗子升起</div><div style="margin-top:10px"><button class="btn sec" id="replay">重播一次</button></div></div>
      ${card("13 鼓励", "连续学习 / 首次答对难题", "13_encourage", true)}
    </div>
    <div class="card pad" style="margin-top:12px"><div class="t-sub">三档尺寸真实核对</div>
      <div class="sizes">
        <figure><div class="frame" style="width:120px;height:80px">${img("12_milestone", 120, 80).replace("max-width:120px", "max-width:120px;height:80px;object-fit:contain")}</div><figcaption>大 3:2<br>里程碑 ≈120×80</figcaption></figure>
        <figure><div class="frame" style="width:80px;height:60px">${img("08_empty_question", 80, 60).replace("max-width:80px", "max-width:80px;height:60px;object-fit:contain")}</div><figcaption>中 4:3<br>空态 ≈80×60</figcaption></figure>
        <figure><div class="frame" style="width:64px;height:64px">${img("09_empty_magnifier", 64, 64).replace("max-width:64px", "max-width:64px;height:64px;object-fit:contain")}</div><figcaption>小 1:1<br>行内 64×64</figcaption></figure>
      </div></div>
    <div class="card empty-demo" style="margin-top:12px"><div style="display:flex;justify-content:center">${img("08_empty_question", 200)}</div><p class="t-sub">还没有错题</p><p class="t-aux" style="margin-bottom:12px">做错的题会自动收进这里，方便回头复习。</p><button class="btn">去练习</button><p class="t-micro" style="margin-top:10px">图内无文字；文案与按钮由页面提供（一句话 + 至多一个按钮）。此处文案仅为版式示意。</p></div>
    <div class="note" style="margin-top:12px"><b>不配插画：</b>普通答对（状态条 + 日光黄小点）、SQL 返回 0 行（一行文字）、普通无网络（不算加载失败）。高频事件不放大图。</div>`;
    // 里程碑：12 块地块依次亮起一次（28ms 间隔），随后旗子升起；整体约 600ms，尊重“减少动画”
    const ms = $("milestone"), svg = ms && ms.querySelector("svg");
    if (svg && svg.querySelector("#flag")) {
      const tiles = [...svg.querySelectorAll(".tile")], flag = svg.querySelector("#flag"), reduce = matchMedia("(prefers-reduced-motion: reduce)");
      let timers = [];
      const done = () => { timers.forEach(clearTimeout); timers = []; tiles.forEach((t) => t.classList.add("on")); flag.classList.add("up"); };
      const play = () => {
        if (reduce.matches) return done();
        timers.forEach(clearTimeout); timers = []; tiles.forEach((t) => t.classList.remove("on")); flag.classList.remove("up"); void svg.getBoundingClientRect();
        tiles.forEach((t, i) => timers.push(setTimeout(() => t.classList.add("on"), i * 28)));
        timers.push(setTimeout(() => flag.classList.add("up"), 340));
      };
      $("replay").onclick = play;
      let played = false;
      new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !played) { played = true; play(); } }), { threshold: 0.6 }).observe(ms);
      done();   // 初始即最终状态，进入视口时播放一次
      if (!reduce.matches) { tiles.forEach((t) => t.classList.remove("on")); flag.classList.remove("up"); }
    }
  }

  /* ---------- 业务项目 ---------- */
  function figBusiness() {
    const N = [["retail_sales", "零售", "02"], ["ecommerce_customer", "电商客户", "03"], ["inventory_management", "库存", "04"], ["procurement_data", "采购", "05"], ["financial_data", "财务", "06"], ["human_resources", "人力", "07"]];
    const FIN = (n) => { const r = N.find((x) => x[0] === n); return `../../resources/ASSETS/v2/illustrations/final/${r[2]}_business_${n}.png`; };
    const OLD = "../../resources/ASSETS/illustrations/business/business_", NEW = "";
    let mode = "new", ratio = "1";
    const root = $("fig-biz");
    function draw() {
      const src = (n) => (mode === "old" ? `${OLD}${n}.png` : FIN(n));
      root.innerHTML = `
        <div class="seg"><button data-m="new" aria-pressed="${mode === "new"}">新版（最终）</button><button data-m="old" aria-pressed="${mode === "old"}">旧版</button></div>
        <div class="seg"><button data-r="1" aria-pressed="${ratio === "1"}">1:1 主图</button><button data-r="3" aria-pressed="${ratio === "3"}" ${mode === "old" ? "disabled" : ""}>3:1 裁切</button></div>
        <div class="biz-grid ${mode === "old" ? "old-grid" : ""}">${N.map(([n, zh]) => `<div class="card biz-card"><div class="pic ${mode === "new" && ratio === "3" ? "ban" : ""}"><img src="${src(n)}" alt="${zh}项目场景插画" loading="lazy"></div><div class="nm">${zh}</div><div class="en">${n}</div></div>`).join("")}</div>
        <div class="card" style="margin-top:12px;overflow:hidden">
          <div class="t-sub" style="padding:12px 12px 0">真实使用尺寸核对（新版）</div>
          <div class="ctx"><img src="${FIN("retail_sales")}" width="72" height="72" alt=""><div class="tx"><b>首页项目入口</b><div class="t-aux">home-project-art ≈ 72×72（1:1）</div></div></div>
          <div class="ctx"><img src="${FIN("human_resources")}" width="96" height="96" alt=""><div class="tx"><b>实战列表</b><div class="t-aux">project-img ≈ 96×96（1:1）</div></div></div>
          <div class="ctx" style="display:block"><div style="aspect-ratio:3/1;overflow:hidden;border-radius:12px"><img src="${FIN("ecommerce_customer")}" style="width:100%;height:100%;object-fit:cover;object-position:50% 58%" alt=""></div><div class="t-aux" style="margin-top:6px"><b style="color:var(--ink)">项目详情</b> summary-illustration · 3:1 裁切（取 1:1 主图中部）</div></div>
        </div>`;
      root.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { mode = b.dataset.m; if (mode === "old") ratio = "1"; draw(); }));
      root.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { ratio = b.dataset.r; draw(); }));
    }
    draw();
  }

  figBusiness(); figDistinct(); figSyntax(); figFunc(); figPipeline(); figRelation(); figMetric(); figCard(); figStates();

  // 章节导航高亮
  const links = [...document.querySelectorAll(".chips a")], secs = links.map((a) => document.querySelector(a.getAttribute("href")));
  const on = () => { let k = 0; secs.forEach((s, i) => { if (s.getBoundingClientRect().top < 140) k = i; }); links.forEach((a, i) => a.classList.toggle("on", i === k)); };
  addEventListener("scroll", on, { passive: true }); on();
  // 自检结果输出到控制台与页脚
  const all = Object.entries(D.checks), bad = all.filter(([, v]) => !v);
  $("selfcheck").textContent = bad.length ? "数据核对失败：" + bad.map((b) => b[0]).join("、") : `数据核对通过（${all.length} 项：课文结果、扩展示例、连接结果与 SQLite 实际执行一致）`;
  console.log("FIG checks", D.checks);
})();
