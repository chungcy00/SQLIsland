import dagre from "@dagrejs/dagre";
import { hasIcon, iconSvg } from "./icons-v2.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const paths = {
  fit: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 12h8 M12 8v8",
  reset: "M3 11a9 9 0 1 1 2.6 6.4 M3 4v7h7",
  expand: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
  shrink: "M3 8h5V3 M21 8h-5V3 M8 21v-5H3 M16 21v-5h5",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12 M6 18 18 6",
};
const icon = (name) =>
  hasIcon(name) ? iconSvg(name) : `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
const control = (action, label) =>
  `<button type="button" class="erd-icon" data-erd-action="${action}" aria-label="${label}" title="${label}">${icon(action)}</button>`;
const WIDTH = 300,
  HEADER = 64,
  ROW = 32,
  FOOTER = 36;
/** Reusable offline schema explorer. The caller owns schema acquisition and table preview. */
export function mountErd(container, { schema, onPreview }) {
  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  const nodeKeys = new Map(
    schema.tables.map((table, index) => [table.name, `node-${index}`]),
  );
  const relations = schema.relations.filter((relation) => relation.resolved);
  const degree = (name) =>
    relations.filter(
      (relation) => relation.fromTable === name || relation.toTable === name,
    ).length;
  const initial =
    schema.tables
      .filter((table) => table.type === "table")
      .slice()
      .sort(
        (a, b) =>
          degree(b.name) - degree(a.name) || a.name.localeCompare(b.name),
      )[0]?.name || schema.tables[0]?.name;
  const defaultScope = tables.size > 24 ? "1" : "all";
  const state = {
    selected: defaultScope === "all" ? null : initial,
    scope: defaultScope,
    pan: { x: 0, y: 0 },
    zoom: 1,
    fullscreen: false,
  };
  let layout,
    shown = [],
    disposed = false,
    suppressClickUntil = 0;
  const listeners = [];
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    listeners.push(() => target.removeEventListener(event, callback, options));
  };
  container.classList.add("erd");
  container.innerHTML = `<div class="erd-tools"><div class="erd-search"><input type="search" class="erd-search-input" placeholder="搜索表名" aria-label="搜索并定位数据表" autocomplete="off"><div class="erd-search-results" role="listbox" aria-label="匹配的数据表" hidden></div></div><div class="erd-controls"><select class="erd-scope" aria-label="关联范围"><option value="all">全部表</option><option value="1">一层关联</option><option value="2">两层关联</option></select>${control("fit", "缩放至适合屏幕")}${control("reset", "恢复默认布局")}${control("expand", "全屏查看关系图")}</div></div><div class="erd-viewport" tabindex="0" role="region" aria-label="数据库关系图画布"><div class="erd-world"><svg class="erd-edges" aria-label="表间关系"></svg><div class="erd-nodes"></div></div><div class="erd-zoom">${control("minus", "缩小")}<output class="erd-zoom-value" aria-label="缩放比例"></output>${control("plus", "放大")}</div></div><div class="erd-status" aria-live="polite"></div><div class="erd-legend"><span><i></i>外键</span><span><i class="view"></i>视图依赖</span>${relations.some((relation) => relation.kind === "logical") ? '<span><i class="logical"></i>逻辑关联</span>' : ""}<span>PK 主键 · FK 外键 · UK 唯一键</span></div><section class="erd-inspector" aria-label="字段与关系详情" hidden></section>${schema.warnings.length ? `<details class="erd-warnings"><summary>结构提示 ${schema.warnings.length}</summary>${schema.warnings.map((warning) => `<p>${escape(warning)}</p>`).join("")}</details>` : ""}`;
  const viewport = container.querySelector(".erd-viewport");
  const world = container.querySelector(".erd-world");
  const nodes = container.querySelector(".erd-nodes");
  const edges = container.querySelector(".erd-edges");
  const search = container.querySelector(".erd-search-input");
  const results = container.querySelector(".erd-search-results");
  const scope = container.querySelector(".erd-scope");
  const inspector = container.querySelector(".erd-inspector");
  scope.value = state.scope;
  function visibleTables() {
    if (state.scope === "all" || !state.selected) return [...tables.values()];
    const names = new Set([state.selected]);
    for (let depth = 0; depth < Number(state.scope); depth++) {
      const next = new Set(names);
      for (const relation of relations) {
        if (names.has(relation.fromTable)) next.add(relation.toTable);
        if (names.has(relation.toTable)) next.add(relation.fromTable);
      }
      next.forEach((name) => names.add(name));
    }
    return [...tables.values()].filter((table) => names.has(table.name));
  }
  function badges(table, column) {
    const pk = column.primaryKeyOrder
      ? `<span class="erd-key" title="主键第${column.primaryKeyOrder}位，共${table.primaryKey.length}列">PK${table.primaryKey.length > 1 ? `<sub>${column.primaryKeyOrder}</sub>` : ""}</span>`
      : "";
    const fk = table.foreignKeys.some((key) =>
      key.columns.includes(column.name),
    )
      ? '<span class="erd-key">FK</span>'
      : "";
    const unique = table.indexes.filter(
      (index) =>
        index.unique &&
        index.origin !== "pk" &&
        index.columns.includes(column.name),
    );
    const uk = unique.length
      ? `<span class="erd-key" title="${escape(unique.map((index) => `${index.partial ? "条件唯一" : "唯一约束"} (${index.columns.map((name) => name || "表达式").join(", ")})`).join("；"))}">UK${unique.some((index) => index.partial) ? "*" : ""}</span>`
      : "";
    return pk + fk + uk;
  }
  function relatedToSelection(relation) {
    return (
      !state.selected ||
      relation.fromTable === state.selected ||
      relation.toTable === state.selected
    );
  }
  function highlight() {
    const related = new Set([state.selected]);
    relations.filter(relatedToSelection).forEach((relation) => {
      related.add(relation.fromTable);
      related.add(relation.toTable);
    });
    nodes.querySelectorAll(".erd-node").forEach((node) => {
      node.classList.toggle("selected", node.dataset.table === state.selected);
      node.classList.toggle(
        "dimmed",
        !!state.selected && !related.has(node.dataset.table),
      );
      node
        .querySelector(".erd-table-name")
        .setAttribute(
          "aria-pressed",
          String(node.dataset.table === state.selected),
        );
    });
    edges.querySelectorAll(".erd-relation").forEach((edge) => {
      const relation = relations.find(
        (relation) => relation.id === edge.dataset.relation,
      );
      edge.classList.toggle(
        "highlighted",
        !!state.selected && relatedToSelection(relation),
      );
      edge.classList.toggle(
        "dimmed",
        !!state.selected && !relatedToSelection(relation),
      );
    });
  }
  function applyTransform() {
    world.style.transform = `translate(${state.pan.x}px,${state.pan.y}px) scale(${state.zoom})`;
    viewport.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
    viewport.style.backgroundSize = `${Math.max(12, 16 * state.zoom)}px ${Math.max(12, 16 * state.zoom)}px`;
    container.querySelector(".erd-zoom-value").textContent =
      Math.round(state.zoom * 100) + "%";
  }
  function zoomAt(
    zoom,
    point = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
  ) {
    zoom = Math.max(0.025, Math.min(2.5, zoom));
    state.pan = {
      x: point.x - ((point.x - state.pan.x) * zoom) / state.zoom,
      y: point.y - ((point.y - state.pan.y) * zoom) / state.zoom,
    };
    state.zoom = zoom;
    applyTransform();
  }
  function fit() {
    if (!layout || !shown.length) return;
    state.zoom = Math.max(
      0.025,
      Math.min(
        1,
        (viewport.clientWidth - 32) / layout.graph().width,
        (viewport.clientHeight - 32) / layout.graph().height,
      ),
    );
    state.pan = {
      x: (viewport.clientWidth - layout.graph().width * state.zoom) / 2,
      y: (viewport.clientHeight - layout.graph().height * state.zoom) / 2,
    };
    applyTransform();
  }
  function locate(name) {
    const node = layout?.node(nodeKeys.get(name));
    if (!node) return;
    state.zoom = 1;
    state.pan = {
      x: viewport.clientWidth / 2 - node.x * state.zoom,
      y: viewport.clientHeight / 2 - node.y * state.zoom,
    };
    applyTransform();
  }
  function draw(shouldFit = false) {
    shown = visibleTables();
    const included = new Set(shown.map((table) => table.name));
    const links = relations.filter(
      (relation) =>
        included.has(relation.fromTable) && included.has(relation.toTable),
    );
    layout = new dagre.graphlib.Graph({ multigraph: true });
    layout.setGraph({
      rankdir: "LR",
      nodesep: 42,
      ranksep: 150,
      marginx: 32,
      marginy: 32,
      ranker: "network-simplex",
    });
    layout.setDefaultEdgeLabel(() => ({}));
    for (const table of shown)
      layout.setNode(nodeKeys.get(table.name), {
        width: WIDTH,
        height: HEADER + table.columns.length * ROW + FOOTER,
      });
    for (const relation of links)
      layout.setEdge(
        nodeKeys.get(relation.fromTable),
        nodeKeys.get(relation.toTable),
        { weight: relation.kind === "foreign" ? 2 : 1 },
        relation.id,
      );
    if (shown.length) dagre.layout(layout);
    else layout.setGraph({ ...layout.graph(), width: 0, height: 0 });
    nodes.innerHTML = shown
      .map((table) => {
        const node = layout.node(nodeKeys.get(table.name));
        return `<section class="erd-node ${table.type === "view" ? "erd-view" : ""}" data-table="${escape(table.name)}" style="left:${node.x - WIDTH / 2}px;top:${node.y - node.height / 2}px;width:${WIDTH}px;height:${node.height}px"><header class="erd-node-header"><button type="button" class="erd-table-name" data-erd-action="select" data-table="${escape(table.name)}" title="${escape(table.name)}">${escape(table.name)}</button><small title="${escape(table.description)}">${table.type === "view" ? "视图 · " : ""}${escape(table.description || (table.type === "view" ? "查询结果" : "数据表"))}</small></header><div class="erd-fields">${table.columns
          .map(
            (column) =>
              `<button type="button" class="erd-field" data-erd-action="field" data-table="${escape(table.name)}" data-field="${escape(column.name)}" title="${escape(column.name + " · " + column.type + " · " + column.description)}"><span class="erd-field-name">${escape(column.name)}</span><span class="erd-keys">${badges(table, column)}</span><small>${escape(column.type || "—")}</small></button>`,
          )
          .join(
            "",
          )}</div><footer><button type="button" data-erd-action="preview" data-table="${escape(table.name)}">预览</button></footer></section>`;
      })
      .join("");
    edges.setAttribute("width", String(layout.graph().width + 100));
    edges.setAttribute("height", String(layout.graph().height + 100));
    function port(tableName, column, side) {
      const node = layout.node(nodeKeys.get(tableName)),
        list = tables.get(tableName).columns;
      const index = list.findIndex((field) => field.name === column);
      return {
        x: node.x + (side === "right" ? WIDTH / 2 : -WIDTH / 2),
        y:
          node.y -
          node.height / 2 +
          (column && index >= 0 ? HEADER + index * ROW + ROW / 2 : HEADER / 2),
      };
    }
    edges.innerHTML = links
      .map((relation) => {
        const route = layout.edge({
          v: nodeKeys.get(relation.fromTable),
          w: nodeKeys.get(relation.toTable),
          name: relation.id,
        });
        const from = layout.node(nodeKeys.get(relation.fromTable)),
          to = layout.node(nodeKeys.get(relation.toTable));
        const right = to.x >= from.x;
        const pairs = relation.fromColumns.length
          ? relation.fromColumns.map((column, index) => [
              column,
              relation.toColumns[index],
            ])
          : [[null, null]];
        const paths = pairs
          .map(([source, target], index) => {
            const a = port(
              relation.fromTable,
              source,
              right ? "right" : "left",
            );
            const b = port(
              relation.toTable,
              target,
              relation.fromTable === relation.toTable
                ? "right"
                : right
                  ? "left"
                  : "right",
            );
            let d;
            if (relation.fromTable === relation.toTable)
              d = `M ${a.x} ${a.y} C ${a.x + 70} ${a.y - 30},${b.x + 70} ${b.y + 30},${b.x} ${b.y}`;
            else {
              const middle = route.points.slice(1, -1);
              const points = [
                a,
                { x: a.x + (right ? 24 : -24), y: a.y },
                ...middle,
                { x: b.x + (right ? -24 : 24), y: b.y },
                b,
              ];
              d = points
                .map(
                  (point, index) =>
                    `${index ? "L" : "M"} ${point.x} ${point.y}`,
                )
                .join(" ");
            }
            return `<path class="erd-wire" d="${d}" data-from-field="${escape(source || "")}" data-to-field="${escape(target || "")}"/>${index === 0 && relation.kind === "foreign" ? `<text x="${a.x + (right ? 8 : -8)}" y="${a.y - 7}" text-anchor="${right ? "start" : "end"}">${relation.fromCardinality}</text><text x="${b.x + (right ? -8 : 8)}" y="${b.y - 7}" text-anchor="${right ? "end" : "start"}">${relation.toCardinality}</text>` : ""}`;
          })
          .join("");
        const label =
          relation.kind === "view"
            ? `${relation.fromTable} → ${relation.toTable} · 视图依赖`
            : relation.kind === "logical"
              ? `${relation.fromTable} → ${relation.toTable} · 逻辑关联`
              : `${relation.fromTable}(${relation.fromColumns.join(", ")}) → ${relation.toTable}(${relation.toColumns.join(", ")})，${relation.fromCardinality} 对 ${relation.toCardinality}`;
        return `<g class="erd-relation ${relation.kind}" data-relation="${escape(relation.id)}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${paths}</g>`;
      })
      .join("");
    container.querySelector(".erd-status").textContent =
      `${shown.length} / ${tables.size} 个表与视图 · ${links.length} 条关系`;
    highlight();
    if (shouldFit) fit();
    else applyTransform();
  }
  function select(name, shouldLocate = false) {
    state.selected = name;
    if (state.scope !== "all") draw();
    else highlight();
    if (shouldLocate) locate(name);
    results.hidden = true;
  }
  function tableInfo(name) {
    const table = tables.get(name);
    const dependencies = relations
      .filter(
        (relation) => relation.kind === "view" && relation.fromTable === name,
      )
      .map((relation) => relation.toTable);
    inspector.hidden = false;
    inspector.innerHTML = `<div class="row between"><strong>${escape(name)}</strong><button type="button" class="erd-icon" data-erd-action="close" aria-label="关闭表详情">${icon("close")}</button></div><p>${escape(table.description || "数据字典未提供中文说明")}</p><small>${table.type === "view" ? "视图" : "数据表"} · ${table.columns.length} 个字段</small>${table.primaryKey.length ? `<p>主键 (${escape(table.primaryKey.join(", "))})</p>` : ""}${table.indexes
      .filter((index) => index.unique && index.origin !== "pk")
      .map(
        (index) =>
          `<p>${index.partial ? "条件唯一 UK*" : "唯一键 UK"} (${escape(index.columns.map((name) => name || "表达式").join(", "))})${index.columns.includes(null) || index.partial ? `<br><code>${escape(index.sql)}</code>` : ""}</p>`,
      )
      .join(
        "",
      )}${dependencies.length ? `<p>依赖 ${escape(dependencies.join("、"))}</p>` : ""}`;
  }
  function fieldInfo(tableName, columnName) {
    const table = tables.get(tableName),
      column = table.columns.find((column) => column.name === columnName);
    const constraints = table.indexes
      .filter((index) => index.unique && index.columns.includes(columnName))
      .map(
        (index) =>
          `<p>${index.partial ? "条件唯一" : "唯一键"} (${escape(index.columns.map((name) => name || "表达式").join(", "))})${index.partial ? " · 仅对满足索引条件的记录生效" : ""}</p>`,
      )
      .join("");
    const links = relations.filter(
      (relation) =>
        (relation.fromTable === tableName &&
          relation.fromColumns.includes(columnName)) ||
        (relation.toTable === tableName &&
          relation.toColumns.includes(columnName)),
    );
    inspector.hidden = false;
    inspector.innerHTML = `<div class="row between"><strong>${escape(tableName)} · ${escape(columnName)}</strong><button type="button" class="erd-icon" data-erd-action="close" aria-label="关闭字段详情">${icon("close")}</button></div><p>${escape(column.description || "数据字典未提供中文说明")}</p><small>${escape(column.type || "未声明类型")} · ${column.nullable ? "允许 NULL" : "不允许 NULL"}${column.generated ? " · 生成列" : ""}</small>${column.primaryKeyOrder ? `<p>主键 (${escape(table.primaryKey.join(", "))}) · 第 ${column.primaryKeyOrder} 位</p>` : ""}${column.defaultValue !== null ? `<p>默认值 ${escape(column.defaultValue)}</p>` : ""}${constraints}${links.map((relation) => `<p>${relation.kind === "logical" ? "逻辑关联" : "外键"} ${escape(relation.fromTable)} (${escape(relation.fromColumns.join(", "))}) → ${escape(relation.toTable)} (${escape(relation.toColumns.join(", "))})${relation.kind === "foreign" ? `<br>${relation.fromCardinality} 对 ${relation.toCardinality} · 删除 ${escape(relation.onDelete)} · 更新 ${escape(relation.onUpdate)}` : ""}</p>`).join("")}`;
  }
  function fullscreen(value) {
    state.fullscreen = value;
    container.classList.toggle("erd-fullscreen", value);
    document.body.classList.toggle("erd-is-fullscreen", value);
    const button = container.querySelector("[data-erd-action=expand]");
    button.innerHTML = icon(value ? "shrink" : "expand");
    button.setAttribute(
      "aria-label",
      value ? "退出关系图全屏" : "全屏查看关系图",
    );
    button.title = button.getAttribute("aria-label");
  }
  listen(container, "click", (event) => {
    const button = event.target.closest("[data-erd-action]");
    if (
      !button ||
      (button.closest(".erd-node") && performance.now() < suppressClickUntil)
    )
      return;
    const name = button.dataset.table;
    switch (button.dataset.erdAction) {
      case "select":
        select(name);
        tableInfo(name);
        break;
      case "field":
        select(name);
        fieldInfo(name, button.dataset.field);
        break;
      case "preview":
        onPreview(name);
        break;
      case "fit":
        fit();
        break;
      case "reset":
        state.scope = defaultScope;
        state.selected = defaultScope === "all" ? null : initial;
        scope.value = state.scope;
        search.value = "";
        results.hidden = true;
        inspector.hidden = true;
        draw(true);
        if (initial) locate(initial);
        break;
      case "expand":
        fullscreen(!state.fullscreen);
        break;
      case "plus":
        zoomAt(state.zoom * 1.4);
        break;
      case "minus":
        zoomAt(state.zoom / 1.4);
        break;
      case "close":
        inspector.hidden = true;
        break;
      case "locate":
        search.value = name;
        select(name, true);
        break;
    }
  });
  listen(scope, "change", () => {
    state.scope = scope.value;
    state.selected ||= initial;
    draw(true);
  });
  function matches() {
    const term = search.value.trim().toLowerCase();
    return [...tables.values()]
      .filter(
        (table) =>
          table.name.toLowerCase().includes(term) ||
          table.description.toLowerCase().includes(term),
      )
      .slice(0, 12);
  }
  listen(search, "input", () => {
    results.hidden = !search.value.trim();
    const found = matches();
    results.innerHTML = found.length
      ? found
          .map(
            (table) =>
              `<button type="button" role="option" aria-selected="${state.selected === table.name}" data-erd-action="locate" data-table="${escape(table.name)}">${escape(table.name)}<small>${escape(table.description)}</small></button>`,
          )
          .join("")
      : "<p>没有匹配的数据表</p>";
  });
  listen(search, "keydown", (event) => {
    if (event.key === "Enter" && matches()[0]) {
      event.preventDefault();
      const name = matches()[0].name;
      search.value = name;
      select(name, true);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      results.querySelector("button")?.focus();
    }
    if (event.key === "Escape") results.hidden = true;
  });
  listen(document, "keydown", (event) => {
    if (event.key === "Escape") {
      if (!inspector.hidden) inspector.hidden = true;
      else if (state.fullscreen) fullscreen(false);
    }
  });
  listen(viewport, "keydown", (event) => {
    if (event.target !== viewport) return;
    if (event.key === "+" || event.key === "=") zoomAt(state.zoom * 1.4);
    else if (event.key === "-") zoomAt(state.zoom / 1.4);
    else if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      event.preventDefault();
      state.pan.x +=
        event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0;
      state.pan.y +=
        event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0;
      applyTransform();
    }
  });
  const pointers = new Map();
  let gesture;
  function beginGesture() {
    const points = [...pointers.values()];
    if (!points.length) {
      gesture = null;
      return;
    }
    if (points.length === 1)
      gesture = { point: points[0], pan: { ...state.pan } };
    else {
      const a = points[0],
        b = points[1],
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      gesture = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: state.zoom,
        anchor: {
          x: (mid.x - state.pan.x) / state.zoom,
          y: (mid.y - state.pan.y) / state.zoom,
        },
      };
    }
  }
  function point(event) {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  listen(viewport, "pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(".erd-zoom")) return;
    pointers.set(event.pointerId, point(event));
    event.target.setPointerCapture(event.pointerId);
    beginGesture();
  });
  listen(viewport, "pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, point(event));
    const points = [...pointers.values()];
    if (points.length >= 2 && gesture?.distance) {
      const [a, b] = points,
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      state.zoom = Math.max(
        0.025,
        Math.min(
          2.5,
          (gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.distance,
        ),
      );
      state.pan = {
        x: mid.x - gesture.anchor.x * state.zoom,
        y: mid.y - gesture.anchor.y * state.zoom,
      };
      suppressClickUntil = performance.now() + 250;
    } else if (gesture?.point) {
      const dx = points[0].x - gesture.point.x,
        dy = points[0].y - gesture.point.y;
      if (Math.hypot(dx, dy) < 5) return;
      state.pan = { x: gesture.pan.x + dx, y: gesture.pan.y + dy };
      suppressClickUntil = performance.now() + 250;
    }
    applyTransform();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    listen(viewport, event, (event) => {
      pointers.delete(event.pointerId);
      beginGesture();
    });
  listen(
    viewport,
    "wheel",
    (event) => {
      event.preventDefault();
      zoomAt(state.zoom * Math.exp(-event.deltaY * 0.002), point(event));
    },
    { passive: false },
  );
  let viewportSize = `${viewport.clientWidth}:${viewport.clientHeight}`;
  const observer = new ResizeObserver(() => {
    const size = `${viewport.clientWidth}:${viewport.clientHeight}`;
    if (!disposed && size !== viewportSize) fit();
    viewportSize = size;
  });
  observer.observe(viewport);
  draw(true);
  if (initial) locate(state.selected || initial);
  if (!shown.length)
    container.querySelector(".erd-status").textContent = "当前数据库没有数据表";
  return () => {
    disposed = true;
    observer.disconnect();
    listeners.forEach((remove) => remove());
    document.body.classList.remove("erd-is-fullscreen");
  };
}
