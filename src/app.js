import { lessonComplete, lessonNote, lessonNoteKey, migrateLessonBookmarks } from "./curriculum-progress.js";
import { isCurrentQuestionAttempt, questionDraft } from "./question-progress.js";
import { actionIconPaths } from "./action-icons.js";
import { hasIcon, iconSvg } from "./icons-v2.js";
import { renderFigures, rowFlowStep } from "./figures.js";
import { islandSvg, islandLitCount } from "./island.js";
import islandSource from "../resources/ASSETS/v2/illustrations/milestone/milestone.svg";
import { contourSvg, tideSvg } from "./decor.js";
import { diffComparison } from "./result-diff.js";
import { fetchLatestUpdate, UPDATE_REPOSITORY } from "./updates.js";
import release from "../release.json";
import { editorBody, mountEditor, editorCommand } from "./editor.js";
import { mountErd } from "./erd.js";
import { businessErdDictionary } from "./erd-dictionary.js";
import { requirementSections, readingChunks } from "./lesson-presentation.js";
import { formatSqlForDisplay } from "./sql-format.js";
import { createCardView } from "./flashcard-view.js";
import { TYPE_ORDER, TYPE_LABELS, TIER_ORDER } from "./flashcard-model.mjs";
import { fsrs, createEmptyCard } from "ts-fsrs";
import * as XLSX from "xlsx";
import {
  openStore,
  save,
  defaults,
  datasets,
  putDataset,
  deleteDataset,
  restoreAll,
} from "./store.js";
const app = document.querySelector("#app");
const e = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  back: "m15 18-6-6 6-6",
  right: "m9 5 7 7-7 7",
  search: "m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  check: "m5 12 4 4L19 6",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
  code: "m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 4 4 1v8l-4 1-1 4H9l-1-4-4-1V8l4-1Z",
  cloud: "M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 1 10h-1 M9 16l2 2 4-5",
  book: "M12 5v15 M12 5C9 3 5 3 2 4v14c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1",
  cards: "M4 6h14v14H4Z M8 2h14v14",
  chart: "M5 20v-6 M12 20V9 M19 20V3",
  plus: "M12 5v14 M5 12h14",
  close: "m6 6 12 12 M6 18 18 6",
  copy: "M9 9h11v11H9Z M5 15H4V4h11v1",
  wrap: "M4 6h16 M4 12h12a3 3 0 0 1 0 6h-4 M13 15l-3 3 3 3 M4 18h3",
  down: "m6 9 6 6 6-6",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  edit: "m4 16-1 5 5-1L21 7l-5-5Z M14 4l6 6",
  database:
    "M20 6c0 2-4 4-8 4s-8-2-8-4 4-4 8-4 8 2 8 4ZM4 6v12c0 2 4 4 8 4s8-2 8-4V6 M4 12c0 2 4 4 8 4s8-2 8-4",
  clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  wrong: "M5 3h14v18H5Z M9 9l6 6 M15 9l-6 6",
  play: "m8 4 13 8-13 8Z",
  flip: "M4 8h13l-3-3 M20 16H7l3 3",
  skip: "m6 5 9 7-9 7Z M18 5v14",
  undo: "M9 5 3 10l6 5 M3 10h10a7 7 0 0 1 7 7",
  reset: "M3 11a9 9 0 1 1 2.6 6.4 M3 4v7h7",
  redo: "m15 5 6 5-6 5 M21 10H11a7 7 0 0 0-7 7",
  expand: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
  shrink: "M3 8h5V3 M21 8h-5V3 M8 21v-5H3 M16 21v-5h5",
  keyboard:
    "M3 5h18v14H3Z M6 9h1 m3 0h1 m3 0h1 m3 0h1 M6 12h1 m3 0h1 m3 0h1 m3 0h1 M7 16h10",
  phone:
    "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M10 18h4",
};
const icon = (name, cls = "") =>
  hasIcon(name) ? iconSvg(name, cls) : `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
const actionIcon = (name) => hasIcon(name) ? iconSvg(name, "material-icon") : `<svg class="icon material-icon" viewBox="0 0 24 24" aria-hidden="true">${actionIconPaths[name].map((path) => `<path d="${path}"/>`).join("")}</svg>`;
const image = (path, cls = "", alt = "") =>
  `<img class="${cls}" src="assets/${path}.png" alt="${e(alt)}">`;
const button = (label, action, arg = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" data-arg="${e(arg)}">${label}</button>`;
const goButton = (label, route, cls = "") => button(label, "go", route, cls);
// 纯图标按钮：补 aria-label（屏幕阅读器朗读名称），图标本身 aria-hidden。
const labelled = (html, name) => html.replace("<button ", `<button aria-label="${e(name)}" `);
const code = (sql) => `<pre><code>${e(formatSqlForDisplay(sql))}</code></pre>`;
// 分步执行：高亮“这一步新增的代码”。有上一步（同为可运行步骤）时，按词比较，只高亮相对上一步新增的词；没有可比较的上一步（首步、片段）则整段都是这一步引入的。
// 数据表较多（超过 2 张）时，表区域限高并改为上下滑动，避免每一步都把页面撑得很长。
const stepTables = (tables) => (tables || []).length > 2 ? `<div class="step-tables" tabindex="0" role="region" aria-label="示例数据表（可上下滑动）">${renderTables(tables)}</div>` : renderTables(tables);
function newCode(sql, previous) {
  const text = formatSqlForDisplay(sql);
  const parts = text.split(/(\s+)/);
  const words = [];
  parts.forEach((part, index) => { if (part && !/^\s+$/.test(part)) words.push(index); });
  const before = previous == null ? null : formatSqlForDisplay(previous).split(/\s+/).filter(Boolean).map((w) => w.replace(/;$/, ""));
  const now = words.map((index) => parts[index].replace(/;$/, ""));
  let isNew = now.map(() => true);
  if (before) {
    const n = before.length, m = now.length;
    const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = before[i] === now[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    isNew = now.map(() => true);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (before[i] === now[j]) { isNew[j] = false; i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++;
    }
  }
  const flagAt = new Map(words.map((index, w) => [index, isNew[w]]));
  let html = "", open = false;
  parts.forEach((part, index) => {
    if (!part) return;
    if (/^\s+$/.test(part)) {
      const nextWord = words.find((w) => w > index);
      const keep = open && nextWord !== undefined && flagAt.get(nextWord);
      if (open && !keep) { html += "</mark>"; open = false; }
      html += e(part);
      return;
    }
    const flag = flagAt.get(index);
    if (flag && !open) { html += '<mark class="step-new">'; open = true; }
    if (!flag && open) { html += "</mark>"; open = false; }
    html += e(part);
  });
  if (open) html += "</mark>";
  return `<pre><code>${html}</code></pre>`;
}
const table = (columns, rows, limit = 40) =>
  `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${e(typeof c === "object" ? c.name : c)}</th>`).join("")}</tr></thead><tbody>${rows
    .slice(0, limit)
    .map(
      (r) =>
        `<tr>${r.map((v) => `<td>${v === null ? '<span class="muted">NULL</span>' : e(v)}</td>`).join("")}</tr>`,
    )
    .join(
      "",
    )}</tbody></table></div>${rows.length > limit ? `<small>展示前 ${limit} 行，共 ${rows.length} 行</small>` : ""}`;
const tag = (text, cls = "") => `<span class="tag ${cls}">${e(text)}</span>`;
const cardView = createCardView({ e, table, code, tag, formatSql: formatSqlForDisplay, runSlot: (card, label, recordedHtml) => cardRunSlot(card, label, recordedHtml) });
let cardPreview = { type: "concept", index: 0, face: "front" };
// 个人闪卡是简单的“问题/答案/解释”结构，转成同一套双面结构后与正式卡共用渲染。
const isRichCard = (c) => Array.isArray(c.back?.sections);
function asRichCard(c) {
  if (isRichCard(c)) return c;
  const sections = [];
  if (c.back?.explanation) sections.push({ type: "text", title: "补充解释", content: c.back.explanation });
  const sql = c.back?.sqliteCode || c.back?.code;
  if (sql) sections.push({ type: "code", title: "SQL 示例", content: sql });
  return { id: c.id, type: "user", typeLabel: "个人闪卡", tags: c.tags || [], front: { prompt: c.front?.question ?? "", code: c.front?.code }, back: { answer: c.back?.answer ?? "", sections }, illustrationKey: null };
}
const cardRuns = new Map();
function cardExamples(c) {
  const list = Array.isArray(c.examples) && c.examples.length ? c.examples : c.example ? [c.example] : [];
  return list.filter((x) => x && typeof x.setupSql === "string" && (x.sqliteSql || x.sql));
}
const sameResult = (a, b) => JSON.stringify(a.columns) === JSON.stringify(b.columns) && JSON.stringify(a.rows) === JSON.stringify(b.rows);
function cardRunResult(ex, outcome) {
  if (outcome.error) {
    return ex.expectedError || ex.expected?.error ? `<span class="result-tag actual">预期报错</span> <small>${e(outcome.error)}</small>` : `<span class="result-tag">运行出错</span> <small>${e(outcome.error)}</small>`;
  }
  const r = outcome.result;
  const note = ex.expected ? (sameResult(ex.expected, r) ? "与卡片记录的结果一致" : "与卡片记录的结果不一致（未验证）") : "";
  return `<span class="result-tag actual">运行结果</span> <small>${r.rowCount} 行${note && !/一致$/.test(note) ? " · " + note : ""}</small>${table(r.columns, r.rows.slice(0, 20))}`;
}
// 函数用法卡新版背面：运行按钮放在每个示例的“查询结果”区域，结果在原位置展示（默认显示卡片记录的结果）。
function cardRunSlot(card, label, recordedHtml) {
  const list = cardExamples(card);
  const i = list.findIndex((x) => x.label === label);
  if (i < 0) return `<div class="fc-fn-result"><div class="fc-fn-result-head"><b>查询结果</b></div>${recordedHtml}</div>`;
  const ex = list[i];
  const blocked = ex.localExecution?.error || ex.localExecution?.pass === false;
  const key = card.id + "|" + i;
  return `<div class="fc-fn-result"><div class="fc-fn-result-head"><b>查询结果</b>${blocked ? '<small class="muted">暂不支持在本应用运行</small>' : button(icon("play") + " 运行", "cardRun", key, "small-button")}</div><div class="fc-run-out" data-run="${e(key)}">${cardRuns.has(key) ? cardRuns.get(key) : recordedHtml}</div></div>`;
}
function cardRunBlock(c) {
  if (cardView.hasFunctionLayout(c)) return "";
  const list = cardExamples(c);
  if (!list.length) return "";
  return `<section class="fc-sec fc-runs"><h3 class="fc-h"><i></i>运行示例</h3><p class="fc-hint">在内置示例数据上用 SQLite 兼容方式执行，并非原生 MySQL 8.4。</p>${list.map((ex, i) => {
    const blocked = ex.teachingExecution?.error || ex.localExecution?.error;
    const key = c.id + "|" + i;
    return `<div class="fc-run"><div class="row between"><b>${e(ex.label || "示例 " + (i + 1))}</b>${blocked ? '<small class="muted">暂不支持本地执行</small>' : button(icon("play") + " 运行", "cardRun", key, "small-button")}</div><div class="fc-run-out" data-run="${e(key)}">${cardRuns.has(key) ? cardRuns.get(key) : ""}</div></div>`;
  }).join("")}</section>`;
}
// B10：新版插画（resources/ASSETS/v2/illustrations/final）。空态默认 08 问号；搜索无结果传 09。
const finalArt = (name, cls = "") => image("v2/illustrations/final/" + name, cls);
const businessArt = (name, cls = "") => finalArt({ retail_sales: "02", ecommerce_customer: "03", inventory_management: "04", procurement_data: "05", financial_data: "06", human_resources: "07" }[name] + "_business_" + name, cls);
const empty = (title, description = "", action = "", art = "08_empty_question") =>
  `<div class="empty">${finalArt(art)}<h3>${e(title)}</h3>${description ? `<p>${e(description)}</p>` : ""}${action}</div>`;
const linkRow = (title, description, route, ico = "book", asset = false) =>
  goButton(
    `<span class="list-icon">${asset ? icon(ico) : icon(ico)}</span><div class="grow"><h3>${e(title)}</h3>${description ? `<small>${e(description)}</small>` : ""}</div>${icon("right", "chevron")}`,
    route,
    description ? "link-row" : "link-row compact",
  );
let content, state, dbManifest;
let revision = 0;
let worker,
  requestId = 0,
  pending = new Map();
let busy = false,
  quizTab = "题目",
  labTab = "代码",
  flashBack = false,
  flashGraded = false,
  lastResult = null,
  feedback = null;
let search = "",
  questionFilters = { chapter: "", type: "", difficulty: "", status: "" };
const listPositions = new Map();
let learningSearchView = null, practiceFilterView = null;
let questionSequence = null;
let questionKeyboard = false;
let quizScroll = {};
let quizExpanded = false;
let lessonExampleResult = null;
const questionTableCache = new Map();
const projectSchemas = new Map();
let selectedOption = "",
  hints = 0,
  answerShown = false,
  loadedQuestionId = null;
let currentLab = "lesson",
  labInfo = null,
  personal = [];
let importData = null,
  importName = "",
  importFileName = "";
let newMode = "每日到期";
let cardChapter = "ch01", cardSearch = "", cardBrowseLimit = 40;
let cardScheduled = true, spotId = null, spotBack = false, spotHistory = [], cardBrowseChapter = "", cardTypeFilter = "", cardTierFilter = "";
const cardFlipped = new Set();
const modeLabels = { 每日到期: "今日待复习", 新卡: "新卡", 薄弱: "困难/薄弱", 章节: "按章节", 自定义: "自定义卡", 收藏: "收藏卡", 随机: "随机自由浏览" };
const labResults = new Map();
let labDataView = "list";
let disposeErd = null;
let labOpenRevision = 0;
let tablePreviewRevision = 0;
let updateState = { status: "idle", message: "尚未检查", progress: 0 };
let nativeVersion = null;
let editorFields = [];
const questionFieldCache = new Map();
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
const now = () => new Date();
const today = () => localDay(now());
function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function startWorker() {
  worker = new Worker("sql-worker.js");
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    data.error
      ? request.reject(new Error(data.error))
      : request.resolve(data.result);
  };
  worker.onerror = () => stopSql("SQL 引擎启动失败，请重新打开页面。");
}
function rpc(action, payload = {}, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(
      () => stopSql("查询超过执行时限，已停止。请缩小数据范围后重试。"),
      timeout,
    );
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, action, payload });
  });
}
function stopSql(message = "已停止执行，未完成的更改未保存。") {
  worker.terminate();
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(message));
  }
  pending.clear();
  labInfo = null;
  startWorker();
}
function toast(message) {
  const bar = document.querySelector("#snackbar");
  bar.textContent = message;
  bar.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => bar.classList.remove("show"), 3500);
}
async function persist() {
  await save(state);
}
async function markActivity() {
  const firstToday = !state.activity[today()];
  state.activity[today()] = (state.activity[today()] || 0) + 1;
  await persist();
  cheerStreak(firstToday);
}
const getChapter = (id) => content.chapters.find((c) => c.id === id);
const knowledgePoints = () => content.chapters.flatMap((c) => c.knowledgePoints);
const getKP = (id) => knowledgePoints().find((k) => k.id === id);
const completedLesson = (id) => lessonComplete(state, content.curriculumMigration, id);
const completedKnowledgePoints = () => knowledgePoints().filter((k) => completedLesson(k.id)).length;
const getQuestion = (id) => content.questions.find((q) => q.id === id);
const allCards = () => [...content.cards, ...state.userCards];
const favorite = (id) => state.favorites.includes(id);
const favButton = (id) =>
  labelled(
    button(icon("star"), "favorite", id, "icon-button favorite " + (favorite(id) ? "selected" : "")),
    favorite(id) ? "取消收藏" : "收藏",
  ).replace("<button ", `<button aria-pressed="${favorite(id)}" `);
const currentAttempt = (attempt) => isCurrentQuestionAttempt(attempt, getQuestion(attempt.questionId));
const attempted = (id) => state.attempts.filter((a) => a.questionId === id && currentAttempt(a));
const draftForQuestion = (id) => questionDraft(state.drafts[id], getQuestion(id));
const independentDone = (id) =>
  attempted(id).some((a) => a.pass && a.independent);
function wrongQuestions() {
  return content.questions.filter((q) =>
    attempted(q.id).some((a) => !a.pass && !a.ungraded),
  );
}
function masteredWrong(id) {
  const list = attempted(id)
    .filter((a) => !a.ungraded)
    .slice(-2);
  return list.length === 2 && list.every((a) => a.pass && a.independent);
}
function route() {
  return decodeURIComponent(location.hash.slice(1) || "/");
}
function navigate(path) {
  const current = route();
  if (current === "/learn" || current.startsWith("/practice")) {
    listPositions.set(current, { search, scroll: window.scrollY });
  }
  search = "";
  if (route() === path) render();
  else location.hash = encodeURI(path);
}

// ===== 全局浮层：底部面板与确认弹窗（UI_SYSTEM §4.6–§4.7）=====
let topLayer = null;
function overlayRoot() {
  let root = document.querySelector("#overlay-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "overlay-root";
    document.body.append(root);
  }
  return root;
}
function closeTopLayer() {
  if (!topLayer) return false;
  topLayer.dismiss();
  return true;
}
function showLayer(node, scrim, dismiss) {
  const root = overlayRoot();
  root.append(scrim, node);
  const previous = document.activeElement;
  const layer = {
    dismiss: () => {
      if (topLayer !== layer) return;
      topLayer = null;
      node.classList.remove("on");
      scrim.classList.remove("on");
      node.setAttribute("aria-hidden", "true");
      setTimeout(() => { node.remove(); scrim.remove(); }, 260);
      previous?.focus?.();
      dismiss();
    },
  };
  topLayer = layer;
  requestAnimationFrame(() => {
    node.classList.add("on");
    scrim.classList.add("on");
    node.setAttribute("aria-hidden", "false");
  });
  return layer;
}
// 不可逆确认：点遮罩不关闭；返回键/Esc = 取消。resolve(true) 仅在点确认时。
function confirmDialog({ title, message, confirmLabel = "确认", danger = true }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `<h2>${e(title)}</h2><p>${e(message)}</p><div class="dialog-actions"><button class="outline" data-dialog="cancel">取消</button><button class="${danger ? "danger" : "primary"}" data-dialog="ok">${e(confirmLabel)}</button></div>`;
    const scrim = document.createElement("div");
    scrim.className = "scrim dialog-scrim";
    let result = false;
    const layer = showLayer(dialog, scrim, () => resolve(result));
    dialog.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-dialog]")?.dataset.dialog;
      if (!choice) return;
      result = choice === "ok";
      layer.dismiss();
    });
    dialog.querySelector('[data-dialog="cancel"]').focus();
  });
}
// 里程碑 / 鼓励弹窗（B10）：章节学完、全部课程学完、连续学习、首次答对难题。
// 弹窗依次排队，不叠加；里程碑矢量只在弹窗里出现一次，系统“减少动画”时直接显示最终态。
let celebrationChain = Promise.resolve();
function cheer(options) {
  celebrationChain = celebrationChain.then(() => celebrate(options)).catch(() => {});
}
function celebrate({ art, title, message, actionLabel, route: target }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    dialog.className = "dialog celebrate";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.innerHTML = `${art}<h2>${e(title)}</h2><p>${e(message)}</p><div class="dialog-actions"><button class="outline" data-dialog="close">关闭</button>${target ? `<button class="primary" data-dialog="go">${e(actionLabel)}</button>` : ""}</div>`;
    const scrim = document.createElement("div");
    scrim.className = "scrim dialog-scrim";
    let toRoute = false;
    const layer = showLayer(dialog, scrim, () => { if (toRoute && target) navigate(target); resolve(); });
    dialog.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-dialog]")?.dataset.dialog;
      if (!choice) return;
      toRoute = choice === "go";
      layer.dismiss();
    });
    requestAnimationFrame(() => playMilestone({}));
    dialog.querySelector("button")?.focus();
  });
}
const HARD_LEVELS = ["困难", "挑战"];
function cheerStreak(firstToday) {
  if (!firstToday) return;
  const streak = studyStreak();
  if ([7, 30, 100].includes(streak)) cheer({ art: finalArt("13_encourage", "summary-illustration"), title: `连续学习 ${streak} 天`, message: "每天坚持一点点，数据岛正在一块一块亮起来。", actionLabel: "继续学习", route: "/learn" });
}
window.addEventListener("keydown", (event) => { if (event.key === "Escape" && closeTopLayer()) event.preventDefault(); });
window.addEventListener("hashchange", () => closeTopLayer());
// ===== B5：长题干折叠 / 滑动切题 =====
function syncStems() {
  const box = document.querySelector(".quiz-split");
  if (box) {
    // 作答页：题目区默认可完整滚动；内容超出时出现“展开全文”，展开后整页一起滚动，并提供“收回”
    const pane = box.querySelector('.quiz-pane[data-pane="题目"]');
    const toggle = pane?.querySelector(".stem-toggle");
    if (!toggle) return;
    const expanded = box.classList.contains("expanded");
    toggle.textContent = expanded ? "收回" : "展开全文";
    toggle.hidden = expanded ? false : pane.hidden || pane.scrollHeight <= pane.clientHeight + 4;
    return;
  }
  document.querySelectorAll(".stem").forEach((stem) => {
    const text = stem.querySelector(".stem-text");
    const button = stem.querySelector(".stem-toggle");
    if (!button) return;
    const wasOpen = stem.classList.contains("open");
    stem.classList.remove("open", "mini");
    const lineHeight = parseFloat(getComputedStyle(text.querySelector("p") || text).lineHeight) || 24;
    const clamped = text.scrollHeight > lineHeight * 8; // 内容明显超过 6 行（含小标题与间距）才折叠，短题干完整显示
    stem.classList.toggle("clamped", clamped);
    button.hidden = !clamped;
    // 展开后不再放“收起”按钮：向下阅读后滚回题目区顶部，题干自动折叠（见 mountQuizSplit）
    if (wasOpen && clamped) { stem.classList.add("open"); button.hidden = true; }
  });
}
let swipe = null;
app.addEventListener("touchstart", (event) => {
  swipe = null;
  if (!route().startsWith("/question/") || event.touches.length !== 1) return;
  if (document.body.classList.contains("has-sql-keyboard") || document.body.classList.contains("editor-is-fullscreen")) return;
  const touch = event.touches[0];
  if (touch.clientX < 20) return;
  if (event.target.closest(".sql-editor, textarea, input, select, pre, code, .table-wrap, table, .keyboard-wrap, button, summary, a, [role=tab], .editor-workspace")) return;
  if (!event.target.closest(".quiz-details")) return;
  swipe = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
app.addEventListener("touchend", (event) => {
  if (!swipe) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipe.x, dy = touch.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) < 80 || Math.abs(dx) < 2 * Math.abs(dy)) return;
  const [previous, next] = document.querySelectorAll(".quiz-details .sequence-actions button");
  const button = dx < 0 ? next : previous;
  if (!button) return;
  if (button.disabled) {
    const page = document.querySelector(".quiz-details");
    page.classList.remove("bounce-left", "bounce-right");
    void page.offsetWidth;
    page.classList.add(dx < 0 ? "bounce-left" : "bounce-right");
    setTimeout(() => page.classList.remove("bounce-left", "bounce-right"), 220);
    return;
  }
  button.click();
}, { passive: true });
// 闪卡复习页：左滑下一张（跳过）、右滑上一张；排程模式翻面后须先评分，所以背面不响应左滑
let cardSwipe = null;
app.addEventListener("touchstart", (event) => {
  cardSwipe = null;
  const onReview = route() === "/review" && state.flashSession;
  const onSpot = route() === "/cards" && document.querySelector('.fc-tap[data-action="spotFlip"]');
  if ((!onReview && !onSpot) || event.touches.length !== 1) return;
  const touch = event.touches[0];
  if (touch.clientX < 20) return;
  if (event.target.closest("button, summary, a, input, textarea, select, [role=tab]")) return;
  // 代码框/表格只有真的能滚动（内容超出）时才让给它自己滚，否则可以从上面滑动切卡
  for (let el = event.target; el && el !== app; el = el.parentElement) {
    if (!el.matches?.("pre, table, .table-wrap, .fc-scroll, .fc-code")) continue;
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) return;
  }
  const zone = onSpot ? event.target.closest(".fc-open, .fc-tap[data-action=spotFlip]") : event.target.closest(".fc-tap, .fc");
  if (!zone) return;
  cardSwipe = { x: touch.clientX, y: touch.clientY, spot: !!onSpot };
}, { passive: true });
app.addEventListener("touchend", (event) => {
  if (!cardSwipe) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - cardSwipe.x, dy = touch.clientY - cardSwipe.y;
  const cardSwipe0 = cardSwipe;
  cardSwipe = null;
  if (Math.abs(dx) < 80 || Math.abs(dx) < 2 * Math.abs(dy)) return;
  if (cardSwipe0.spot) {
    document.querySelector(dx < 0 ? '[data-action="spotNext"]' : '[data-action="spotPrev"]')?.click();
    return;
  }
  const target = document.querySelector(dx < 0 ? '[data-action="skipCard"]' : '[data-action="undoRating"], [data-action="prevCard"]');
  const session = state.flashSession;
  let usable = !!target;
  if (dx > 0 && session) {
    const lastRated = session.lastRating && session.lastRating.index === session.index - 1;
    const prevId = session.ids[session.index - 1];
    const prevRated = session.ratings.some((r) => r.cardId === prevId);
    // 上一张刚评过分 → 撤回评分回到它；上一张是跳过的 → 直接回去；更早已评分的不再回退
    if (session.index > 0 && lastRated) document.querySelector('[data-action="undoRating"]')?.click();
    else if (session.index > 0 && !prevRated) { session.index--; flashBack = false; persist().then(render); }
    else usable = false;
    if (usable) return;
  } else if (usable) { target.click(); return; }
  const card = document.querySelector(".fc-tap");
  if (card) { card.classList.remove("bounce-left", "bounce-right"); void card.offsetWidth; card.classList.add(dx < 0 ? "bounce-left" : "bounce-right"); setTimeout(() => card.classList.remove("bounce-left", "bounce-right"), 220); }
}, { passive: true });
window.addEventListener("resize", () => { if (route().startsWith("/question/")) requestAnimationFrame(syncStems); });
// 参考答案/解析的展开状态：默认折叠；用户点“查看参考答案”后展开，之后运行/提交重新渲染也保持用户当前的展开或折叠选择
const openFolds = new Set();
let foldQuestion = null;
app.addEventListener("toggle", (event) => {
  const fold = event.target.dataset?.fold;
  if (!fold || !loadedQuestionId) return;
  const key = loadedQuestionId + ":" + fold;
  if (event.target.open) openFolds.add(key); else openFolds.delete(key);
}, true);
app.addEventListener("keydown", (event) => {
  const card = event.target.closest?.('.flashcard[role="button"], .card-flip[role="button"]');
  if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); card.click(); }
});
let spyFrame = 0;
function lessonScrollSpy() {
  const nav = document.querySelector(".lesson-nav");
  if (!nav) return;
  const groups = { concept: ["concept"], syntax: ["syntax"], example: ["steps", "data", "example"], cautions: ["cautions"] };
  const line = 56 + 40 + 24;
  let active = null;
  for (const [key, names] of Object.entries(groups)) {
    for (const name of names) {
      const section = document.querySelector(`[data-lesson-section="${name}"]`);
      if (section && section.getBoundingClientRect().top <= line) active = key;
    }
  }
  const first = nav.querySelector("button");
  nav.querySelectorAll("button").forEach((b) => {
    if (b.dataset.arg === (active || first?.dataset.arg)) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  });
}
window.addEventListener("scroll", () => {
  document.body.classList.toggle("scrolled", window.scrollY > 2);
  if (!spyFrame) spyFrame = requestAnimationFrame(() => { spyFrame = 0; lessonScrollSpy(); });
}, { passive: true });
function applyBodyFont(size = state.settings.bodyFont) {
  const px = Math.min(20, Math.max(14, Number(size) || 15));
  document.documentElement.style.setProperty("--body-fs", px / 16 + "rem");
}
function shell(title, body, tab = "home", detail = false, extra = "") {
  const navigation = [
    ["home", "首页", "/"],
    ["learn", "学习", "/learn"],
    ["practice", "练习", "/practice"],
    ["flashcards", "闪卡", "/cards"],
    ["mine", "我的", "/mine"],
  ];
  app.innerHTML = `<header class="appbar ${detail ? "detail" : ""}">${detail ? labelled(button(icon("back"), "back", "", "icon-button"), "返回") : image("brand/logo_d", "logo")}<h1>${e(title)}</h1>${extra || (!detail ? labelled(goButton(icon("settings"), "/settings", "icon-button"), "设置") : '<span class="appbar-spacer"></span>')}</header><main class="page ${detail ? "detail" : ""}">${body}</main>${detail ? "" : `<nav aria-label="主导航">${navigation.map(([key, label, path]) => goButton(`<span class="nav-icon">${iconSvg(`${key}_${tab === key ? "active" : "inactive"}`, "nav-svg")}</span>${label}`, path, tab === key ? "active" : "")).join("")}</nav>`}`;
}
function completedChapter(c) {
  return c.knowledgePoints.every((k) => completedLesson(k.id));
}
function dueCards() {
  return allCards()
    .filter(
      (c) => state.reviews[c.id] && new Date(state.reviews[c.id].due) <= now(),
    )
    .sort(
      (a, b) =>
        new Date(state.reviews[a.id].due) - new Date(state.reviews[b.id].due),
    );
}
function studiedCards() {
  return Object.keys(state.reviews).filter((id) =>
    content.cards.some((c) => c.id === id),
  ).length;
}
function summaryStats() {
  const ids = [
    ...new Set(
      state.attempts.filter((a) => !a.ungraded && currentAttempt(a)).map((a) => a.questionId),
    ),
  ];
  const first = ids.map((id) =>
    state.attempts.find((a) => a.questionId === id && !a.ungraded && currentAttempt(a)),
  );
  return {
    count: ids.length,
    rate: first.length
      ? Math.round(
          (first.filter((a) => a.pass && a.independent).length / first.length) *
            100,
        )
      : null,
    done: content.questions.filter((q) => independentDone(q.id)).length,
  };
}
function learningDays() {
  return new Set([
    ...Object.keys(state.activity),
    ...Object.keys(state.studyDays || {}),
  ]);
}
function studyStreak() {
  const days = learningDays();
  let count = 0;
  const date = now();
  if (!days.has(localDay(date))) date.setDate(date.getDate() - 1);
  while (days.has(localDay(date))) {
    count++;
    date.setDate(date.getDate() - 1);
  }
  return count;
}
function home() {
  const next =
    getKP(state.lastLesson) ||
    content.chapters
      .flatMap((c) => c.knowledgePoints)
      .find((k) => !completedLesson(k.id)) ||
    getKP("kp01-01");
  const stats = summaryStats();
  const minutes = Math.floor((state.studySeconds || 0) / 60);
  const title = state.lastLesson ? next.title : "开启 SQL 第一课";
  const summary = state.lastLesson
    ? e(next.learningObjective)
    : `<span>${content.chapters.length} 章课程</span><span>${content.questions.length} 道练习题</span><span>${content.cards.length} 张闪卡</span>`;
  const stages = ["入门", "核心", "进阶", "实战"];
  const shortcuts = [
    ["代码实验室", "/lab", "code_lab", ""],
    ["业务实战", "/projects", "project", projects.length + " 个项目"],
    ["错题本", "/wrong", "wrongbook", wrongQuestions().length + " 道题"],
    ["收藏夹", "/favorites", "favorites", state.favorites.filter((id) => getKP(id) || getQuestion(id) || allCards().some((card) => card.id === id)).length + " 项"],
  ];
  shell(
    "数屿SQL",
    `<section class="panel continue learning-hero">${contourSvg("hero-contour")}${islandSvg(islandLitCount(completedKnowledgePoints(), knowledgePoints().length), islandSource, "learning-hero-art")}<div class="hero-text"><div class="study-badge">连续学习 ${studyStreak()} 天 · 累计 ${minutes} 分钟</div><h2>${e(title)}</h2><p class="hero-summary">${summary}</p></div><div class="hero-progress"><div class="progress" role="progressbar" aria-label="已学知识点" aria-valuemin="0" aria-valuemax="${knowledgePoints().length}" aria-valuenow="${completedKnowledgePoints()}"><span style="width:${knowledgePoints().length ? (completedKnowledgePoints() / knowledgePoints().length) * 100 : 0}%"></span></div><small>已学 ${completedKnowledgePoints()}/${knowledgePoints().length}</small></div><div class="hero-actions">${goButton(icon("play") + " " + (state.lastLesson ? "继续学习" : "开始学习"), "/lesson/" + next.id, "primary")}${goButton("待复习 " + dueCards().length + " 卡", "/cards", "hero-review")}</div></section>
    <div class="section-heading"><h2>快捷入口</h2></div><div class="home-shortcuts">${shortcuts.map(([label, route, asset, count]) => goButton(`<span class="list-icon">${icon(asset)}</span><span class="grow"><strong>${label}</strong>${count ? `<small>${count}</small>` : ""}</span>`, route, "shortcut-tile")).join("")}</div>
    ${tideSvg("tide")}<div class="section-heading"><h2>学习路线</h2>${goButton("查看统计", "/stats")}</div><div class="stats home-progress"><div class="stat"><strong>${completedKnowledgePoints()}<small> / ${knowledgePoints().length}</small></strong><small>学完知识点</small></div><div class="stat"><strong>${stats.done}<small> / ${content.questions.length}</small></strong><small>独立完成题目</small></div><div class="stat"><strong>${studiedCards()}<small> / ${content.cards.length}</small></strong><small>已学闪卡</small></div></div>
    <div class="panel home-stages">${stages.map((stage) => {
      const chapters = content.chapters.filter((c) => c.stage === stage);
      const points = chapters.flatMap((c) => c.knowledgePoints);
      const done = points.filter((k) => completedLesson(k.id)).length;
      return button(`<span class="grow"><strong>${stage}</strong><small>${chapters.length} 章 · 已学 ${done}/${points.length}</small><span class="progress"><span style="width:${points.length ? done / points.length * 100 : 0}%"></span></span></span>${icon("right", "chevron")}`, "homeStage", stage, "home-stage");
    }).join("")}</div>
    <div class="section-heading"><h2>业务实战</h2>${goButton("全部项目", "/projects")}</div><div class="home-projects" aria-label="业务项目">${projects.map((p) => {
      const tasks = content.questions.filter((q) => q.chapterId === "ch19" && q.projectId === p[0]);
      const done = tasks.filter((q) => independentDone(q.id)).length;
      return goButton(`${businessArt(p[3], "home-project-art")}<strong>${e(p[1])}</strong><small>${done} / ${tasks.length} 项任务已完成</small>`, "/projects/" + p[0], "home-project");
    }).join("")}</div><div class="notice">${icon("database")} 本地 SQLite 兼容执行 · MySQL 8.4 教学</div>`,
  );
}
function learning() {
  const view = state.learningView;
  const stages = ["全部", ...new Set(content.chapters.map((c) => c.stage))];
  const query = search.toLowerCase();
  const matching = content.chapters.filter(
    (c) =>
      (view.stage === "全部" || view.stage === c.stage) &&
      (!query ||
        c.title.toLowerCase().includes(query) ||
        c.knowledgePoints.some((k) =>
          (k.title + " " + k.concept + " " + k.syntax)
            .toLowerCase()
            .includes(query),
        )),
  );
  const searchKey = JSON.stringify([search, view.stage]);
  if (search && learningSearchView?.key !== searchKey) {
    learningSearchView = { key: searchKey, expanded: matching.map((c) => c.id) };
  }
  const expansion = search ? learningSearchView : view;
  const chapterSections = matching
      .map((c) => {
        const learned = c.knowledgePoints.filter((k) =>
          completedLesson(k.id),
        ).length;
        const expanded = expansion.expanded.includes(c.id);
        const points =
          search && !c.title.toLowerCase().includes(query)
            ? c.knowledgePoints.filter((k) =>
                (k.title + " " + k.concept + " " + k.syntax)
                  .toLowerCase()
                  .includes(query),
              )
            : c.knowledgePoints;
        const current = c.knowledgePoints.some((k) => k.id === state.lastLesson);
        const rows = points.map((k) => {
          const done = completedLesson(k.id);
          const active = k.id === state.lastLesson;
          const status = done
            ? '<span class="point-check status-icon done" aria-hidden="true"></span>'
            : '<span class="point-dot status-icon' + (active ? ' half' : '') + '" aria-hidden="true"></span>';
          const questionCount = (k.relatedQuestionIds || []).length;
          return goButton(
            status + '<span class="grow">' + e(k.title) + '</span>' +
              (active ? '<small class="learning-position">上次学到</small>' : '') + (questionCount ? '<span class="tag">' + questionCount + ' 题</span>' : ''),
            "/lesson/" + k.id,
            "knowledge-row" + (done ? " completed" : "") + (active ? " current" : ""),
          );
        }).join("");
        return `<section class="chapter-card${current ? " current-chapter" : ""}">
          <button class="chapter-toggle" data-action="toggleChapter" data-arg="${c.id}" aria-expanded="${!!expanded}" aria-controls="learn-points-${c.id}">
            <span class="chapter-number">${String(c.number).padStart(2, "0")}</span>
            <span class="chapter-main"><strong>${e(c.title)}${learned === c.knowledgePoints.length ? '<i class="done-dot" aria-hidden="true"></i><span class="sr-only">，本章已全部学完</span>' : ""}${current ? '<span class="sr-only">，上次学习的章节</span>' : ''}</strong><span class="barline"><span class="progress chapter-progress" role="progressbar" aria-label="${e(c.title)}学习进度" aria-valuemin="0" aria-valuemax="${c.knowledgePoints.length}" aria-valuenow="${learned}"><span style="width:${learned / c.knowledgePoints.length * 100}%"></span></span><small class="chapter-count" aria-label="已学 ${learned} 个，共 ${c.knowledgePoints.length} 个知识点">${learned}/${c.knowledgePoints.length}</small></span></span>
            ${icon("down", expanded ? "chevron expanded" : "chevron")}
          </button>
          <div id="learn-points-${c.id}" ${expanded ? '' : 'hidden'}>${expanded ? '<p class="chapter-goal">' + e(c.objective) + '</p><div class="chapter-points">' + rows + '</div>' : ''}</div>
        </section>`;
      })
      ;
  const stageGroups = stages.filter((stage) => stage !== "全部").map((stage) => {
    const indexes = matching.map((c, i) => (c.stage === stage ? i : -1)).filter((i) => i >= 0);
    if (!indexes.length) return "";
    const done = indexes.filter((i) => completedChapter(matching[i])).length;
    return `<div class="stage-h"><b>${e(stage)}</b><span class="aux">共 ${indexes.length} 章 · 已完成 ${done}</span></div><div class="panel route-list">${indexes.map((i) => chapterSections[i]).join("")}</div>`;
  }).join("");
    shell(
    "学习路线",
    `<div class="row between route-summary"><h2>体系课程</h2>${tag(completedKnowledgePoints() + " / " + knowledgePoints().length + " 已学")}</div><div class="search">${icon("search")}<input id="search" value="${e(search)}" placeholder="搜索知识点或语法" aria-label="搜索章节或知识点"></div><div class="chips stage-filters">${stages.map((stage) => button(stage, "learningStage", stage, "chip " + (view.stage === stage ? "selected" : ""))).join("")}</div><div class="chapter-list">${stageGroups}</div>${matching.length ? "" : empty("未找到相关内容", "", button("重置筛选", "resetLearning", "", "outline"), "09_empty_magnifier")}`,
    "learn",
  );
}
function chapterPage(id) {
  const c = getChapter(id);
  if (!c) return home();
  const done = c.knowledgePoints.filter((k) => completedLesson(k.id)).length;
  shell(c.title, `<div class="question-meta">${tag(c.stage)}<small>第 ${c.number} 章 · 已学 ${done} / ${c.knowledgePoints.length}</small></div><p class="chapter-objective">${e(c.objective)}</p><div class="progress" role="progressbar" aria-label="本章学习进度" aria-valuemin="0" aria-valuemax="${c.knowledgePoints.length}" aria-valuenow="${done}"><span style="width:${done / c.knowledgePoints.length * 100}%"></span></div><h2>本章知识点</h2>${c.knowledgePoints.map((k) => {
    const completed = completedLesson(k.id);
    return goButton(`${completed ? '<span class="point-check">' + icon("check") + '</span>' : '<span class="point-dot"></span>'}<span class="grow">${e(k.title)}</span>${k.id === state.lastLesson ? '<small class="learning-position">上次学到</small>' : ''}${icon("right", "chevron")}`, "/lesson/" + k.id, "knowledge-row" + (completed ? " completed" : "") + (k.id === state.lastLesson ? " current" : ""));
  }).join("")}`, "learn", true);
}
function renderTables(tables, expandable = true, descriptions = {}) {
  return (tables || []).map((t) => {
    const rows = t.rows || [];
    const rowCount = t.rowCount ?? rows.length;
    const displayedRows = expandable ? rows.length : Math.min(5, rows.length);
    // 课文里的示例数据表：样例数据整张直接展示，不折叠；其余场景（练习页等）仍只预览前 5 行。
    const preview = expandable ? table(t.columns, rows, Math.max(rows.length, 1)) : table(t.columns, rows.slice(0, 5));
    return `<section class="source-table"><div class="row between table-heading"><h3><span class="source-table-name" title="${e(t.name)}">${e(t.name)}</span></h3><small>${rowCount} 行</small></div>${descriptions[t.name] ? `<p class="source-table-description">${teachingText(descriptions[t.name])}</p>` : ""}${preview}${rowCount > displayedRows ? `<small>预览前 ${displayedRows} 行</small>` : ""}</section>`;
  }).join("");
}
function codeWrapPreferred() {
  try { return localStorage.getItem("lessonCodeWrap") !== "off"; } catch { return true; }
}
function codeBlock(inner) {
  const wrap = codeWrapPreferred();
  return `<div class="code-block ${wrap ? "" : "nowrap"}"><div class="code-head"><span class="code-lang">MySQL · 兼容</span><span class="grow"></span><button class="icon-button" data-action="codeWrap" aria-pressed="${wrap}" aria-label="自动换行">${icon("wrap")}</button><button class="icon-button" data-action="codeCopy" aria-label="复制代码">${icon("copy")}</button></div>${inner}</div>`;
}
function lessonCode(sql) {
  const formatted = formatSqlForDisplay(sql || "");
  if (formatted.split("\n").length <= 14) return codeBlock(code(sql));
  return codeBlock(`<details class="long-code"><summary><span class="code-expand-label">展开完整 SQL</span><span class="code-collapse-label">收起 SQL</span></summary>${code(sql)}</details><div class="code-excerpt" tabindex="0" role="region" aria-label="SQL 代码（可上下滑动）">${code(sql)}</div>`);
}
function sequenceButtons(previous, next, kind) {
  const item = (entry, direction) => `<button class="${direction === "next" ? "primary" : "outline"}" data-action="${kind === "lesson" ? "go" : "adjacentQuestion"}" data-arg="${entry ? (kind === "lesson" ? "/lesson/" : "/question/") + entry.id : ""}" ${!entry || busy ? "disabled" : ""}>${direction === "previous" ? actionIcon("back") : ""}${kind === "lesson" ? (direction === "previous" ? "上一节" : "下一节") : (direction === "previous" ? "上一题" : "下一题")}${direction === "next" ? actionIcon("right") : ""}</button>`;
  return `<div class="actions sequence-actions" aria-label="${kind === "lesson" ? "知识点切换" : "题目切换"}">${item(previous, "previous")}${item(next, "next")}</div>`;
}
function rich(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return `<p>${e(value)}</p>`;
  if (Array.isArray(value)) {
    if (!value.length) return "";
    if (value[0]?.name && value[0]?.columns) return renderTables(value);
    return `<ul>${value.map((v) => `<li>${typeof v === "object" ? rich(v) : e(v)}</li>`).join("")}</ul>`;
  }
  if (value.columns && value.rows) return table(value.columns, value.rows);
  return Object.entries(value)
    .map(([key, v]) => {
      if (["status", "fullResultPath", "sha256"].includes(key)) return "";
      const names = {
        question: "问题",
        answer: "答案",
        explanation: "解析",
        code: "SQL",
        sql: "SQL",
        mysqlSql: "MySQL 示例",
        sqliteSql: "兼容执行示例",
        sqliteCode: "SQLite 示例",
        verificationQuery: "验证查询",
        sourceTables: "原始数据",
        result: "结果",
        expectedResult: "结果",
        notes: "注意事项",
        data: "数据",
        tables: "数据表",
        commonMistake: "易错点",
        before: "原始数据",
        after: "处理结果",
      };
      return `${names[key] ? `<h3 style="margin:14px 0 6px">${names[key]}</h3>` : ""}${/sql|code|query/i.test(key) && typeof v === "string" ? code(v) : rich(v)}`;
    })
    .join("");
}
function teachingText(text) {
  return e(text).replace(/数据粒度|数据类型|三值逻辑|精确十进制|主键|外键/g, '<strong>$&</strong>').replace(/\b(SELECT|FROM|WHERE|ORDER BY|GROUP BY|DISTINCT|LEFT JOIN|COUNT|IFNULL|COALESCE|IS NULL|IS NOT NULL|NULL|AS)\b/g, '<strong>$1</strong>');
}
function renderTeachingBlocks(blocks = []) {
  const text = (value, emphasis = []) => {
    const escaped = e(value);
    const words = [...emphasis].sort((a, b) => b.length - a.length);
    if (!words.length) return escaped;
    const pattern = words.map(word => e(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    return escaped.replace(new RegExp(pattern, "g"), word => `<strong>${word}</strong>`);
  };
  return blocks.map(block => {
    switch (block.type) {
      case "heading": return `<h3>${text(block.text, block.emphasis)}</h3>`;
      case "paragraph": return `<p>${text(block.text, block.emphasis)}</p>`;
      case "list": return `<ul>${block.items.map(item => `<li>${typeof item === "string" ? e(item) : text(item.text, item.emphasis)}</li>`).join("")}</ul>`;
      case "table": {
        const cells = (row) => row.map((v, c) => `<td>${(block.codeColumns || []).includes(c) ? `<code>${e(v)}</code>` : e(v)}</td>`).join("");
        const grid = `<div class="fig-scroll"><table class="fig-table fig-concept"><thead><tr>${block.columns.map(c => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${block.rows.map(row => `<tr class="fig-row kept">${cells(row)}</tr>`).join("")}</tbody></table></div>`;
        return block.title ? `<figure class="figure figure-table"><figcaption>${e(block.title)}</figcaption>${grid}${block.caption ? `<p class="fig-conclusion"><b>结论</b>${e(block.caption)}</p>` : ""}</figure>` : `<div class="concept-comparison">${table(block.columns, block.rows)}</div>`;
      }
      case "code": return code(block.sql);
      default: return "";
    }
  }).join("");
}
function conceptContent(k) {
  // 核心概念：讲一个概念 → 紧跟对应的图示卡片 → 再讲下一个概念。课文数据里的 figure 块（ids）决定图示出现的位置，
  // 没有被任何块引用的概念图示才追加在末尾（兼容未重排的课文）。
  const figures = (k.figures || []).filter((figure) => figure.slot === "concept");
  const placed = new Set();
  const replacing = figures.find((figure) => figure.replacesTable);
  const blocks = (list) => {
    let replaced = false;
    const body = list.map((block) => {
      if (block.type === "figure") {
        const picked = figures.filter((figure) => block.ids.includes(figure.id));
        picked.forEach((figure) => placed.add(figure.id));
        return renderFigures({ ...k, figures: picked }, "concept");
      }
      if (block.type === "table" && replacing && !placed.has(replacing.id) && !replaced) { replaced = true; placed.add(replacing.id); return renderFigures({ ...k, figures: [replacing] }, "concept"); }
      return renderTeachingBlocks([block]);
    }).join("");
    const rest = renderFigures({ ...k, figures: figures.filter((figure) => !placed.has(figure.id)) }, "concept");
    return body + rest;
  };
  return `<div class="concept-group">${k.presentation ? blocks(k.presentation.conceptBlocks) : `<p>${e(k.concept)}</p>${(k.teaching?.mergedConcepts || []).map(item => `<p>${e(item.explanation)}</p>`).join("")}`}</div>`;
}
function lessonTeaching(k) {
  if (!k.teaching) return "";
  const presentation = k.presentation;
  const method = presentation ? renderTeachingBlocks(presentation.methodBlocks) : `<p>${e(k.teaching.codeExplanation || "")}</p>`;
  return `<div class="lesson-demand"><h3>实际业务需求</h3><p>${e(presentation?.problem || k.teaching.problem)}</p></div>${renderFigures(k, "problem")}<div class="lesson-method"><h3>查询思路讲解</h3>${method}</div>`;
}
function lessonBreakdown(k) {
  const steps = k.presentation?.breakdown || [];
  const row = (step, i) => `<div class="code-explanation-part step-item" data-step="${i}"><button class="step-row" data-action="lessonStep" data-arg="${i}" aria-expanded="false" aria-controls="step-body-${i}"><span class="step-no">${i + 1}</span><span class="step-main"><strong>${e(step.title)}</strong></span>${rowFlowStep(k, i) ? `<span class="fig-count">${rowFlowStep(k, i).badge}</span>` : ""}${icon("down", "step-chevron")}</button><div class="step-body" id="step-body-${i}" hidden>${step.kind === "fragment"
    ? `${newCode(step.sql, null)}<p><strong>作用：</strong>${e(step.purpose)}</p><p><strong>原因：</strong>${e(step.reason)}</p>${rowFlowStep(k, i) ? `<h3>数据变化</h3>${rowFlowStep(k, i).html}` : ""}`
    : `${stepTables(step.sourceTables)}${newCode(step.sql, i > 0 && k.presentation.breakdown[i - 1].kind !== "fragment" ? k.presentation.breakdown[i - 1].sql : null)}<p>${e(step.purpose)}</p><p>${e(step.reason)}</p><h3>中间结果</h3>${table(step.result.columns, step.result.rows, 10)}`}</div></div>`;
  const legacy = k.presentation ? "" : (k.teaching?.checkpoints || []).map(step =>
    `<details class="lesson-checkpoint"><summary>${e(step.label)} · <code>${e(step.name)}</code></summary>${lessonCode(step.sql)}${table(step.result.columns, step.result.rows)}</details>`
  ).join("");
  return `<div class="lesson-breakdown">${steps.length ? `<div class="lesson-code-explanation" data-steps="${steps.length}"><h3>分步执行</h3><div class="step-card">${steps.map(row).join("")}</div><div class="step-nav"><button class="outline" data-action="lessonStepMove" data-arg="-1" disabled>上一步</button><button class="outline" data-action="lessonStepMove" data-arg="1">下一步</button></div></div>` : ""}${legacy}</div>`;
}
function lessonCompleteCode(k) {
  return `<div class="lesson-complete-code"><h3>完整代码</h3>${codeBlock(code(k.presentation?.completeCode.mysqlSql || k.mysqlSql))}${k.sqliteSql ? button(actionIcon("play") + " 运行兼容示例", "lessonRun", k.id, "primary full") : ""}</div>`;
}
function lessonExtensions(k) {
  return (k.presentation?.extensions || k.teaching?.mergeExamples || []).map(example =>
    `<details class="lesson-checkpoint lesson-extension"><summary>${e(example.label)}</summary>${example.sourceTables ? renderTables(example.sourceTables) : ""}${lessonCode(example.sql)}<h3>示例执行结果</h3>${table(example.result.columns, example.result.rows)}${example.explanationBlocks ? renderTeachingBlocks(example.explanationBlocks) : `<p>${e(example.explanation)}</p>`}</details>`
  ).join("");
}
// 按用户要求（2026-11-20）：不展示“预期查询结果”表；结果解读与实际运行结果一起出现（点击运行后）。
function lessonExpected(k) {
  const explanation = k.presentation ? renderTeachingBlocks(k.presentation.resultBlocks) : (k.teaching?.resultExplanation ? `<p>${e(k.teaching.resultExplanation)}</p>` : "");
  if (!explanation) return "";
  return `<div class="lesson-expected"><div class="lesson-result-explanation"><h3>结果解读</h3>${explanation}</div></div>`;
}
function cautionText(text = "") {
  // Legacy courses remain verbatim until an external resource is converted.
  return e(text);
}
function lessonMistake(k, key) {
  const blocks = k.presentation?.cautions?.[key];
  return blocks ? renderTeachingBlocks(blocks) : cautionText(k.commonError[key]);
}
function lessonErrorReason(k) {
  return k.presentation?.cautions.reason ? renderTeachingBlocks(k.presentation.cautions.reason) : (k.commonError?.reason ? `<p>${e(k.commonError.reason)}</p>` : "");
}
function lessonResult(k, result) {
  const shown = result.rows.slice(0, 20);
  return `<span class="result-tag actual">实际运行</span> <small>本次 SQLite 兼容执行结果 · ${result.rowCount} 行${result.rowCount > shown.length ? ` · 展示前 ${shown.length} 行` : ""}</small>${table(result.columns, shown)}${lessonExpected(k)}`;
}
function lessonPage(id) {
  const k = getKP(id);
  if (!k) {
    const target = content.curriculumMigration.historyTargets[id] || content.curriculumMigration.targets[id]?.[0];
    if (target) return navigate("/lesson/" + target);
    return learning();
  }
  const chapter = getChapter(k.chapterId);
  const allPoints = content.chapters.flatMap((c) => c.knowledgePoints);
  const index = allPoints.findIndex((point) => point.id === id);
  const position = chapter.knowledgePoints.findIndex((point) => point.id === id) + 1;
  const related = (k.relatedQuestionIds || []).map(getQuestion).filter(Boolean);
  const sharedExample = formatSqlForDisplay(k.syntax) === formatSqlForDisplay(k.mysqlSql);
  const goal = (k.learningObjective || k.useCase || "").replace(/^(能够运用本节知识完成|在统一企业数据库中独立完成)[：:]\s*/, "").replace(/^能够/, "");

  const parameters = k.parameters ? `<ul class="parameter-list">${Object.entries(k.parameters).map(([name, description]) => `<li><strong>${e(name)}</strong><span>${e(description)}</span></li>`).join("")}</ul>` : "";
  state.lastLesson = id;
  if (!state.learningView.expanded.includes(k.chapterId)) state.learningView.expanded.push(k.chapterId);
  persist().catch((err) => toast(err.message));
  shell("知识点详情", `<div class="lesson-details">
    <header class="lesson-intro">${contourSvg("lesson-contour")}<div class="lesson-chapter"><span class="chapter-badge">${String(chapter.number).padStart(2, "0")}</span><span>第 ${chapter.number} 章 · ${e(chapter.title)}</span></div><h1 class="lesson-title">${e(k.title)}</h1>${goal ? `<section class="lesson-purpose" data-lesson-section="purpose"><p>能够运用本节知识完成：${e(goal)}</p></section>` : ""}<div class="question-meta">${tag(k.compatibility?.status || "MySQL 教学")}<small>${position} / ${chapter.knowledgePoints.length}</small></div></header>
    <div class="lesson-nav" role="navigation" aria-label="章节内导航">${[["concept", "概念"], ...(!sharedExample ? [["syntax", "语法"]] : []), ["example", "示例"], ["cautions", "易错"]].map(([key, label], i) => `<button data-action="lessonJump" data-arg="${key}" ${i === 0 ? 'aria-current="true"' : ""}>${label}</button>`).join("")}</div>
    <div class="lesson-foundation"><section class="lesson-section" data-lesson-section="concept"><h2>核心概念</h2><div class="lesson-concept">${conceptContent(k)}</div>${sharedExample ? parameters : ""}</section>
    ${!sharedExample ? `<section class="lesson-section" data-lesson-section="syntax"><h2>语法</h2>${k.presentation?.syntax.purpose ? `<p class="syntax-purpose">${teachingText(k.presentation.syntax.purpose)}</p>` : ""}${lessonCode(k.syntax)}${parameters}${renderFigures(k, "syntax")}</section>` : ""}</div>
    ${(k.executionSteps || []).length ? `<section class="lesson-section" data-lesson-section="steps"><h2>执行思路</h2><ol class="steps">${k.executionSteps.map((step, i) => `<li class="step"><b>${i + 1}</b><span>${e(step)}</span></li>`).join("")}</ol></section>` : ""}
    <section class="lesson-section" data-lesson-section="data"><h2>示例数据</h2>${renderTables(k.sourceTables, true, k.presentation?.dataDescriptions)}</section>
    <section class="lesson-section" data-lesson-section="example"><div class="section-heading example-heading"><h2>SQL 示例</h2>${button(icon("code") + " 去实验室", "lessonLab", id, "small-button")}</div>${lessonTeaching(k)}${lessonBreakdown(k)}${lessonCompleteCode(k)}<div id="lesson-result" aria-live="polite">${lessonExampleResult?.id === id ? lessonResult(k, lessonExampleResult.result) : ""}</div>${lessonExtensions(k)}</section>
    <section class="lesson-section lesson-cautions" data-lesson-section="cautions"><h2>辨析与易错点</h2><div class="caution-comparison"><h3>辨析</h3><div class="caution-copy">${k.presentation ? renderTeachingBlocks(k.presentation.cautions.comparison) : cautionText(k.comparison)}</div></div>${k.commonError ? `<dl class="mistake-comparison"><div><dt>易错</dt><dd>${lessonMistake(k, "example")}</dd></div>${lessonErrorReason(k) ? `<div class="mistake-reason"><dt>原因</dt><dd>${lessonErrorReason(k)}</dd></div>` : ""}<div><dt>修正</dt><dd>${lessonMistake(k, "correction")}</dd></div></dl>` : ""}<div class="caution-reason"><h3>注意事项</h3><div class="caution-copy">${k.presentation ? renderTeachingBlocks(k.presentation.cautions.notes) : cautionText(k.notes)}</div></div></section>
    ${related.length ? `<section class="lesson-section related-questions"><div class="section-heading"><h2>关联练习</h2>${goButton("全部 " + related.length + " 题", "/practice/kp/" + id, "small-button")}</div>${questionList(related, true)}</section>` : ""}
    <section class="lesson-section"><label class="form-field">我的笔记<textarea id="note" data-id="${id}" aria-label="我的笔记">${e(lessonNote(state, content.curriculumMigration, id))}</textarea></label><div class="note-controls"><small id="note-status" role="status"></small>${button(actionIcon("save") + " 保存笔记", "saveLessonNote", id, "primary")}</div></section>
    <div class="lesson-completion">${button(completedLesson(id) ? actionIcon("check") + " 已完成学习" : actionIcon("check") + " 完成学习", "completeLesson", id, "primary full")}</div>
    ${sequenceButtons(allPoints[index - 1], allPoints[index + 1], "lesson")}
  </div>`, "learn", true, favButton(id));
}
function filterQuestions(list = content.questions) {
  return list.filter(
    (q) =>
      (!search ||
        q.title.toLowerCase().includes(search.toLowerCase()) ||
        q.requirements.toLowerCase().includes(search.toLowerCase()) ||
        q.id.toLowerCase().includes(search.toLowerCase())) &&
      (!questionFilters.chapter || q.chapterId === questionFilters.chapter) &&
      (!questionFilters.type || q.type === questionFilters.type) &&
      (!questionFilters.difficulty ||
        q.difficulty === questionFilters.difficulty) &&
      (!questionFilters.status ||
        (questionFilters.status === "未作答"
          ? !attempted(q.id).length
          : questionFilters.status === "已独立完成"
            ? independentDone(q.id)
            : questionFilters.status === "待巩固"
              ? attempted(q.id).some((a) => !a.pass && !a.ungraded) && !masteredWrong(q.id)
              : attempted(q.id).length > 0)),
  );
}
function questionList(list, chapterRows = false) {
  return list.map((q) => {
    const history = attempted(q.id);
    const done = independentDone(q.id);
    const needsReview = history.some((a) => !a.pass && !a.ungraded) && !masteredWrong(q.id);
    const status = done ? "已独立完成" : needsReview ? "待巩固" : history.length ? "已作答" : "未作答";
    let statusIcon = '<span class="point-dot"></span>';
    if (history.length) statusIcon = icon("edit");
    if (needsReview) statusIcon = icon("wrong");
    if (done) statusIcon = icon("check");
    const statusTag = done ? tag(status, "green") : needsReview ? tag(status, "warn") : "";
    return goButton(
      `<span class="question-status ${done ? "done" : needsReview ? "needs-review" : ""}" role="img" aria-label="${status}" title="${status}">${statusIcon}</span>
      <div class="grow">${chapterRows
        ? `<div class="question-row-meta"><small class="question-id">${e(q.id.toUpperCase())}</small>${tag(q.type)}${tag(q.difficulty)}</div><h3>${e(q.title.split(" · ")[0])}</h3>`
        : `<small class="question-id">${e(q.id.toUpperCase())}</small><h3>${e(q.title.split(" · ")[0])}</h3><div class="question-tags">${tag(q.type)}${tag(q.difficulty)}${statusTag}</div>`}</div>${icon("right", "chevron")}`,
      "/question/" + q.id,
      "link-row" + (chapterRows ? " chapter-question-row" : ""),
    );
  }).join("");
}
function practiceChapters(list, filtered) {
  const filtering = search || Object.values(questionFilters).some(Boolean);
  const filterKey = JSON.stringify([route(), search, questionFilters]);
  const scoped = filtering || route().startsWith("/practice/kp/");
  if (scoped && practiceFilterView?.key !== filterKey) {
    practiceFilterView = { key: filterKey, expanded: [...new Set(filtered.map((q) => q.chapterId))] };
  }
  const expansion = scoped ? practiceFilterView : state.practiceView;
  return '<div class="chapter-list practice-chapters">' + content.chapters.map((chapter) => {
    const questions = filtered.filter((q) => q.chapterId === chapter.id);
    if (!questions.length) return "";
    const chapterQuestions = list.filter((q) => q.chapterId === chapter.id);
    const done = chapterQuestions.filter((q) => independentDone(q.id)).length;
    const expanded = expansion.expanded.includes(chapter.id);
    return `<section class="chapter-card">
      <button class="chapter-toggle" data-action="togglePracticeChapter" data-arg="${chapter.id}" aria-expanded="${!!expanded}" aria-controls="practice-questions-${chapter.id}">
        <span class="chapter-number">${String(chapter.number).padStart(2, "0")}</span>
        <strong class="grow">${e(chapter.title)}</strong>
        <small class="chapter-count" aria-label="已独立完成 ${done} 道，共 ${chapterQuestions.length} 道题">${done} / ${chapterQuestions.length}</small>
        ${icon("right", expanded ? "chevron expanded" : "chevron")}
      </button>
      <div class="progress chapter-progress" role="progressbar" aria-label="${e(chapter.title)}练习进度" aria-valuemin="0" aria-valuemax="${chapterQuestions.length}" aria-valuenow="${done}"><span style="width:${done / chapterQuestions.length * 100}%"></span></div>
      <div id="practice-questions-${chapter.id}" ${expanded ? '' : 'hidden'}>${expanded ? '<div class="chapter-questions">' + questionList(questions, true) + '</div>' : ''}</div>
    </section>`;
  }).join("") + '</div>';
}
function practice(path) {
  let list = content.questions;
  let title = "练习";
  if (path.startsWith("/practice/kp/")) {
    const id = path.split("/").pop();
    list = list.filter((q) => q.knowledgePointIds.includes(id));
    title = "关联练习";
  }
  const filtered = filterQuestions(list);
  const opts = (values, current, label) =>
    `<option value="">${label}</option>${values.map((v) => `<option value="${e(typeof v === "object" ? v.id : v)}" ${current === (v.id || v) ? "selected" : ""}>${e(v.title || v)}</option>`).join("")}`;
  shell(
    title,
    `<div class="row between route-summary"><small>已独立完成 ${summaryStats().done} / ${content.questions.length} 题</small>${goButton("业务实战", "/projects", "small-button")}</div><div class="actions">${button(icon("play") + " 随机练习", "randomQuestion", "", "primary")}${goButton(icon("wrong") + " 错题重练", "/wrong", "outline")}</div><div class="search">${icon("search")}<input id="search" value="${e(search)}" placeholder="搜索题号或题目" aria-label="搜索题目"></div>
    <div class="chips question-difficulties" aria-label="难度筛选">${["", "入门", "简单", "中等", "困难", "挑战"].map((difficulty) => button(difficulty || "全部难度", "questionDifficulty", difficulty, "chip " + (questionFilters.difficulty === difficulty ? "selected" : ""))).join("")}</div>
    <div class="practice-selectors"><select data-filter="chapter" aria-label="章节筛选">${opts(content.chapters, questionFilters.chapter, "全部章节")}</select><select data-filter="type" aria-label="题型筛选">${opts([...new Set(content.questions.map((q) => q.type))], questionFilters.type, "全部题型")}</select><select data-filter="status" aria-label="状态筛选">${opts(["未作答", "已作答", "待巩固", "已独立完成"], questionFilters.status, "全部状态")}</select><button class="icon-button" data-action="resetQuestions" aria-label="重置筛选" title="重置筛选">${icon("reset")}</button></div>
    <small class="practice-match-count">${filtered.length} 道题</small>
    ${practiceChapters(list, filtered)}${filtered.length ? "" : empty("暂无匹配题目", "", button("重置筛选", "resetQuestions", "", "outline"), "09_empty_magnifier")}`,
    "practice",
    title !== "练习",
  );
}
async function publicFixture(q) {
  const f = q.testFixtures.find((f) => f.visibility === "public");
  return f ? fetch(f.path).then((r) => r.json()) : null;
}
function editor(id, value, keyboardVisible = state.settings.customKeyboard) {
  const control = (name, action, label) =>
    button(
      icon(name) + '<span class="sr-only">' + label + "</span>",
      action,
      "",
      "editor-icon",
    );
  const toolbar =
    control("undo", "editorUndo", "撤销") +
    control("redo", "editorRedo", "重做") +
    button("格式化", "formatEditor", "", "small-button") +
    control("keyboard", "editorKeyboard", "切换系统与SQL键盘") +
    control("expand", "editorFullscreen", "全屏编辑");
  return (
    '<div class="editor-workspace">' +
    editorBody(id, value, state.settings, toolbar) +
    '<div class="keyboard-wrap ' +
    (keyboardVisible ? "" : "hidden") +
    '"><div class="keyboard-resize" role="separator" tabindex="0" aria-label="调整SQL键盘高度" aria-orientation="horizontal" aria-valuemin="150" aria-valuemax="520"></div><div class="keyboard-modes">' +
    ["语法", "字段", "符号", "字母"]
      .map((mode, i) =>
        button(
          mode,
          "keyboard",
          mode,
          "keyboard-mode " + (i === 0 ? "selected" : ""),
        ),
      )
      .join("") +
    button(
      state.settings.editorDark ? "浅色" : "深色",
      "editorTheme",
      "",
      "keyboard-theme",
    ) +
    '</div><div id="keypad" class="keypad">' +
    keys("语法") +
    "</div></div></div>"
  );
}
function keys(mode) {
  if (mode === "字段") {
    const groups = editorFields.length ? editorFields : labInfo?.fields || [];
    return (
      groups
        .map(
          (group, index) =>
            `<details class="field-group" ${index === 0 ? "open" : ""}><summary>${e(group.name)}</summary><div class="field-keys">${group.columns.map((column) => button(e(column.name), "insert", column.name)).join("")}</div></details>`,
        )
        .join("") || "<small>先选择数据表。</small>"
    );
  }
  const list =
    mode === "符号"
      ? [
          "(",
          ")",
          ",",
          ";",
          "=",
          "<>",
          ">=",
          "<=",
          "'",
          "*",
          "+",
          "-",
          "/",
          "%",
        ]
      : mode === "字母"
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
        : [
            "SELECT ",
            "FROM ",
            "WHERE ",
            "GROUP BY ",
            "ORDER BY ",
            "JOIN ",
            "ON ",
            "AS ",
            "COUNT(",
            "SUM(",
            "LIMIT ",
            "NULL",
            "\n",
            "  ",
          ];
  return list
    .map((k) =>
      button(e(k === "\n" ? "换行" : k === "  " ? "缩进" : k), "insert", k),
    )
    .join("");
}
function choiceExplanation(q) {
  const inline = new Set((q.options || []).map((option) => `${option.id}. ${option.explanation}`));
  return q.explanation.split("\n").filter((line) => !inline.has(line.trim())).join("\n");
}
// ===== B5：答题差异（仅前端按“公开结果表”逐行对照，不改判题逻辑）=====
function diffTable(diff) {
  const cell = (v) => (v === null || v === undefined ? '<span class="null-cell">NULL</span>' : e(v));
  return `<div class="table-wrap"><table><thead><tr><th>标记</th>${diff.columns.map((c) => `<th>${e(c)}</th>`).join("")}</tr></thead><tbody>${diff.rows.map((r) => `<tr class="${r.mark === "缺" ? "row-miss" : r.mark === "多" ? "row-extra" : r.mark === "序" ? "row-order" : ""}"><td>${r.mark ? `<span class="diff-mark ${r.mark === "多" ? "extra" : r.mark === "序" ? "order" : ""}">${r.mark}</span>${r.posNote ? `<small class="cell-actual">${e(r.posNote)}</small>` : ""}` : ""}</td>${r.cells.map((v, c) => `<td class="${typeof v === "number" ? "num" : ""} ${r.bad.includes(c) ? "cell-bad" : ""}">${cell(v)}${r.actualCells && r.bad.includes(c) ? `<small class="cell-actual">你的：${cell(r.actualCells[c])}</small>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function statusBar(feedback, q, diff) {
  const kind = feedback.unsupported || feedback.error ? "warn" : feedback.pass ? "ok" : feedback.submitted === false ? "warn" : "bad";
  const icons = {
    ok: '<svg class="status-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    bad: '<svg class="status-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    warn: '<svg class="status-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 17v.5"/><circle cx="12" cy="12" r="9"/></svg>',
  };
  const title = feedback.unsupported ? "未评定" : feedback.error ? "执行失败" : feedback.submitted === false ? (feedback.pass ? "运行完成" : "执行失败") : feedback.pass ? "回答正确" : (diff ? "结果与预期不一致" : "答案不符");
  const showMessage = feedback.message && !(q.type === "选择" && q.options.some((option) => option.explanation === feedback.message));
  const detail = diff?.summary ? `<small>${e(diff.summary)}</small>` : "";
  const message = showMessage ? ((kind === "warn" && (feedback.submitted === false || feedback.error)) ? `<small class="status-error"><code>${e(feedback.message)}</code></small>` : `<small>${e(feedback.message)}</small>`) : "";
  return `<div class="status ${kind}" role="status">${icons[kind]}<div class="status-text"><strong>${title}</strong>${detail}${message}${feedback.fixtures ? `<small>已检查 ${feedback.fixtures} 组独立夹具</small>` : ""}</div>${kind === "ok" && feedback.submitted !== false ? '<span class="status-dot" aria-hidden="true"></span>' : ""}</div>`;
}
function compareTabs(cmp, q, diff) {
  const rc = (r) => (r.rowCount != null ? " · " + r.rowCount + " 行" : "");
  const more = Math.max(cmp.actual.rowCount || 0, cmp.expected.rowCount || 0) > 40 ? '<small class="compare-note">各展示前 40 行</small>' : "";
  return `<div class="result-compare"><div class="seg" role="tablist" aria-label="结果对照">${[["exp", "预期"], ["act", "实际"], ["diff", "差异"]].map(([k, label]) => `<button role="tab" data-action="cmpTab" data-arg="${k}" aria-selected="${k === "diff"}">${label}</button>`).join("")}</div>
    <div class="cmp-pane" data-pane="exp" hidden><p class="compare-count">预期结果${rc(cmp.expected)}</p><div class="expected-table">${table(cmp.expected.columns, cmp.expected.rows)}</div></div>
    <div class="cmp-pane" data-pane="act" hidden><p class="compare-count">你的结果${rc(cmp.actual)}</p>${table(cmp.actual.columns, cmp.actual.rows)}</div>
    <div class="cmp-pane" data-pane="diff"><p class="compare-count">差异${diff.summary ? " · " + e(diff.summary) : ""}（按公开数据逐行对照）</p>${diff.columnsSame ? diffTable(diff) : `<p class="compare-note">列不一致：预期 ${e(cmp.expected.columns.join(", "))}；你的结果 ${e(cmp.actual.columns.join(", "))}。</p>`}<p class="compare-note">“缺”= 预期有而你的结果没有；“多”= 你的结果多出；“序”= 行内容相同但位置不同；单元格不同会标红加粗。仅按公开数据对照，不代表隐藏夹具的全部判定。</p></div>${more}</div>`;
}
function questionRequirements(q) {
  return `<div class="stem"><div class="stem-text"><div class="requirement-sections">${requirementSections(q.requirements).map((section) => `<section><h2>${e(section.label)}</h2><div class="requirement-text">${readingChunks(section.text, true).map((chunk) => `<p>${e(chunk)}</p>`).join("")}</div></section>`).join("")}</div></div><button class="stem-toggle" data-action="stemToggle" hidden>展开全文</button></div>`;
}
async function questionFields(q) {
  if (questionFieldCache.has(q.id)) return questionFieldCache.get(q.id);
  const dataset = dbManifest.datasets.find((item) => item.id === q.datasetId);
  let fields = [];
  if (dataset) {
    if (!projectSchemas.has(dataset.id)) {
      const response = await fetch(dataset.schemaPath);
      if (!response.ok) throw new Error("无法读取本题数据字典");
      projectSchemas.set(dataset.id, businessErdDictionary(await response.json()));
    }
    const dictionary = projectSchemas.get(dataset.id);
    const names = q.sourceTables?.length ? q.sourceTables : Object.keys(dictionary.tables || {});
    fields = names.map((name) => ({ name, columns: dictionary.tables?.[name]?.columns || [] }));
  } else {
    const fixture = await publicFixture(q);
    fields = (fixture?.tables || []).map((t) => ({ name: t.name, columns: t.columns.map((c) => typeof c === "string" ? { name: c } : c) }));
  }
  questionFieldCache.set(q.id, fields);
  return fields;
}
async function questionTables(q) {
  if (questionTableCache.has(q.id)) return questionTableCache.get(q.id);
  const fixture = q.testFixtures.find((f) => f.visibility === "public");
  if (!fixture) return [];
  const result = await rpc("questionTables", { path: fixture.path, names: q.sourceTables || [] }, 60000);
  questionTableCache.set(q.id, result.tables);
  questionFieldCache.set(q.id, result.fields);
  return result.tables;
}
async function questionPage(id, renderVersion = revision) {
  const q = getQuestion(id);
  if (!q) return practice("/practice");
  if (loadedQuestionId !== id) {
    loadedQuestionId = id;
    openFolds.clear();
    quizScroll = {};
    quizExpanded = false;
    quizTab = "题目";
    questionKeyboard = false;
    feedback = null;
    lastResult = null;
    selectedOption = state.drafts[id]?.option || "";
    hints = draftForQuestion(id).hints || 0;
    answerShown = draftForQuestion(id).answerShown || false;
  }
  const chapter = getChapter(q.chapterId);
  const chapterQuestions = content.questions.filter((item) => item.chapterId === q.chapterId);
  const sequence = questionSequence?.includes(id) ? questionSequence.map(getQuestion).filter(Boolean) : chapterQuestions;
  const position = sequence.findIndex((item) => item.id === id);
  const submitted = attempted(id).length > 0;
  if (q.type !== "选择") editorFields = await questionFields(q);
  const head = `<div class="question-meta">${tag(q.type)}${tag(q.difficulty)}<small>${q.id.toUpperCase()}</small></div><h1 class="quiz-title">${e(q.title.split(" · ")[0])}</h1><p class="question-location">第 ${chapter.number} 章 · ${e(chapter.title)}<span>${chapterQuestions.findIndex((item) => item.id === id) + 1} / ${chapterQuestions.length}</span></p>`;
  const split = q.type !== "选择";
  let body = split ? `<div class="quiz-details quiz-split">` : `<div class="quiz-details">${head}`;
  if (q.type === "选择") {
    body += `<p class="choice-requirements">${e(q.requirements)}</p><div class="choice-options" role="radiogroup" aria-label="答案选项">${q.options.map((o) => `<div class="choice-item">${`<button class="option ${selectedOption === o.id ? "selected" : ""}" data-action="option" data-arg="${e(o.id)}" role="radio" aria-checked="${selectedOption === o.id}"><b>${e(o.id)}</b><span>${e(o.text)}</span>${selectedOption === o.id ? icon("check") : ""}</button>`}${submitted && o.explanation ? `<p class="option-explanation ${o.id === q.correctOptionId ? "correct" : ""}">${o.id === q.correctOptionId ? icon("check") : ""}${e(o.explanation)}</p>` : ""}</div>`).join("")}</div>`;
  } else {
    const cachedTables = questionTableCache.get(q.id);
    const tablesInner = cachedTables ? (cachedTables.length ? renderTables(cachedTables, false) : empty("暂无公开数据表")) : `<p class="muted quiz-tables-pending" data-qid="${e(q.id)}">正在加载本题的数据表…</p>`;
    body += `<div class="quiz-top"><div class="tabs">${["题目", "数据表"].map((t) => button(t, "quizTab", t, quizTab === t ? "selected" : "")).join("")}</div><div class="quiz-pane" data-pane="题目" ${quizTab === "题目" ? "" : "hidden"}>${head}${q.context ? `<p class="question-context">${e(q.context)}</p>` : ""}${questionRequirements(q)}</div><div class="quiz-pane" data-pane="数据表" ${quizTab === "数据表" ? "" : "hidden"}>${tablesInner}</div></div><div class="quiz-splitter" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="调整题目区与代码区高度"></div><div class="quiz-bottom">`;
    body += `<section class="question-code"><h2>${q.type === "代码纠错" ? "修正代码" : q.type === "代码填空" ? "补全代码" : "编写 SQL"}</h2>${q.type === "代码填空" ? `<p class="input-guidance">补全 ${e([...new Set((q.initialCode || "").match(/\{\{[^}]+\}\}/g) || [])].join("、") || "代码中的空位")}，可编辑完整 SQL。</p>` : ""}${editor(q.id, draftForQuestion(id).code ?? formatSqlForDisplay(q.initialCode ?? ""), questionKeyboard && state.settings.customKeyboard)}</section>`;
  }
  body += `<section class="question-execution"><div class="actions">${q.type !== "选择" ? button(actionIcon(busy ? "stop" : "play") + (busy ? " 停止" : " 运行"), busy ? "stop" : "runQuestion", q.id, "outline") : ""}<button class="primary" data-action="submitQuestion" data-arg="${id}" ${busy ? "disabled" : ""}>${actionIcon("send")}${busy ? "执行中…" : "提交答案"}</button></div></section>`;
  if (lastResult) body += `<section class="query-output"><div class="row between table-heading"><h2>运行结果</h2><small>${lastResult.rowCount} 行${lastResult.elapsedMs ? " · " + lastResult.elapsedMs + " ms" : ""}</small></div>${table(lastResult.columns, lastResult.rows)}</section>`;
  if (feedback) {
    const diff = feedback.publicComparison ? diffComparison(feedback.publicComparison, q) : null;
    body += `<section class="judge-feedback" aria-live="polite">${statusBar(feedback, q, diff)}${diff ? compareTabs(feedback.publicComparison, q, diff) : ""}${!answerShown && (feedback.submitted || q.type === "选择") ? `<details data-fold="explain" ${openFolds.has(id + ":explain") ? "open" : ""}><summary>答案解析</summary><p>${e(q.type === "选择" ? choiceExplanation(q) : q.explanation)}</p></details>` : ""}</section>`;
  }
  const hintMax = Math.min(q.hints.length, 3), hintOpen = openFolds.has(id + ":hints"), refOpen = openFolds.has(id + ":ref");
  const hintLabel = hints === 0 ? "提示 0/" + hintMax : !hintOpen ? "展开提示 " + Math.min(hints, 3) + "/" + hintMax : hints >= hintMax ? "收起提示 " + hintMax + "/" + hintMax : "提示 " + hints + "/" + hintMax;
  const refLabel = !answerShown ? "查看参考答案" : refOpen ? "收起参考答案" : "展开参考答案";
  body += `<section class="answer-support"><div class="actions"><button class="outline" data-action="hint" data-arg="${id}" aria-expanded="${hintOpen}">${actionIcon("hint")}${hintLabel}</button><button class="outline" data-action="showAnswer" data-arg="${id}" aria-expanded="${refOpen}">${actionIcon("answer")}${refLabel}</button></div>${hints && hintOpen ? `<ol class="hint-list">${q.hints.slice(0, hints).map((hint, index) => `<li><small>提示 ${index + 1}</small><p>${e(hint)}</p></li>`).join("")}</ol>` : ""}${answerShown && refOpen ? `<div class="reference-answer"><h3>参考答案</h3>${q.type === "选择" ? `<p>正确选项 ${e(q.correctOptionId)}</p>` : code(q.referenceSolutions[0]?.mysqlSql || q.initialCode)}<p>${e(q.type === "选择" ? choiceExplanation(q) : q.explanation)}</p></div>` : ""}</section>`;
  body += `${sequenceButtons(sequence[position - 1], sequence[position + 1], "question")}${split ? "</div></div>" : "</div>"}`;
  if (route() !== "/question/" + id || renderVersion !== revision) return;
  captureQuizScroll();
  shell(q.type === "选择" ? "选择练习" : "SQL 练习", body, "practice", true, favButton(id));
  requestAnimationFrame(syncStems);
}
function hydrate(card) {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}
function interval(date) {
  const minutes = Math.max(1, Math.round((new Date(date) - now()) / 60000));
  return minutes < 60
    ? minutes + " 分钟"
    : minutes < 1440
      ? Math.round(minutes / 60) + " 小时"
      : Math.round(minutes / 1440) + " 天";
}
function cardStatus(c) {
  const r = state.reviews[c.id];
  return r ? `<span class="st o">已复习 ${r.reps || 0} 次 · S=${(r.stability || 0).toFixed(1)}</span>` : `<span class="st">新卡 · 待初学</span>`;
}
function cardsPage() {
  const fresh = allCards().filter((c) => !state.reviews[c.id]);
  const query = cardSearch.trim().toLowerCase();
  const matching = [...content.cards, ...state.userCards].filter((c) => (!cardBrowseChapter || (c.chapterIds || []).includes(cardBrowseChapter)) && (!cardTypeFilter || c.type === cardTypeFilter) && (!cardTierFilter || c.interviewTier === cardTierFilter) && (!query ||
    [c.id, c.front.question, c.front.prompt, c.title, c.back.answer, c.back.explanation, ...(c.tags || [])]
      .some((value) => String(value || "").toLowerCase().includes(query))));
  const all = allCards();
  if (!spotId || !all.some((c) => c.id === spotId)) spotId = all[Math.floor(Math.random() * all.length)]?.id;
  const spot = all.find((c) => c.id === spotId);
  const chapterChips = (current, action) => content.chapters.map((c) => button("Ch" + c.number, action, c.id, "chip " + (current === c.id ? "selected" : ""))).join("");
  const modeText = modeLabels[newMode];
  shell(
    "闪卡",
    `<div class="row route-summary card-head">${goButton(icon("plus") + " 自定义 (" + state.userCards.length + ")", "/my-cards", "small-button")}</div>
    <section class="panel continue card-center"><div class="hub-row"><div class="grow"><h2>今日记忆调度台</h2><div class="card-counts"><span><strong class="c-due">${dueCards().length}</strong><small>待复习</small></span><span><strong class="c-new">${fresh.length}</strong><small>未学新卡</small></span><span><strong class="c-done">${studiedCards()}</strong><small>已掌握</small></span></div></div>${image("illustrations/states/state_flashcard_review", "card-center-art")}</div>
    <div class="hub-prog"><div class="between-text"><span>累计涉猎 ${studiedCards()}/${content.cards.length} 张</span><b>目标保持率 90%</b></div><div class="hub-track"><i style="width:${Math.round((studiedCards() / Math.max(1, content.cards.length)) * 100)}%"></i></div></div>
    <div class="chips review-modes mode-scroll">${Object.keys(modeLabels).map((mode) => button(modeLabels[mode], "cardMode", mode, "chip " + (newMode === mode ? "selected" : ""))).join("")}</div>
    ${newMode === "章节" ? `<div class="chips review-modes chapter-chips">${chapterChips(cardChapter, "cardChapter")}</div>` : ""}
    <div class="sched"><span>${cardScheduled ? "正式调度（自动计算下次复习时间）" : "自由浏览（不改变复习计划）"}</span><button class="switch" role="switch" aria-checked="${cardScheduled}" aria-label="正式调度" data-action="toggleSched"></button></div>
    ${button(icon("flip") + `<span>进入「${modeText}」3D 翻卡学习</span>`, "startCards", newMode, "primary full start-flip")}${state.flashSession ? button("继续上次复习", "resumeCards", "", "tonal full") : ""}</section>
    ${spot ? `<div class="section-heading"><h2>随手翻一张</h2><span class="row">${spotHistory.length ? button("上一张", "spotPrev", "", "text-button") : ""}${button(icon("skip") + " 换一张", "spotNext", "", "text-button")}</span></div>
    ${spotBack
      ? `<div class="fc-open"><div class="fc-tap" role="button" tabindex="0" data-action="spotFlip" aria-label="点击卡片翻回正面">${cardView.back(asRichCard(spot), cardRunBlock(spot))}</div><div class="actions">${button("复制为个人卡片", "copyCard", spot.id, "outline")}</div></div>`
      : `<div class="fc-tap" role="button" tabindex="0" data-action="spotFlip" aria-label="点击翻面">${cardView.front(asRichCard(spot))}</div><p class="fc-hint center">先默想答案，再点击卡片翻面核对</p>`}` : ""}
    <div class="section-heading"><small class="card-match-count">匹配到 ${matching.length} 张 · 点击卡片直接翻面</small>${cardFlipped.size ? button(icon("reset") + " 全部正面", "allFront", "", "text-button") : ""}</div>
    <div class="search">${icon("search")}<input id="card-search" value="${e(cardSearch)}" placeholder="搜索闪卡问题、答案、卡号或标签…" aria-label="搜索闪卡"></div>
    <div class="chips mode-scroll">${button("全部类别", "cardType", "", "chip " + (!cardTypeFilter ? "selected" : ""))}${TYPE_ORDER.map((t) => button(TYPE_LABELS[t], "cardType", t, "chip " + (cardTypeFilter === t ? "selected" : ""))).join("")}</div>
    <div class="chips mode-scroll">${button("全部级别", "cardTier", "", "chip " + (!cardTierFilter ? "selected" : ""))}${TIER_ORDER.map((t) => button(t, "cardTier", t, "chip " + (cardTierFilter === t ? "selected" : ""))).join("")}</div>
    <div class="chips mode-scroll">${button("全部章", "browseChapter", "", "chip " + (!cardBrowseChapter ? "selected" : ""))}${chapterChips(cardBrowseChapter, "browseChapter")}</div>
    ${matching.slice(0, cardBrowseLimit).map((c) => {
      const rich = asRichCard(c);
      return cardFlipped.has(c.id)
        ? `<div class="fc-open"><div class="fc-tap" role="button" tabindex="0" data-action="miniFlip" data-arg="${e(c.id)}" aria-label="点击卡片翻回正面">${cardView.back(rich, cardRunBlock(c))}</div><div class="actions">${button("复制为个人卡片", "copyCard", c.id, "outline")}</div></div>`
        : `<button class="fc-mini" data-action="miniFlip" data-arg="${e(c.id)}"><span class="fc-mini-tags">${e(rich.typeLabel)}${c.interviewTier ? " · " + e(c.interviewTier) : ""}</span><span class="fc-mini-q">${e(rich.front.prompt)}</span><span class="row between">${cardStatus(c)}<span class="tap">${icon("reset")}轻触翻面看答案</span></span></button>`;
    }).join("")}
    ${matching.length > cardBrowseLimit ? button("加载更多闪卡", "moreCards", "", "outline full") : ""}${matching.length ? "" : empty("暂无匹配闪卡", "", button("清除搜索", "resetCardSearch", "", "outline"), "09_empty_magnifier")}`,
    "flashcards",
  );
}
function cardPreviewPage() {
  const list = content.cards.filter((c) => c.type === cardPreview.type);
  cardPreview.index = Math.min(Math.max(0, cardPreview.index), Math.max(0, list.length - 1));
  const card = list[cardPreview.index];
  shell(
    "闪卡样式预览",
    `<div class="chips mode-scroll">${TYPE_ORDER.map((t) => button(TYPE_LABELS[t], "cpType", t, "chip " + (cardPreview.type === t ? "selected" : ""))).join("")}</div>
    <div class="row between fc-pager"><small>${e(card.id)} · ${cardPreview.index + 1} / ${list.length}</small><div class="row">${button("上一张", "cpStep", "-1", "small-button")}${button("下一张", "cpStep", "1", "small-button")}</div></div>
    <div class="chips"><span class="chip ${cardPreview.face === "front" ? "selected" : ""}" data-action="cpFace" data-arg="front" role="button" tabindex="0">正面</span><span class="chip ${cardPreview.face === "back" ? "selected" : ""}" data-action="cpFace" data-arg="back" role="button" tabindex="0">背面</span><span class="chip ${cardPreview.face === "both" ? "selected" : ""}" data-action="cpFace" data-arg="both" role="button" tabindex="0">双面</span></div>
    ${cardPreview.face !== "back" ? cardView.front(card) : ""}${cardPreview.face !== "front" ? cardView.back(card) : ""}`,
    "flashcards",
    true,
  );
}
async function startCards(mode, relatedIds) {
  let list = [];
  const all = allCards();
  const scheduled = mode === "关联" ? false : cardScheduled;
  if (mode === "每日到期") {
    const reviewedToday = state.reviewEvents.filter(
      (r) => localDay(new Date(r.time)) === today(),
    );
    const newToday = new Set(
      reviewedToday.filter((r) => r.wasNew).map((r) => r.cardId),
    ).size;
    list = [
      ...dueCards().slice(0, state.settings.reviewLimit),
      ...content.cards
        .filter((c) => !state.reviews[c.id])
        .slice(0, Math.max(0, state.settings.newCards - newToday)),
    ];
  }
  if (mode === "新卡")
    list = all
      .filter((c) => !state.reviews[c.id])
      .slice(0, state.settings.newCards);
  if (mode === "随机") list = shuffle(all).slice(0, 20);
  if (mode === "薄弱")
    list = all
      .filter((c) =>
        state.reviewEvents
          .filter((ev) => ev.cardId === c.id)
          .slice(-1)
          .some((ev) => ev.rating <= 2),
      )
      .slice(0, 30);
  if (mode === "收藏") list = all.filter((c) => favorite(c.id));
  if (mode === "自定义") list = state.userCards;
  if (mode === "关联") list = all.filter((c) => relatedIds.includes(c.id));
  if (mode === "章节") {
    list = content.cards.filter((c) => (c.chapterIds || []).includes(cardChapter));
  }
  state.flashSession = {
    ids: list.map((c) => c.id),
    index: 0,
    mode,
    scheduled,
    ratings: [],
    startedAt: new Date().toISOString(),
  };
  flashBack = false;
  flashGraded = false;
  await persist();
  navigate("/review");
}
function shuffle(list) {
  return list
    .map((v) => ({ v, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ v }) => v);
}
const milestonePlayed = new WeakSet();
// 里程碑：默认输出最终态（12 块全亮 + 旗子），脚本失败也是完整画面；系统允许动画时重置后播放一次（约 600ms）。
const milestoneArt = () => `<div class="milestone-art" aria-hidden="true">${islandSvg(12, islandSource, "milestone-svg")}</div>`;
function playMilestone(session) {
  const svg = document.querySelector(".milestone-art svg");
  if (!svg || milestonePlayed.has(session)) return;
  milestonePlayed.add(session);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const tiles = [...svg.querySelectorAll(".tile")];
  const flag = svg.querySelector("#flag");
  if (!tiles.length || !flag) return;
  const paint = (tile, on) => { tile.classList.toggle("on", on); tile.setAttribute("fill", on ? "#38607F" : "#F3F8FA"); tile.setAttribute("stroke", on ? "#38607F" : "#A9C2D2"); };
  tiles.forEach((tile) => paint(tile, false));
  flag.style.transition = "none"; flag.style.opacity = "0"; flag.style.transform = "translateY(34px)";
  tiles.forEach((tile, i) => setTimeout(() => paint(tile, true), i * 28));
  setTimeout(() => { flag.style.transition = "transform 260ms ease-out, opacity 260ms ease-out"; flag.style.opacity = "1"; flag.style.transform = "translateY(0)"; }, tiles.length * 28);
}
function reviewPage() {
  const session = state.flashSession;
  if (!session) return cardsPage();
  const card = allCards().find((c) => c.id === session.ids[session.index]);
  if (!card) {
    const count = session.ratings.length;
    shell(
      count ? "本次复习完成" : "暂无待复习卡片",
      `${count ? milestoneArt() : finalArt("08_empty_question", "summary-illustration")}<p class="review-summary">${count ? "已复习 " + count + " 张卡片" : "当前模式没有待复习卡片"}</p><div class="actions">${goButton("返回闪卡", "/cards", "primary")}${button("浏览新卡", "startCards", "新卡", "outline")}${session.lastRating ? button("撤回上次评分", "undoRating", "", "outline") : ""}</div>`,
      "flashcards",
      true,
    );
    if (count) requestAnimationFrame(() => playMilestone(session));
    return;
  }
  const schedule = scheduler.repeat(
    state.reviews[card.id]
      ? hydrate(state.reviews[card.id])
      : createEmptyCard(),
    now(),
  );
  const rich = asRichCard(card);
  shell(
    session.mode + "复习",
    `<div class="row between"><small>${session.index + 1} / ${session.ids.length}</small><div class="row">${tag(session.scheduled ? "计入复习计划" : "自由浏览")}${session.lastRating ? button(icon("undo") + '<span class="sr-only">撤回上次评分</span>', "undoRating", "", "icon-button") : ""}</div></div><div class="progress"><span style="width:${(session.index / session.ids.length) * 100}%"></span></div><div class="row between flash-meta"><small class="muted">${flashBack ? "背面 · 点击卡片翻回正面" : "正面 · 点击卡片翻面"}</small>${favButton(card.id)}</div>
    ${flashBack
      ? `<div class="fc-open"><div class="fc-tap" role="button" tabindex="0" data-action="unflip" aria-label="点击卡片翻回正面">${cardView.back(rich, cardRunBlock(card))}</div></div>`
      : `<div class="fc-tap" role="button" tabindex="0" data-action="flip" aria-label="点击卡片翻开答案">${cardView.front(rich)}</div>`}${!flashBack ? button(icon("skip") + "跳过", "skipCard", "", "outline full flash-under") : session.scheduled ? `<div class="rating">${["忘记", "困难", "记得", "熟练"].map((label, i) => button(label + `<small>${interval(schedule[i + 1].card.due)}</small>`, "rate", i + 1, "rate-" + (i + 1))).join("")}</div>` : button("下一张", "skipCard", "", "primary full flash-under")}<div class="actions">${goButton("暂停复习", "/cards", "outline")}${button("复制为个人闪卡", "copyCard", card.id, "outline")}</div>`,
    "flashcards",
    true,
  );
}
function cardEdit(id) {
  const c = state.userCards.find((c) => c.id === id);
  shell(
    c ? "编辑个人闪卡" : "新建个人闪卡",
    `<form id="card-form" data-id="${e(id)}"><label class="form-field">正面问题<textarea id="card-front" rows="4" required>${e(c?.front.question || "")}</textarea></label><label class="form-field">背面答案<textarea id="card-back" rows="5" required>${e(c?.back.answer || "")}</textarea></label><label class="form-field">补充解释<textarea id="card-explanation" rows="3">${e(c?.back.explanation || "")}</textarea></label><label class="form-field">标签（用逗号分隔）<input id="card-tags" value="${e((c?.tags || []).join(","))}"></label><button class="primary full" type="submit">保存闪卡</button></form>${c ? button("删除这张个人卡片", "deleteCard", id, "full") : ""}`,
    "mine",
    true,
  );
}
const projects = [
  ["retail", "零售销售分析", "从销售额到利润，看清门店表现", "retail_sales"],
  ["inventory", "库存管理", "识别缺货、积压与周转效率", "inventory_management"],
  ["ecommerce", "电商客户分析", "理解客户、留存与复购", "ecommerce_customer"],
  ["finance", "财务数据分析", "核对账目，追踪费用与现金流", "financial_data"],
  ["hr", "人力资源分析", "分析员工结构与人员流动", "human_resources"],
  [
    "procurement",
    "采购数据分析",
    "比较供应商表现与交付效率",
    "procurement_data",
  ],
];
async function projectsPage(id) {
  const project = projects.find((p) => p[0] === id);
  if (project) {
    const qs = content.questions.filter((q) => q.chapterId === "ch19" && q.projectId === id);
    const requestedRoute = route();
    const dataset = dbManifest.datasets.find((item) => item.id === id + "-v2");
    let schema, schemaError;
    try {
      if (!projectSchemas.has(id)) {
        const response = await fetch(dataset.schemaPath);
        if (!response.ok) throw new Error("无法读取数据表概览");
        projectSchemas.set(id, businessErdDictionary(await response.json()));
      }
      schema = projectSchemas.get(id);
    } catch (error) { schemaError = error.message; }
    if (route() !== requestedRoute) return;
    const names = [...new Set(qs.flatMap((q) => q.sourceTables || []))];
    const grains = [...new Set(qs.map((q) => q.grain).filter(Boolean))];
    const overview = schema ? `<details class="project-schema"><summary>任务涉及的数据表与视图 · ${names.length}</summary><dl>${names.map((name) => {
      const info = schema.tables?.[name] || schema.views?.[name];
      return `<div><dt>${e(name)}</dt><dd>${e(typeof info === "string" ? info : info?.description || "")}${Number.isFinite(info?.rowCount) ? `<small>${info.rowCount.toLocaleString()} 行</small>` : ""}</dd></div>`;
    }).join("")}</dl></details>` : `<div class="notice error">${e(schemaError)}${goButton("重新加载", requestedRoute, "small-button")}</div>`;
    const done = qs.filter((q) => independentDone(q.id)).length;
    shell(project[1], `<div class="project-intro">${businessArt(project[3], "summary-illustration")}<div><p>${e(project[2])}</p><small>金额单位为马币分</small></div></div>${grains.length ? `<p class="project-grain">分析粒度 · ${e(grains.join("、"))}</p>` : ""}${overview}${goButton(icon("database") + " 查看数据表与结构", "/lab/" + id + "-v2", "outline full")}<div class="section-heading"><h2>项目任务</h2><small>已完成 ${done} / ${qs.length}</small></div><div class="project-tasks">${questionList(qs, true)}</div>`, "practice", true);
    return;
  }
  shell(
    "业务实战",
    `<p class="page-meta">${projects.length} 个项目 · ${content.questions.filter((q) => q.chapterId === "ch19").length} 项任务</p>${projects.map((p) => goButton(`${businessArt(p[3], "project-img")}<div class="grow"><h3>${p[1]}</h3></div>${icon("right", "chevron")}`, "/projects/" + p[0], "link-row")).join("")}${goButton("第 20 章 · 跨业务综合练习", "/chapter/ch20", "tonal full")}`,
    "home",
    true,
  );
}
async function openLab(id = "lesson") {
  if (labInfo && currentLab === id) return;
  currentLab = id;
  const opening = ++labOpenRevision;
  const custom = personal.find((d) => d.id === id);
  const builtin = dbManifest.datasets.find((d) => d.id === id);
  const example = id.startsWith("example-") ? getKP(id.slice(8)) : null;
  if (id !== "lesson" && !example && !custom && !builtin)
    throw new Error("找不到这个数据集，请重新选择。");
  const info = await rpc(
    "labOpen",
    custom
      ? { bytes: custom.bytes }
      : builtin
        ? { path: builtin.path }
        : { tables: (example || getKP("kp01-01")).sourceTables, setupSql: example?.setupSql },
  );
  if (opening === labOpenRevision && currentLab === id) labInfo = info;
}

function labWorkspace() {
  if (!state.labWorkspaces[currentLab]) {
    const id = "query1";
    state.labWorkspaces[currentLab] = {
      active: id,
      counter: 1,
      tabs: [{ id, title: "查询 1" }],
    };
    const legacy = state.drafts["lab:" + currentLab];
    if (legacy) state.drafts["lab:" + currentLab + ":" + id] = { ...legacy };
  }
  return state.labWorkspaces[currentLab];
}
function labDraftId() {
  return "lab:" + currentLab + ":" + labWorkspace().active;
}
function labCode() {
  return (
    state.drafts[labDraftId()]?.code ??
    formatSqlForDisplay(
      "SELECT * FROM " + (labInfo.tables[0]?.[0] || "orders") + " LIMIT 20;",
    )
  );
}
async function labPage(id) {
  const requestedRoute = route();
  const expectedDataset = id || currentLab;
  const expectedView = labDataView;
  await openLab(expectedDataset);
  if (route() !== requestedRoute || currentLab !== expectedDataset) return;
  let erdSchema, erdError;
  if (labTab === "数据表" && expectedView === "erd") {
    try {
      const builtin = dbManifest.datasets.find(
        (dataset) => dataset.id === expectedDataset,
      );
      let dictionary = {};
      let dictionaryWarning;
      if (builtin) {
        try {
          const response = await fetch(
            builtin.schemaPath || builtin.path.replace(/[^/]+$/, "schema.json"),
          );
          if (!response.ok) throw new Error("无法读取本地数据字典");
          dictionary = businessErdDictionary(await response.json());
        } catch {
          dictionaryWarning = "本地数据字典不可用，当前显示真实数据库结构";
        }
      }
      erdSchema = await rpc("labErd", { dictionary });
      if (dictionaryWarning) erdSchema.warnings.push(dictionaryWarning);
    } catch (error) {
      erdError = error.message;
    }
    if (
      route() !== requestedRoute ||
      currentLab !== expectedDataset ||
      labDataView !== expectedView
    )
      return;
  }
  editorFields = labInfo.fields || [];
  const workspace = labWorkspace();
  const custom = personal.find((d) => d.id === currentLab);
  const name =
    currentLab === "lesson"
      ? "课程示例库"
      : custom?.name ||
        projects.find((p) => currentLab.startsWith(p[0]))?.[1] ||
        "跨业务综合库";
  let body = `<select id="lab-dataset" aria-label="选择数据库"><option value="lesson" ${currentLab === "lesson" ? "selected" : ""}>课程示例库</option>${currentLab.startsWith("example-") ? `<option value="${e(currentLab)}" selected>${e(getKP(currentLab.slice(8)).title)} · 示例库</option>` : ""}${dbManifest.datasets.map((d) => `<option value="${d.id}" ${d.id === currentLab ? "selected" : ""}>${e(projects.find((p) => d.id.startsWith(p[0]))?.[1] || "跨业务综合库")}</option>`).join("")}${personal.map((d) => `<option value="${d.id}" ${d.id === currentLab ? "selected" : ""}>个人 · ${e(d.name)}</option>`).join("")}</select><div class="tabs">${["数据表", "代码", "结果"].map((t) => button(t, "labTab", t, labTab === t ? "selected" : "")).join("")}</div>`;
  if (labTab === "代码")
    body += `${tag(custom ? "个人库 · 可写" : "内置库 · 只读")}<small>SQLite 兼容执行</small><div class="query-tabs" role="tablist" aria-label="查询标签">${workspace.tabs.map((tab) => `<div class="query-tab ${tab.id === workspace.active ? "active" : ""}">${button(e(tab.title), "switchQuery", tab.id, "query-tab-title")}${workspace.tabs.length > 1 ? button(icon("close") + '<span class="sr-only">关闭 ' + e(tab.title) + "</span>", "closeQuery", tab.id, "query-close") : ""}</div>`).join("")}${button(icon("plus") + '<span class="sr-only">新建查询</span>', "addQuery", "", "query-add")}</div>${editor(labDraftId(), labCode())}<div class="actions">${button(busy ? "停止" : icon("play") + " 运行 SQL", busy ? "stop" : "runLab", "", "primary")}${button("查询历史", "labHistory", "", "outline")}</div>${custom ? "" : button("复制为个人实验库", "copyDataset", "", "tonal full")}`;
  if (labTab === "数据表") {
    body += `<div class="lab-data-tabs" role="tablist" aria-label="数据结构视图">${button("数据表列表", "labDataView", "list", expectedView === "list" ? "selected" : "")}${button("ERD 关系图", "labDataView", "erd", expectedView === "erd" ? "selected" : "")}</div>`;
    body +=
      expectedView === "list"
        ? `<p class="muted">${labInfo.tables.length} 个表与视图</p>${labInfo.tables.map(([name, type]) => '<section class="lab-table">' + button(`${icon("database")}<div class="grow"><h3>${e(name)}</h3><small>${type === "view" ? "视图" : "数据表"}</small></div>${icon("right", "chevron")}`, "previewTable", name, "link-row") + '<div class="table-preview" hidden></div></section>').join("")}`
        : erdError
          ? `<div class="notice error">${e(erdError)}</div>${button("重新加载关系图", "labDataView", "erd", "outline")}`
          : '<div id="lab-erd"></div>';
  }
  if (labTab === "结果")
    body += lastResult
      ? `<div class="row between"><small>返回 ${lastResult.rowCount} 行${lastResult.elapsedMs ? " · " + lastResult.elapsedMs + " ms" : ""}</small>${button("导出 CSV", "exportResult", "", "outline")}</div>${table(lastResult.columns, lastResult.rows, 100)}`
      : empty("暂无运行结果");
  shell(
    "代码实验室",
    body,
    "home",
    true,
    labelled(goButton(icon("database"), "/datasets", "icon-button"), "数据集管理"),
  );
  if (erdSchema) {
    document.querySelector("#lab-erd").dataset.dataset = expectedDataset;
    disposeErd = mountErd(document.querySelector("#lab-erd"), {
      schema: erdSchema,
      onPreview: async (name) => {
        try {
          labDataView = "list";
          await render();
          const row = [
            ...document.querySelectorAll('[data-action="previewTable"]'),
          ].find((button) => button.dataset.arg === name);
          if (row) {
            await handleAction("previewTable", name, row);
            row.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        } catch (error) {
          toast(error.message);
        }
      },
    });
  }
}

function mine() {
  const stats = summaryStats();
  const row = (title, count, route, ico, asset = true) =>
    goButton(`<span class="list-icon">${asset ? icon(ico) : icon(ico)}</span><span class="grow menu-title">${e(title)}</span>${count ? `<small class="menu-count">${e(count)}</small>` : ""}${icon("right", "chevron")}`, route, "link-row compact");
  const resourceStatus = state.resourceCheck ? (state.resourceCheck.pass ? "校验通过" : "发现异常") : "未检查";
  shell(
    "我的",
    `<div class="row personal-heading">${image("brand/app_icon_5_192", "personal-logo")}<h1>学习手记</h1></div><div class="stats personal-stats"><div class="stat"><strong>${completedKnowledgePoints()}</strong><small>学完知识点</small></div><div class="stat"><strong>${stats.done}</strong><small>独立完成题目</small></div><div class="stat"><strong>${state.reviewEvents.length}</strong><small>闪卡复习次数</small></div></div>
    <section class="mine-group" aria-label="学习记录">${row("学习统计", "", "/stats", "stats")}${row("错题本", wrongQuestions().length + " 道题", "/wrong", "wrongbook")}${row("收藏夹", state.favorites.filter((id) => getKP(id) || getQuestion(id) || allCards().some((card) => card.id === id)).length + " 项", "/favorites", "favorites")}${row("个人闪卡", state.userCards.length + " 张", "/my-cards", "cards", false)}</section>
    <section class="mine-group" aria-label="数据管理">${row("数据集管理", "", "/datasets", "dataset")}${row("备份与恢复", state.lastBackupExportAt ? "已发起导出" : "尚未导出", "/backup", "backup")}${row("离线资源", resourceStatus, "/resources", "offline")}</section>
    <section class="mine-group" aria-label="应用设置">${row("版本更新", "", "/updates", "download", false)}${row("软件设置", "", "/settings", "settings")}</section>
    <p class="app-version">数屿SQL ${release.version} · 内容资源 ${content.contentVersion}<br>Android 10 及以上</p>`,
    "mine",
  );
}
function statsPage() {
  const stats = summaryStats(),
    completed = content.chapters.filter(completedChapter).length;
  const streak = studyStreak();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const date = now();
    date.setDate(date.getDate() - i);
    days.push({
      label: date.getMonth() + 1 + "/" + date.getDate(),
      count: state.activity[localDay(date)] || 0,
    });
  }
  const max = Math.max(...days.map((d) => d.count), 1);
  const hasStatsData = completedKnowledgePoints() > 0 || stats.count > 0 || Object.keys(state.activity || {}).length > 0;
  shell(
    "学习统计",
    `${hasStatsData ? "" : empty("暂无统计数据", "完成一节课程或一道练习后，这里就会显示你的学习进度。", "", "09_empty_magnifier")}<div class="stats"><div class="stat"><strong>${completedKnowledgePoints()}<small> / ${knowledgePoints().length}</small></strong><small>累计学完知识点</small></div><div class="stat"><strong>${stats.count}<small> / ${content.questions.length}</small></strong><small>累计作答题目</small></div><div class="stat"><strong>${streak}</strong><small>连续学习天数</small></div></div><h2>最近 7 天</h2><small>学习操作次数</small><div class="bar-chart">${days.map((d) => `<div class="bar-day"><div>${d.count}</div><div class="bar" style="height:${Math.max(2, (d.count / max) * 88)}px"></div>${d.label}</div>`).join("")}</div><h2>练习表现</h2><div class="panel"><div class="setting-row"><span>首次独立正确率</span><strong>${stats.rate === null ? "暂无数据" : stats.rate + "%"}</strong></div><div class="setting-row"><span>已独立完成</span><strong>${stats.done} 题</strong></div><div class="setting-row"><span>已完成章节</span><strong>${completed} / 20</strong></div></div><details><summary>统计口径</summary><p class="muted">学习操作包括完成知识点、提交练习和闪卡评级。学习天数包含有效阅读，学习时长从 0.2.0 版本起记录。首次独立正确率按每道已提交题目的首次作答计算，使用提示或参考答案的作答计入辅助学习。</p></details><h2>各章进度</h2>${content.chapters.map((c) => `<div style="margin-bottom:18px"><div class="row between"><small>${c.number}. ${e(c.title)}</small><small>${c.knowledgePoints.filter((k) => completedLesson(k.id)).length}/${c.knowledgePoints.length}</small></div><div class="progress" style="margin:7px 0"><span style="width:${(c.knowledgePoints.filter((k) => completedLesson(k.id)).length / c.knowledgePoints.length) * 100}%"></span></div></div>`).join("")}`,
    "mine",
    true,
  );
}
function wrongPage(id) {
  if (id) {
    const q = getQuestion(id);
    const records = attempted(id).filter((a) => !a.pass && !a.ungraded);
    shell(
      "错误记录",
      `<h1>${e(q.title)}</h1>${records
        .slice()
        .reverse()
        .map(
          (a) =>
            `<h2>${e(new Date(a.time).toLocaleString("zh-CN"))}</h2>${code(a.input)}<div class="notice error">${e(a.message || "作答结果与要求不同")}</div>`,
        )
        .join("")}${goButton("重新练习", "/question/" + id, "primary full")}`,
      "mine",
      true,
    );
    return;
  }
  const list = wrongQuestions();
  shell(
    "错题本",
    `<details class="page-help"><summary>掌握规则</summary><p class="muted">连续两次独立正确后标记已掌握，保留错误历史。</p></details>${list.length ? list.map((q) => `<div>${goButton(`<div class="grow"><h3>${e(q.title)}</h3><small>${attempted(q.id).filter((a) => !a.pass && !a.ungraded).length} 次错误记录</small> ${masteredWrong(q.id) ? tag("已掌握", "green") : tag("待巩固", "warn")}</div>${icon("right", "chevron")}`, "/question/" + q.id, "link-row")}${goButton("查看错误历史", "/wrong/" + q.id, "small-button")}</div>`).join("") : empty("暂无错题", "", goButton("开始练习", "/practice", "primary"))}`,
    "mine",
    true,
  );
}
function favoritesPage() {
  const known = [
    ...content.chapters.flatMap((c) => c.knowledgePoints),
    ...content.questions,
    ...allCards(),
  ];
  const list = known.filter((x) => favorite(x.id));
  shell(
    "收藏夹",
    list.length
      ? list
          .map((x) => {
            const path = x.id.startsWith("kp")
              ? "/lesson/" + x.id
              : x.id.startsWith("q")
                ? "/question/" + x.id
                : "/cards";
            return linkRow(x.title || x.front?.question, "", path, "star");
          })
          .join("")
      : empty("暂无收藏"),
    "mine",
    true,
  );
}
function settingsPage() {
  const s = state.settings;
  const toggle = (label, key) => `<label class="setting-row"><span>${label}</span><input class="setting-switch" type="checkbox" role="switch" data-setting="${key}" ${s[key] ? "checked" : ""}></label>`;
  shell(
    "软件设置",
    `<div class="settings-sections"><section class="panel settings-section"><h2>学习计划</h2>${[
      ["dailyGoal", "每日练习题量", 1, 100],
      ["newCards", "每日新卡上限", 1, 100],
      ["reviewLimit", "每日复习上限", 1, 500],
    ].map(([key, label, min, max]) => `<label class="setting-row"><span>${label}</span><input type="number" data-setting="${key}" value="${s[key]}" min="${min}" max="${max}" step="1" inputmode="numeric"></label>`).join("")}</section>
    <section class="panel settings-section"><h2>显示</h2><label class="setting-slider"><span class="row between"><span>正文字号</span><output id="body-font-value" for="body-font">${s.bodyFont} px</output></span><input id="body-font" aria-label="正文字号" type="range" min="14" max="20" step="1" value="${s.bodyFont}" data-setting="bodyFont"></label><p class="body-font-preview">示例正文：WHERE 子句在分组之前筛选行。</p></section>
    <section class="panel settings-section"><h2>代码编辑器</h2>
    ${toggle("深色代码区域", "editorDark")}${toggle("SQL 自定义键盘", "customKeyboard")}
    <label class="setting-slider"><span class="row between"><span>代码字号</span><output id="font-size-value" for="font-size">${s.fontSize} px</output></span><input id="font-size" aria-label="代码字号" type="range" min="12" max="20" step="1" value="${s.fontSize}" data-setting="fontSize"></label>
    <div class="sql-editor settings-preview ${s.editorDark ? "dark" : ""}" style="--editor-font:${s.fontSize}px" aria-label="代码预览">${code("SELECT id, sales FROM orders ORDER BY id;")}</div></section>
    <section class="panel settings-section"><h2>版本与兼容</h2>${linkRow("版本更新", "v" + release.version, "/updates", "download")}
    <details class="settings-compatibility"><summary>运行环境与语法兼容</summary><div class="notice">数屿SQL ${release.version}\n最低 Android 10 · 安卓手机版\n教学方言 MySQL 8.4\n执行引擎 SQLite WASM（sql.js 1.13.0）\n闪卡调度 ts-fsrs 5.2.3</div><p class="muted">本地执行支持经过验证的语法子集。原生 MySQL 严格模式、排序规则、存储过程与执行计划存在差异。部分专项结构验证暂不支持时会显示“未评定”。</p></details></section></div>`,
    "mine",
    true,
  );
}
function resizeTextField(input) {
  if (input.tagName !== "TEXTAREA" || input.id === "sql-editor") return;
  input.rows = 1;
  input.style.height = "auto";
  input.style.height = input.scrollHeight + 2 + "px";
}
function resizeTextFields() {
  app.querySelectorAll("textarea").forEach(resizeTextField);
}
function updateSettingsPreview() {
  const body = app.querySelector("#body-font");
  if (body) {
    applyBodyFont(body.value);
    app.querySelector("#body-font-value").value = body.value + " px";
  }
  const preview = app.querySelector(".settings-preview");
  if (!preview) return;
  const size = app.querySelector('[data-setting="fontSize"]').value;
  preview.style.setProperty("--editor-font", size + "px");
  preview.classList.toggle("dark", app.querySelector('[data-setting="editorDark"]').checked);
  app.querySelector("#font-size-value").value = size + " px";
}
async function datasetsPage() {
  personal = await datasets();
  shell(
    "数据集管理",
    `<div class="actions">${goButton(icon("plus") + " 导入本地文件", "/import", "primary")}${goButton("打开实验室", "/lab", "outline")}</div><h2>个人数据集 · ${personal.length}</h2>${personal.length ? personal.map((d) => `<div class="link-row"><div class="grow"><h3>${e(d.name)}</h3><small>${(d.bytes.length / 1024 / 1024).toFixed(2)} MB</small></div>${goButton("打开", "/lab/" + d.id, "tonal")}${button(icon("close"), "deleteDataset", d.id, "icon-button")}</div>`).join("") : empty("暂无个人数据集")}<h2>内置数据库 · ${dbManifest.datasets.length}</h2>${dbManifest.datasets.map((d) => linkRow(projects.find((p) => d.id.startsWith(p[0]))?.[1] || "跨业务综合库", (d.bytes / 1024 / 1024).toFixed(1) + " MB · 原始模板只读", "/lab/" + d.id, "database")).join("")}`,
    "mine",
    true
  );
}
async function importPage() {
  shell(
    "导入个人数据",
    `<p class="page-meta">CSV · Excel · JSON · SQLite · SQL，最大 30 MB</p><label class="form-field">选择文件<input type="file" id="dataset-file" accept=".csv,.xlsx,.xls,.json,.sqlite,.db,.sql"></label><div id="import-content">${importData ? `<label class="form-field">数据集名称<input id="import-name" value="${e(importName)}"></label>${importData.sheets ? `<label class="form-field">工作表<select id="import-sheet">${importData.sheets.map((s, i) => `<option value="${i}">${e(s.name)}</option>`).join("")}</select></label>` : ""}<div class="notice">${importData.rows ? importData.rows.length + " 行 · " + importData.columns.length + " 列 · 表名 imported_data" : "文件已读取，等待导入"}</div>${importData.rows ? `<div class="import-preview">${table(importData.columns, importData.rows, 8)}</div>` : ""}${button("确认导入", "confirmImport", "", "primary full")}` : ""}</div><details><summary>导入规则</summary><p class="muted">CSV 默认 UTF-8。Excel 按已有单元格值读取，公式不重新计算。SQL 仅接受本地兼容的建表和插入语句。</p></details>`,
    "mine",
    true
  );
}
function backupPage() {
  shell(
    "备份与恢复",
    `${finalArt("11_ready_anchor", "summary-illustration")}<details><summary>备份范围</summary><p class="muted">学习进度、笔记、错题历史、收藏、闪卡计划、个人卡片、草稿和个人数据库。</p></details><p class="muted">${state.lastBackupExportAt ? "上次发起导出 " + new Date(state.lastBackupExportAt).toLocaleString("zh-CN") + "，保存结果以系统提示为准。" : "尚未导出备份"}</p>${button(icon("download") + " 导出完整备份", "exportBackup", "", "primary full")}<h2>恢复备份</h2><label class="form-field">选择 数屿SQL备份文件<input type="file" id="backup-file" accept=".json"></label><div id="backup-preview"></div><p class="muted">合并时保留当前记录，相同 ID 的冲突以当前记录为准。覆盖会替换当前学习记录，需再次确认。</p>`,
    "mine",
    true,
  );
}
function updatesPage() {
  const current = nativeVersion?.versionName || release.version;
  const status = updateState.status;
  const available = updateState.release;
  const active = ["checking", "downloading"].includes(status);
  const ready = ["ready", "permission"].includes(status);
  const notes =
    available &&
    ["available", "downloading", "ready", "permission"].includes(status)
      ? available.notes
      : release.notes;
  const lines = Array.isArray(notes)
    ? notes
    : String(notes || "")
        .split("\n")
        .filter(Boolean);
  shell(
    "版本更新",
    `<div class="update-version-card"><div class="update-brand">${finalArt("01_brand_island")}</div><h1>数屿SQL</h1><p class="update-version">v${e(current)}</p><small>构建 ${nativeVersion?.versionCode || release.versionCode}</small><div class="update-status ${status === "latest" || ready ? "success" : status === "error" ? "error" : ""}" role="status">${e(updateState.message)}</div>${status === "downloading" ? `<progress value="${updateState.progress}" max="100" aria-label="下载进度"></progress><small>${updateState.progress}%</small>` : ""}${available && ["available", "downloading", "ready", "permission"].includes(status) ? `<p class="new-version">新版本 v${e(available.versionName)}</p>` : ""}</div><section class="panel update-notes"><div class="row between"><h2>更新说明</h2><small>${e(available?.releaseDate || release.releaseDate)}</small></div><ul>${lines.map((line) => `<li>${e(line)}</li>`).join("")}</ul></section><div class="notice">覆盖更新会保留本地学习记录。安装由安卓系统确认。</div><div class="update-actions">${button(status === "checking" ? "正在检查…" : status === "downloading" ? "正在下载…" : "检查更新", "checkUpdate", "", "primary full")}${status === "available" ? button("下载并校验更新", "downloadUpdate", "", "tonal full") : ""}${ready ? button("安装更新", "installUpdate", "", "primary full") : ""}</div><details><summary>更新来源</summary><p class="muted">GitHub · ${UPDATE_REPOSITORY}<br>下载后核对 SHA-256、包名、版本与签名。</p></details>${!window.AndroidUpdates ? '<p class="muted">安装更新需在安卓应用中完成。</p>' : ""}`,
    "mine",
    true,
  );
  if (active)
    document.querySelector("[data-action=checkUpdate]").disabled = true;
}
window.onUpdateEvent = (event) => {
  updateState = event;
  if (route() === "/updates") render();
};
async function checkUpdate() {
  updateState = { status: "checking", message: "正在检查版本…", progress: 0 };
  await render();
  if (window.AndroidUpdates) {
    window.AndroidUpdates.check();
    return;
  }
  try {
    const latest = await fetchLatestUpdate((url) =>
      fetch("/preview-fetch?url=" + encodeURIComponent(url)),
    );
    updateState = !latest
      ? { status: "unpublished", message: "更新源尚未发布版本", progress: 0 }
      : latest.versionCode > release.versionCode
        ? {
            status: "available",
            message: "发现新版本",
            release: latest,
            progress: 0,
          }
        : {
            status: "latest",
            message: "已是最新版本",
            release: latest,
            progress: 0,
          };
  } catch (error) {
    updateState = {
      status: "error",
      message:
        error instanceof TypeError
          ? "检查失败，请检查网络后重试。"
          : error.message,
      progress: 0,
    };
  }
  await render();
}
function resourcesPage() {
  const check = state.resourceCheck;
  shell(
    "离线资源",
    `${finalArt(check && !check.pass ? "14_load_failed_lighthouse_off" : "10_ready_lighthouse", "summary-illustration")}<div class="notice ${check?.pass ? "success" : ""}">${check ? `上次检查 ${new Date(check.time).toLocaleString("zh-CN")}\n${check.pass ? "资源完整性与 SQL 引擎自检通过" : e(check.message)}` : "尚未进行完整性检查"}</div>${button("检查离线资源", "checkResources", "", "primary full")}<div id="resource-progress" class="muted" style="margin-top:12px"></div><div class="stats"><div class="stat"><strong>${content.chapters.length}</strong><small>课程章节</small></div><div class="stat"><strong>${content.questions.length}</strong><small>练习题目</small></div><div class="stat"><strong>${content.cards.length}</strong><small>内置闪卡</small></div></div><p class="muted">卸载应用或清除数据会删除个人记录，请先导出备份。</p><details><summary>检查方式</summary><p class="muted">逐项核对 SHA-256，并执行 SQL 引擎自检。</p></details>`,
    "mine",
    true,
  );
}
async function render() {
  disposeErd?.();
  disposeErd = null;
  const version = ++revision;
  const path = route();
  try {
    if (path === "/") home();
    else if (path === "/learn") learning();
    else if (path.startsWith("/chapter/")) chapterPage(path.split("/")[2]);
    else if (path.startsWith("/lesson/")) lessonPage(path.split("/")[2]);
    else if (path.startsWith("/practice")) practice(path);
    else if (path.startsWith("/question/"))
      await questionPage(path.split("/")[2]);
    else if (path === "/cards") cardsPage();
    else if (path === "/review") reviewPage();
    else if (path === "/card-preview") cardPreviewPage();
    else if (path === "/card-chapters")
      shell(
        "按章节复习",
        content.chapters
          .map((c) =>
            button(
              `${e(c.title)}${icon("right", "chevron")}`,
              "chapterCards",
              c.id,
              "link-row",
            ),
          )
          .join(""),
        "flashcards",
        true,
      );
    else if (path.startsWith("/card-edit/")) cardEdit(path.split("/")[2]);
    else if (path === "/my-cards")
      shell(
        "个人闪卡",
        `${goButton("新建个人闪卡", "/card-edit/new", "primary full")}${state.userCards.length ? state.userCards.map((c) => linkRow(c.front.question, c.back.answer, "/card-edit/" + c.id, "cards")).join("") : empty("暂无个人闪卡")}`,
        "mine",
        true,
      );
    else if (path.startsWith("/projects")) await projectsPage(path.split("/")[2]);
    else if (path.startsWith("/lab")) await labPage(path.split("/")[2]);
    else if (path === "/mine") mine();
    else if (path === "/stats") statsPage();
    else if (path.startsWith("/wrong")) wrongPage(path.split("/")[2]);
    else if (path === "/favorites") favoritesPage();
    else if (path === "/settings") settingsPage();
    else if (path === "/datasets") await datasetsPage();
    else if (path === "/import") await importPage();
    else if (path === "/backup") backupPage();
    else if (path === "/resources") resourcesPage();
    else if (path === "/updates") updatesPage();
    else home();
    if (version !== revision) return;
    mountEditor(app, saveEditorDraft);
    resizeTextFields();
    mountKeyboardResize();
    mountQuizSplit();
    document.body.classList.toggle(
      "has-sql-keyboard",
      !!document.querySelector(".editor-workspace .keyboard-wrap:not(.hidden)"),
    );
  } catch (error) {
    if (version !== revision) return;
    shell(
      "暂时无法打开",
      `<div class="notice error">${e(error.message)}</div>${button("重新尝试", "go", path, "primary full")}`,
      "home",
      true,
    );
  }
}
async function recordAttempt(q, input, result, assistance = { hints, answerShown }) {
  const ungraded = !!result.unsupported;
  const attempt = {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now() + "-" + Math.random(),
    questionId: q.id,
    contentVersion: q.contentVersion,
    executionMode: q.executionMode,
    gradingRevision: q.gradingRevision,
    time: now().toISOString(),
    input,
    pass: !!result.pass,
    independent: assistance.hints === 0 && !assistance.answerShown,
    hints: assistance.hints,
    answerShown: assistance.answerShown,
    ungraded,
    message: result.message || "",
    actual: result.result
      ? {
          columns: result.result.columns,
          rows: result.result.rows.slice(0, 20),
          rowCount: result.result.rowCount,
        }
      : null,
  };
  const hardIds = new Set(content.questions.filter((item) => HARD_LEVELS.includes(item.difficulty)).map((item) => item.id));
  const firstHardPass = attempt.pass && !ungraded && hardIds.has(q.id) && !state.attempts.some((a) => a.pass && !a.ungraded && hardIds.has(a.questionId));
  const firstToday = !ungraded && !state.activity[today()];
  state.attempts.push(attempt);
  if (!ungraded) state.activity[today()] = (state.activity[today()] || 0) + 1;
  await persist();
  cheerStreak(firstToday);
  if (firstHardPass) cheer({ art: finalArt("13_encourage", "summary-illustration"), title: "第一次答对难题", message: `「${q.title.split(" · ")[0]}」是${q.difficulty}题，你做对了。这是一个很好的开始。`, actionLabel: "继续练习", route: "/practice" });
}
async function evaluateQuestion(id, submit) {
  if (busy) return;
  const q = getQuestion(id);
  const assistance = { hints, answerShown };
  let result;
  const draft = draftForQuestion(id);
  let input = "";
  if (q.type === "选择") {
    if (!selectedOption) {
      toast("先选一个答案。");
      return;
    }
    input = selectedOption;
    result = {
      pass: selectedOption === q.correctOptionId,
      submitted: true,
      message:
        selectedOption === q.correctOptionId
          ? ""
          : q.options.find((o) => o.id === selectedOption)?.explanation,
    };
  } else {
    input = draft.code ?? q.initialCode ?? "";
    if (!input.trim()) {
      quizTab = "题目";
      render();
      toast("先写一条 SQL。");
      return;
    }
    busy = true;
    questionKeyboard = false;
    quizTab = "题目";
    render();
    try {
      result = await rpc(
        "exercise",
        { question: q, sql: input, submit },
        q.projectId ? 60000 : 20000,
      );
    } catch (error) {
      result = { pass: false, message: error.message, submitted: submit, error: true };
    } finally {
      busy = false;
    }
  }
  result.submitted = submit;
  if (submit) await recordAttempt(q, input, result, assistance);
  if (route() !== "/question/" + id || loadedQuestionId !== id) return;
  if (result.result) {
    lastResult = result.result;
    quizTab = "题目";
  }
  questionKeyboard = false;
  feedback = result;
  await render();
  if (route() === "/question/" + id) document.querySelector(".query-output, .judge-feedback")?.scrollIntoView({ block: "nearest" });
  if (!submit && !result.result && result.pass) toast("SQL 执行完成。");
}
async function exportFile(name, text, mime = "application/json") {
  if (window.AndroidFiles) {
    window.AndroidFiles.save(name, mime, text);
    return;
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
function bytesToBase64(bytes) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function digest(text) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    typeof text === "string" ? new TextEncoder().encode(text) : text,
  );
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
let pendingBackup = null;
function validateState(value) {
  const required = [
    "completed",
    "favorites",
    "attempts",
    "reviewEvents",
    "userCards",
  ];
  if (
    !value ||
    value.schemaVersion !== 1 ||
    required.some((k) => !Array.isArray(value[k])) ||
    !value.reviews ||
    !value.drafts ||
    !value.settings ||
    !value.notes ||
    !value.activity
  )
    throw new Error("备份记录结构或版本不受支持。");
  const known = new Set(
    [...knowledgePoints().map((k) => k.id), ...Object.keys(content.curriculumMigration.targets), ...content.curriculumMigration.removed],
  );
  if (value.completed.some((id) => !known.has(id)))
    throw new Error("备份包含无法识别的知识点 ID。");
  const qIds = new Set([...content.questions.map((q) => q.id), ...content.curriculumMigration.removedQuestions]);
  if (
    value.attempts.some(
      (a) =>
        !qIds.has(a.questionId) ||
        typeof a.input !== "string" ||
        !Number.isFinite(Date.parse(a.time)),
    )
  )
    throw new Error("备份作答记录格式无效。");
  for (const c of value.userCards)
    if (
      !c.id?.startsWith("user-") ||
      typeof c.front?.question !== "string" ||
      typeof c.back?.answer !== "string"
    )
      throw new Error("个人闪卡格式无效。");
  for (const review of Object.values(value.reviews))
    if (
      !Number.isFinite(Date.parse(review.due)) ||
      typeof review.stability !== "number"
    )
      throw new Error("闪卡计划数据无效。");
}
function mergeState(existing, incoming) {
  const result = JSON.parse(JSON.stringify(existing));
  const mergeById = (a, b) => [
    ...b.filter((x) => !a.some((y) => y.id === x.id)),
    ...a,
  ];
  for (const key of ["completed", "favorites", "consolidatedCompleted"])
    result[key] = [...new Set([...(existing[key] || []), ...(incoming[key] || [])])];
  for (const key of ["attempts", "reviewEvents", "userCards"])
    result[key] = mergeById(existing[key], incoming[key]);
  result.attempts.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  result.reviewEvents.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  for (const key of ["notes", "reviews", "drafts"])
    result[key] = { ...incoming[key], ...existing[key] };
  result.studyDays = {
    ...(incoming.studyDays || {}),
    ...(existing.studyDays || {}),
  };
  result.studySeconds = Math.max(
    incoming.studySeconds || 0,
    existing.studySeconds || 0,
  );
  for (const key of Object.keys(incoming.activity))
    result.activity[key] = Math.max(
      existing.activity[key] || 0,
      incoming.activity[key],
    );
  return result;
}
async function executeLab(sql) {
  if (busy) return;
  busy = true;
  try {
    await openLab(currentLab);
    const personalDb = personal.find((d) => d.id === currentLab);
    const started = performance.now();
    const result = await rpc(
      "labQuery",
      { sql, writable: !!personalDb },
      30000,
    );
    if (result.bytes) {
      await putDataset({
        ...personalDb,
        bytes: result.bytes,
        updatedAt: now().toISOString(),
      });
      personal = await datasets();
      delete result.bytes;
      labInfo = await rpc("labSchema");
    }
    lastResult = {
      ...result,
      elapsedMs: Math.round(performance.now() - started),
    };
    labResults.set(labDraftId(), lastResult);
    state.history.unshift({
      id: Date.now() + "",
      dataset: currentLab,
      sql,
      time: now().toISOString(),
    });
    state.history = state.history.slice(0, 100);
    await persist();
    labTab = "结果";
    await render();
  } finally {
    busy = false;
  }
}
async function handleAction(action, arg, element) {
  switch (action) {
    case "resetLearning":
      search = "";
      state.learningView.stage = "全部";
      await persist();
      await render();
      break;
    case "questionDifficulty":
      questionFilters.difficulty = arg;
      await render();
      break;
    case "resetQuestions":
      search = "";
      questionFilters = { chapter: "", type: "", difficulty: "", status: "" };
      await render();
      break;
    case "cardMode":
      newMode = arg;
      cardScheduled = ["每日到期", "新卡", "薄弱"].includes(arg);
      await render();
      break;
    case "toggleSched":
      cardScheduled = !cardScheduled;
      await render();
      break;
    case "cpType":
      cardPreview = { ...cardPreview, type: arg, index: 0 };
      await render();
      break;
    case "cpStep":
      cardPreview.index += Number(arg);
      await render();
      break;
    case "cpFace":
      cardPreview.face = arg;
      await render();
      break;
    case "spotFlip":
      spotBack = !spotBack;
      await render();
      break;
    case "spotPrev":
      if (spotHistory.length) { spotId = spotHistory.pop(); spotBack = false; await render(); }
      break;
    case "spotNext": {
      const pool = allCards();
      if (spotId) spotHistory.push(spotId);
      spotHistory = spotHistory.slice(-30);
      spotId = pool[Math.floor(Math.random() * pool.length)]?.id;
      spotBack = false;
      await render();
      break;
    }
    case "miniFlip":
      cardFlipped.has(arg) ? cardFlipped.delete(arg) : cardFlipped.add(arg);
      await render();
      break;
    case "allFront":
      cardFlipped.clear();
      await render();
      break;
    case "cardRun": {
      const [cardId, index] = arg.split("|");
      const card = allCards().find((x) => x.id === cardId);
      const ex = card && cardExamples(card)[Number(index)];
      if (!ex) break;
      element.disabled = true;
      let outcome;
      try {
        let runSql = ex.sqliteSql || ex.sql;
        for (const [from, to] of card.fnSpec?.runReplace || []) runSql = runSql.split(from).join(to);
        outcome = { result: await rpc("lesson", { tables: [], setupSql: ex.setupSql, sql: runSql }) };
      } catch (error) {
        outcome = { error: error?.message || String(error) };
      } finally {
        element.disabled = false;
      }
      const html = cardRunResult(ex, outcome);
      cardRuns.set(arg, html);
      document.querySelectorAll(".fc-run-out").forEach((node) => { if (node.dataset.run === arg) node.innerHTML = html; });
      break;
    }
    case "cardType":
      cardTypeFilter = arg;
      cardBrowseLimit = 40;
      await render();
      break;
    case "cardTier":
      cardTierFilter = arg;
      cardBrowseLimit = 40;
      await render();
      break;
    case "browseChapter":
      cardBrowseChapter = arg;
      cardBrowseLimit = 40;
      await render();
      break;
    case "cardLab": {
      const c = allCards().find((x) => x.id === arg);
      if (!c) return;
      const kpId = (c.primaryKnowledgePointIds || c.knowledgePointIds || [])[0];
      const dataset = getKP(kpId)?.datasetId || "example-" + kpId;
      await openLab(dataset);
      const workspace = labWorkspace();
      const tabId = "query" + ++workspace.counter;
      workspace.tabs.push({ id: tabId, title: "闪卡示例" });
      workspace.active = tabId;
      state.drafts[labDraftId()] = { code: formatSqlForDisplay(c.back.sqliteCode || c.back.code) };
      await persist();
      lastResult = null;
      labTab = "代码";
      navigate("/lab/" + dataset);
      break;
    }
    case "cardChapter":
      cardChapter = arg;
      await render();
      break;
    case "resetCardSearch":
      cardSearch = "";
      cardBrowseLimit = 40;
      await render();
      break;
    case "moreCards": {
      const scroll = window.scrollY;
      cardBrowseLimit += 40;
      await render();
      window.scrollTo(0, scroll);
      break;
    }
    case "go":
      if (arg.startsWith("/question/")) {
        loadedQuestionId = null;
        const current = route();
        if (current.startsWith("/practice")) {
          const kp = current.startsWith("/practice/kp/") ? current.split("/").pop() : null;
          questionSequence = filterQuestions(content.questions.filter((q) => !kp || q.knowledgePointIds.includes(kp))).map((q) => q.id);
        } else if (current.startsWith("/lesson/")) {
          questionSequence = getKP(current.split("/").pop()).relatedQuestionIds;
        } else if (current.startsWith("/projects/")) {
          questionSequence = content.questions.filter((q) => q.projectId === current.split("/").pop()).map((q) => q.id);
        } else questionSequence = null;
      }
      lastResult = null;
      feedback = null;
      navigate(arg);
      break;
    case "adjacentQuestion":
      if (busy || !arg) break;
      loadedQuestionId = null;
      navigate(arg);
      break;
    case "back":
      if (history.length > 1) history.back();
      else navigate("/");
      break;
    case "favorite":
      state.favorites = favorite(arg)
        ? state.favorites.filter((id) => id !== arg)
        : [...state.favorites, arg];
      await persist();
      element.classList.toggle("selected");
      element.setAttribute("aria-label", favorite(arg) ? "取消收藏" : "收藏");
      toast(favorite(arg) ? "已收藏" : "已取消收藏");
      break;
    case "completeLesson": {
      let finished = null;
      if (!completedLesson(arg)) {
        const chapter = content.chapters.find((c) => c.knowledgePoints.some((k) => k.id === arg));
        const wasDone = chapter ? completedChapter(chapter) : true;
        if (lessonNoteKey(content.curriculumMigration, arg) === arg) state.completed.push(arg);
        else (state.consolidatedCompleted ??= []).push(arg);
        await markActivity();
        toast("已记录学习进度。");
        if (chapter && !wasDone && completedChapter(chapter)) finished = chapter;
      }
      await render();
      if (finished) {
        const all = content.chapters.every(completedChapter);
        cheer(all
          ? { art: milestoneArt(), title: "全部课程学完了！", message: `你已经学完全部 ${knowledgePoints().length} 个知识点。回到练习和闪卡继续巩固吧。`, actionLabel: "去练习", route: "/practice" }
          : { art: milestoneArt(), title: `第 ${finished.number} 章学完了`, message: `「${finished.title}」的 ${finished.knowledgePoints.length} 个知识点都已完成。`, actionLabel: "继续学习", route: "/learn" });
      }
      break;
    }
    case "lessonLab": {
      const k = getKP(arg);
      const dataset = k.datasetId || "example-" + arg;
      await openLab(dataset);
      const workspace = labWorkspace();
      const tabId = "query" + ++workspace.counter;
      workspace.tabs.push({ id: tabId, title: "课程示例" });
      workspace.active = tabId;
      state.drafts[labDraftId()] = { code: formatSqlForDisplay(k.sqliteSql || k.mysqlSql) };
      await persist();
      lastResult = null;
      labTab = "代码";
      navigate("/lab/" + dataset);
      break;
    }
    case "saveLessonNote": {
      const note = document.querySelector("#note");
      if (!note || note.dataset.id !== arg) break;
      const savedValue = note.value;
      state.notes[lessonNoteKey(content.curriculumMigration, arg)] = savedValue;
      element.disabled = true;
      try {
        await persist();
        if (document.querySelector("#note")?.dataset.id === arg && document.querySelector("#note").value === savedValue) document.querySelector("#note-status").textContent = "已保存";
      } finally { element.disabled = false; }
      break;
    }
    case "cmpTab": {
      const box = element.closest(".result-compare");
      box.querySelectorAll('[role="tab"]').forEach((tab) => tab.setAttribute("aria-selected", String(tab === element)));
      box.querySelectorAll(".cmp-pane").forEach((pane) => { pane.hidden = pane.dataset.pane !== arg; });
      break;
    }
    case "stemToggle": {
      const box = element.closest(".quiz-split");
      if (box) {
        const expanding = !box.classList.contains("expanded");
        if (!expanding) captureQuizScroll();
        quizExpanded = expanding;
        box.classList.toggle("expanded", expanding);
        box.closest(".page")?.classList.toggle("quiz-expanded", expanding);
        layoutQuiz();
        if (expanding) element.scrollIntoView({ block: "nearest" });
        else { window.scrollTo(0, 0); restoreQuizScroll(); }
        break;
      }
      const stem = element.closest(".stem");
      stem.classList.remove("mini");
      stem.classList.add("open");
      element.hidden = true;
      break;
    }
    case "figTab": {
      const [group, index] = String(arg).split(":");
      const card = [...document.querySelectorAll("[data-figure-group]")].find((item) => item.dataset.figureGroup === group);
      if (!card) break;
      card.querySelectorAll(".fig-tab").forEach((tab, i) => { const on = String(i) === index; tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1; });
      card.querySelectorAll(".fig-panel").forEach((panel, i) => { panel.hidden = String(i) !== index; });
      break;
    }
    case "fnPick": {
      const [figureId, index] = String(arg).split(":");
      const figure = [...document.querySelectorAll("[data-figure]")].find((item) => item.dataset.figure === figureId);
      const button = figure?.querySelector(`.fig-call[data-arg="${CSS.escape(arg)}"]`);
      if (!figure || !button) break;
      const on = button.getAttribute("aria-pressed") !== "true";
      figure.querySelectorAll(".fig-call").forEach((item) => item.setAttribute("aria-pressed", "false"));
      figure.querySelectorAll(".hl").forEach((item) => item.classList.remove("hl"));
      figure.classList.toggle("picking", on);
      if (on) {
        button.setAttribute("aria-pressed", "true");
        const columns = (button.dataset.cols || "").split("|").filter(Boolean);
        figure.querySelectorAll("[data-col],[data-out]").forEach((cell) => { if ((cell.dataset.out === index) || columns.includes(cell.dataset.col)) cell.classList.add("hl"); });
      }
      break;
    }
    case "lessonJump": {
      const targets = { concept: "concept", syntax: "syntax", example: "steps", cautions: "cautions" };
      const section = document.querySelector(`[data-lesson-section="${targets[arg]}"]`) || document.querySelector('[data-lesson-section="example"]');
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      section?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      break;
    }
    case "lessonStep":
    case "lessonStepMove": {
      const box = element.closest(".lesson-code-explanation");
      if (!box) break;
      const items = [...box.querySelectorAll(".step-item")];
      const current = items.findIndex((item) => !item.querySelector(".step-body").hidden);
      const target = action === "lessonStep" ? (Number(arg) === current ? -1 : Number(arg)) : Math.min(items.length - 1, Math.max(0, current + Number(arg)));
      items.forEach((item, i) => {
        item.querySelector(".step-body").hidden = i !== target;
        item.querySelector(".step-row").setAttribute("aria-expanded", String(i === target));
        item.classList.toggle("open", i === target);
      });
      const [previous, next] = box.querySelectorAll(".step-nav button");
      previous.disabled = target <= 0;
      next.disabled = target >= items.length - 1;
      if (target >= 0) items[target].scrollIntoView({ block: "nearest", behavior: "auto" });
      break;
    }
    case "codeWrap": {
      const wrap = !element.closest(".code-block").classList.contains("nowrap") ? false : true;
      try { localStorage.setItem("lessonCodeWrap", wrap ? "on" : "off"); } catch {}
      document.querySelectorAll(".code-block").forEach((block) => {
        block.classList.toggle("nowrap", !wrap);
        block.querySelector('[data-action="codeWrap"]').setAttribute("aria-pressed", String(wrap));
      });
      break;
    }
    case "codeCopy": {
      const text = element.closest(".code-block").querySelector("pre code")?.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        toast("已复制代码。");
      } catch {
        toast("复制失败，请长按代码手动复制。");
      }
      break;
    }
    case "lessonRun": {
      element.disabled = true;
      try {
        const k = getKP(arg);
        const r = await rpc("lesson", {
          tables: k.datasetId ? undefined : k.sourceTables,
          setupSql: k.setupSql,
          path: dbManifest.datasets.find((dataset) => dataset.id === k.datasetId)?.path,
          sql: k.presentation?.completeCode.sqliteSql || k.sqliteSql,
        });
        if (route() !== "/lesson/" + arg) break;
        lessonExampleResult = { id: arg, result: r };
        document.querySelector("#lesson-result").innerHTML =
          lessonResult(k, r);
      } finally {
        element.disabled = false;
      }
      break;
    }
    case "randomQuestion": {
      const kp = route().startsWith("/practice/kp/") ? route().split("/").pop() : null;
      const list = filterQuestions(content.questions.filter((q) => !kp || q.knowledgePointIds.includes(kp)));
      questionSequence = list.map((q) => q.id);
      if (list.length) {
        loadedQuestionId = null;
        navigate(
          "/question/" + list[Math.floor(Math.random() * list.length)].id,
        );
      } else toast("当前筛选下没有题目。");
      break;
    }
    case "option":
      selectedOption = arg;
      state.drafts[loadedQuestionId] = {
        ...state.drafts[loadedQuestionId],
        option: arg,
      };
      await persist();
      await render();
      break;
    case "quizTab": {
      const next = arg === "数据表" ? "数据表" : "题目";
      if (!document.querySelector(".quiz-split")) { quizTab = next; questionKeyboard = false; await render(); break; }
      captureQuizScroll(); // 隐藏面板（display:none）会丢失滚动位置，所以切换前先记下，切换后恢复
      quizTab = next;
      document.querySelectorAll(".quiz-top .tabs button").forEach((tab) => tab.classList.toggle("selected", tab.dataset.arg === next));
      document.querySelectorAll(".quiz-pane").forEach((pane) => { pane.hidden = pane.dataset.pane !== next; });
      restoreQuizScroll();
      requestAnimationFrame(() => { restoreQuizScroll(); syncStems(); });
      if (next === "数据表") await loadQuizTables(element?.dataset.retry === "1");
      break;
    }
    case "hint": {
      const max = Math.min(getQuestion(arg).hints.length, 3);
      const key = arg + ":hints";
      if (hints > 0 && !openFolds.has(key)) openFolds.add(key);
      else if (hints < max) { hints += 1; openFolds.add(key); }
      else openFolds.delete(key);
      state.drafts[arg] = { ...draftForQuestion(arg), executionMode: getQuestion(arg).executionMode, gradingRevision: getQuestion(arg).gradingRevision, hints, answerShown };
      await persist();
      await render();
      break;
    }
    case "showAnswer": {
      const key = arg + ":ref";
      if (!answerShown) { answerShown = true; openFolds.add(key); }
      else if (openFolds.has(key)) openFolds.delete(key);
      else openFolds.add(key);
      state.drafts[arg] = { ...draftForQuestion(arg), executionMode: getQuestion(arg).executionMode, gradingRevision: getQuestion(arg).gradingRevision, hints, answerShown: true };
      await persist();
      await render();
      break;
    }
    case "runQuestion":
      await evaluateQuestion(arg, false);
      break;
    case "submitQuestion":
      await evaluateQuestion(arg, true);
      break;
    case "stop":
      stopSql();
      busy = false;
      toast("执行已停止。");
      break;
    case "keyboard":
      if (arg === "字段" && route().startsWith("/question/")) {
        const id = loadedQuestionId;
        await questionTables(getQuestion(id));
        if (route() !== "/question/" + id || !element.isConnected) break;
        editorFields = questionFieldCache.get(id) || [];
      }
      document.querySelector("#keypad").innerHTML = keys(arg);
      element.parentElement
        .querySelectorAll("button")
        .forEach((b) => b.classList.toggle("selected", b === element));
      break;
    case "insert":
      editorCommand("insert", arg);
      break;
    case "formatEditor": {
      const input = document.querySelector("#sql-editor");
      if (input) editorCommand("replace", formatSqlForDisplay(input.value));
      break;
    }
    case "homeStage":
      state.learningView.stage = arg;
      search = "";
      await persist();
      location.hash = "/learn";
      break;
    case "learningStage":
      state.learningView.stage = arg;
      await persist();
      await render();
      break;
    case "togglePracticeChapter": {
      const scoped = search || Object.values(questionFilters).some(Boolean) || route().startsWith("/practice/kp/");
      const view = scoped ? practiceFilterView : state.practiceView;
      const expanded = view.expanded;
      view.expanded = expanded.includes(arg)
        ? expanded.filter((id) => id !== arg)
        : [...expanded, arg];
      const position = element.getBoundingClientRect().top;
      await persist();
      await render();
      const heading = document.querySelector(`[data-action="togglePracticeChapter"][data-arg="${arg}"]`);
      heading?.focus({ preventScroll: true });
      if (heading) window.scrollBy(0, heading.getBoundingClientRect().top - position);
      break;
    }
    case "toggleChapter": {
      const view = search ? learningSearchView : state.learningView;
      const expanded = view.expanded;
      view.expanded = expanded.includes(arg)
        ? expanded.filter((id) => id !== arg)
        : [...expanded, arg];
      const position = element.getBoundingClientRect().top;
      await persist();
      await render();
      const heading = document.querySelector(`[data-action="toggleChapter"][data-arg="${arg}"]`);
      heading?.focus({ preventScroll: true });
      if (heading) window.scrollBy(0, heading.getBoundingClientRect().top - position);
      break;
    }
    case "editorUndo":
      editorCommand("undo");
      break;
    case "editorRedo":
      editorCommand("redo");
      break;
    case "editorKeyboard": {
      state.settings.customKeyboard = !state.settings.customKeyboard;
      if (route().startsWith("/question/")) questionKeyboard = state.settings.customKeyboard;
      const keyboard = document.querySelector(".keyboard-wrap");
      keyboard.classList.toggle("hidden", !state.settings.customKeyboard);
      document.body.classList.toggle(
        "has-sql-keyboard",
        state.settings.customKeyboard,
      );
      const input = document.querySelector("#sql-editor");
      input.inputMode = state.settings.customKeyboard ? "none" : "text";
      input.blur();
      input.focus({ preventScroll: true });
      await persist();
      break;
    }
    case "editorFullscreen": {
      const workspace = document.querySelector(".editor-workspace");
      workspace.classList.toggle("fullscreen");
      document.body.classList.toggle(
        "editor-is-fullscreen",
        workspace.classList.contains("fullscreen"),
      );
      const fullscreen = workspace.classList.contains("fullscreen");
      element.innerHTML =
        icon(fullscreen ? "shrink" : "expand") +
        '<span class="sr-only">' +
        (fullscreen ? "退出全屏" : "全屏编辑") +
        "</span>";
      applyKeyboardHeight();
      document.querySelector("#sql-editor")?._editor?.sync();
      break;
    }
    case "editorTheme":
      state.settings.editorDark = !state.settings.editorDark;
      await persist();
      const editor = document.querySelector("#sql-editor");
      editor
        ?.closest(".sql-editor")
        ?.classList.toggle("dark", state.settings.editorDark);
      element.textContent = state.settings.editorDark ? "浅色" : "深色";
      break;
    case "startCards":
      await startCards(arg);
      break;
    case "resumeCards":
      flashBack = false;
      flashGraded = false;
      navigate("/review");
      break;
    case "flip":
      flashBack = true;
      await render();
      break;
    case "unflip":
      flashBack = false;
      await render();
      break;
    case "rate": {
      if (!flashBack || flashGraded) return;
      flashGraded = true;
      const session = state.flashSession;
      const id = session.ids[session.index];
      const wasNew = !state.reviews[id];
      const previousReview = state.reviews[id]
        ? JSON.parse(JSON.stringify(state.reviews[id]))
        : null;
      const previousIndex = session.index;
      const output = scheduler.repeat(
        state.reviews[id] ? hydrate(state.reviews[id]) : createEmptyCard(),
        now(),
      )[Number(arg)];
      state.reviews[id] = output.card;
      const event = {
        id: Date.now() + "-" + id,
        cardId: id,
        rating: Number(arg),
        time: now().toISOString(),
        wasNew,
        log: output.log,
      };
      state.reviewEvents.push(event);
      session.lastRating = {
        eventId: event.id,
        cardId: id,
        index: previousIndex,
        previousReview,
      };
      session.ratings.push(event);
      session.index++;
      flashBack = false;
      await markActivity();
      flashGraded = false;
      await render();
      break;
    }
    case "undoRating": {
      const session = state.flashSession;
      const previous = session?.lastRating;
      if (!previous) return;
      const event = state.reviewEvents.find(
        (event) => event.id === previous.eventId,
      );
      if (!event) return;
      if (previous.previousReview)
        state.reviews[previous.cardId] = previous.previousReview;
      else delete state.reviews[previous.cardId];
      state.reviewEvents = state.reviewEvents.filter(
        (event) => event.id !== previous.eventId,
      );
      session.ratings = session.ratings.filter(
        (event) => event.id !== previous.eventId,
      );
      session.index = previous.index;
      delete session.lastRating;
      const day = localDay(new Date(event.time));
      state.activity[day] = Math.max(0, (state.activity[day] || 0) - 1);
      if (!state.activity[day]) delete state.activity[day];
      flashBack = true;
      flashGraded = false;
      await persist();
      await render();
      toast("已撤回上次评分。");
      break;
    }
    case "skipCard":
      state.flashSession.index++;
      flashBack = false;
      await persist();
      await render();
      break;
    case "chapterCards":
      await startCards(
        "关联",
        content.cards.filter((c) => (c.chapterIds || []).includes(arg)).map((c) => c.id),
      );
      break;
    case "copyCard": {
      const source = allCards().find((c) => c.id === arg);
      const c = isRichCard(source)
        ? { front: { question: source.front.prompt, ...(source.front.code ? { code: source.front.code } : {}) }, back: { answer: source.back.answer, explanation: "" }, tags: [source.typeLabel, ...(source.interviewTier ? [source.interviewTier] : [])] }
        : JSON.parse(JSON.stringify(source));
      c.id = "user-" + Date.now();
      state.userCards.push(c);
      await persist();
      navigate("/card-edit/" + c.id);
      break;
    }
    case "deleteCard":
      if (await confirmDialog({ title: "删除这张个人闪卡？", message: "会同时删除它的复习计划和收藏，删除后无法撤销。", confirmLabel: "删除" })) {
        state.userCards = state.userCards.filter((c) => c.id !== arg);
        delete state.reviews[arg];
        state.favorites = state.favorites.filter((id) => id !== arg);
        await persist();
        navigate("/my-cards");
      }
      break;
    case "labDataView":
      labDataView = arg;
      await render();
      break;
    case "labTab":
      labTab = arg;
      await render();
      break;
    case "runLab":
      await executeLab(labCode());
      break;
    case "addQuery": {
      const input = document.querySelector("#sql-editor");
      if (input) input.disabled = true;
      const workspace = labWorkspace();
      const number = ++workspace.counter;
      const id = "query" + number;
      workspace.tabs.push({ id, title: "查询 " + number });
      workspace.active = id;
      state.drafts[labDraftId()] = { code: "" };
      lastResult = null;
      labTab = "代码";
      await persist();
      await render();
      break;
    }
    case "switchQuery": {
      const input = document.querySelector("#sql-editor");
      if (input) input.disabled = true;
      labWorkspace().active = arg;
      lastResult = labResults.get(labDraftId()) || null;
      labTab = "代码";
      await persist();
      await render();
      break;
    }
    case "closeQuery": {
      const workspace = labWorkspace();
      if (workspace.tabs.length === 1) break;
      const key = "lab:" + currentLab + ":" + arg;
      if (
        state.drafts[key]?.code?.trim() &&
        !(await confirmDialog({ title: "关闭查询标签？", message: "标签里的草稿会一并删除，无法撤销。", confirmLabel: "关闭并删除" }))
      )
        break;
      workspace.tabs = workspace.tabs.filter((tab) => tab.id !== arg);
      delete state.drafts[key];
      labResults.delete(key);
      if (workspace.active === arg) workspace.active = workspace.tabs[0].id;
      lastResult = labResults.get(labDraftId()) || null;
      await persist();
      await render();
      break;
    }
    case "previewTable": {
      const previewRevision = ++tablePreviewRevision;
      const preview = element
        .closest(".lab-table")
        .querySelector(".table-preview");
      if (!preview.hidden) {
        preview.hidden = true;
        element.setAttribute("aria-expanded", "false");
        break;
      }
      element.disabled = true;
      try {
        const name = '"' + arg.replace(/"/g, '""') + '"';
        const result = await rpc("labQuery", {
          sql: `SELECT * FROM ${name} LIMIT 30`,
          writable: false,
        });
        if (!preview.isConnected || previewRevision !== tablePreviewRevision)
          break;
        const position = element.getBoundingClientRect().top;
        document.querySelectorAll(".lab-table").forEach((section) => {
          const other = section.querySelector(".table-preview");
          if (other !== preview) {
            other.hidden = true;
            section
              .querySelector('[data-action="previewTable"]')
              .setAttribute("aria-expanded", "false");
          }
        });
        preview.innerHTML = table(result.columns, result.rows);
        preview.hidden = false;
        element.setAttribute("aria-expanded", "true");
        window.scrollBy(0, element.getBoundingClientRect().top - position);
      } finally {
        element.disabled = false;
      }
      break;
    }
    case "questionLab": {
      const q = getQuestion(arg);
      navigate("/lab/" + (q.datasetId || "lesson"));
      labTab = "数据表";
      break;
    }
    case "copyDataset": {
      if (busy) return;
      const name = prompt("个人实验库名称", "我的实验库");
      if (!name?.trim()) break;
      const { bytes } = await rpc("labExport");
      const id = "data-" + Date.now();
      await putDataset({
        id,
        name: name.trim(),
        bytes,
        createdAt: now().toISOString(),
      });
      personal = await datasets();
      labInfo = null;
      navigate("/lab/" + id);
      toast("已复制为个人实验库。");
      break;
    }
    case "deleteDataset":
      if (await confirmDialog({ title: "删除这个个人数据库？", message: "其中的表和数据都会被删除，无法撤销。", confirmLabel: "删除" })) {
        await deleteDataset(arg);
        if (currentLab === arg) {
          currentLab = "lesson";
          labInfo = null;
        }
        personal = await datasets();
        await render();
      }
      break;
    case "labHistory": {
      const historyItems = state.history.filter(
        (h) => h.dataset === currentLab,
      );
      shell(
        "查询历史",
        historyItems.length
          ? historyItems
              .map((h) =>
                button(
                  `<div class="grow"><small>${e(new Date(h.time).toLocaleString("zh-CN"))}</small>${code(h.sql)}</div>`,
                  "useHistory",
                  h.id,
                  "link-row",
                ),
              )
              .join("")
          : empty("暂无查询记录"),
        "home",
        true,
      );
      break;
    }
    case "useHistory": {
      const h = state.history.find((h) => h.id === arg);
      state.drafts[labDraftId()] = { code: h.sql };
      await persist();
      labTab = "代码";
      await render();
      break;
    }
    case "exportResult": {
      const safe = (v) => {
        const s = v === null ? "" : String(v);
        return typeof v === "string" && /^[=+@\-\t\r]/.test(s) ? "'" + s : s;
      };
      const csv = [lastResult.columns, ...lastResult.rows]
        .map((row) =>
          row.map((v) => '"' + safe(v).replace(/"/g, '""') + '"').join(","),
        )
        .join("\r\n");
      await exportFile("数屿SQL-查询结果.csv", "\ufeff" + csv, "text/csv");
      break;
    }
    case "confirmImport": {
      if (!importData || busy) return;
      busy = true;
      document.querySelectorAll(".lab-table").forEach((section) => {
        const other = section.querySelector(".table-preview");
        if (other !== preview) {
          other.hidden = true;
          section
            .querySelector('[data-action="previewTable"]')
            .setAttribute("aria-expanded", "false");
        }
      });
      element.disabled = true;
      try {
        const name = document.querySelector("#import-name").value.trim();
        if (!name) throw new Error("请填写数据集名称。");
        const result = await rpc("import", { data: importData }, 30000);
        const id = "data-" + Date.now();
        await putDataset({
          id,
          name,
          bytes: result.bytes,
          createdAt: now().toISOString(),
        });
        personal = await datasets();
        labInfo = null;
        importData = null;
        labTab = "数据表";
        navigate("/lab/" + id);
        toast("导入成功，已保存为个人数据库。");
      } finally {
        busy = false;
        element.disabled = false;
      }
      break;
    }
    case "exportBackup": {
      element.disabled = true;
      try {
        const personalData = await datasets();
        const payload = {
          state,
          datasets: personalData.map((d) => ({
            ...d,
            bytes: bytesToBase64(d.bytes),
          })),
        };
        const body = JSON.stringify(payload);
        const backup = {
          format: "sql-shouji-backup",
          version: 1,
          createdAt: now().toISOString(),
          sha256: await digest(body),
          payload: body,
        };
        await exportFile(
          "数屿SQL-备份-" + today() + ".json",
          JSON.stringify(backup),
        );
        state.lastBackupExportAt = now().toISOString();
        await persist();
      } finally {
        element.disabled = false;
      }
      break;
    }
    case "restoreBackup": {
      if (!pendingBackup) break;
      if (
        arg === "replace" &&
        !(await confirmDialog({ title: "覆盖当前学习记录？", message: "覆盖后无法撤销；个人数据集按 ID 合并。请先导出当前备份。", confirmLabel: "覆盖" }))
      )
        break;
      migrateLessonBookmarks(pendingBackup.state, content.curriculumMigration);
      const candidate =
        arg === "replace"
          ? pendingBackup.state
          : mergeState(state, pendingBackup.state);
      const next = {
        ...defaults(),
        ...candidate,
        settings: { ...defaults().settings, ...candidate.settings },
      };
      const existing = await datasets();
      const list = pendingBackup.datasets.filter(
        (d) => !existing.some((x) => x.id === d.id),
      );
      await restoreAll(next, list);
      state = next;
      pendingBackup = null;
      personal = await datasets();
      labInfo = null;
      await render();
      toast("备份恢复完成。");
      break;
    }
    case "checkUpdate":
      await checkUpdate();
      break;
    case "downloadUpdate":
      if (window.AndroidUpdates) window.AndroidUpdates.download();
      else toast("请在安卓应用中下载安装更新。");
      break;
    case "installUpdate":
      if (window.AndroidUpdates) window.AndroidUpdates.install();
      else toast("请在安卓应用中安装更新。");
      break;
    case "checkResources": {
      if (busy) return;
      busy = true;
      element.disabled = true;
      const target = document.querySelector("#resource-progress");
      let check;
      try {
        const manifest = await fetch("resources.json").then((r) => r.json());
        let checked = 0;
        let bytes = 0;
        for (const entry of manifest.files) {
          target.textContent = `正在核验 ${++checked} / ${manifest.files.length} · ${entry.path}`;
          const response = await fetch(entry.path);
          if (!response.ok) throw new Error("缺少 " + entry.path);
          const data = await response.arrayBuffer();
          if (
            data.byteLength !== entry.bytes ||
            (await digest(data)) !== entry.sha256
          )
            throw new Error("资源校验失败 " + entry.path);
          bytes += data.byteLength;
        }
        const result = await rpc("selftest");
        if (result.rows[0][0] !== 5) throw new Error("SQL 引擎自检失败");
        check = {
          pass: true,
          time: now().toISOString(),
          files: checked,
          bytes,
          sqliteVersion: result.version,
        };
      } catch (error) {
        check = {
          pass: false,
          time: now().toISOString(),
          message: error.message,
        };
      } finally {
        busy = false;
        element.disabled = false;
      }
      state.resourceCheck = check;
      await persist();
      await render();
      toast(check.pass ? "全部资源与执行引擎检查通过。" : check.message);
      break;
    }
  }
}
app.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  // 整张闪卡点击翻面，但卡片里本来就能点的东西（展开/收起、链接、按钮、输入框）和选中文字时的点击不能触发翻面。
  if (element.classList.contains("fc-tap")) {
    const inner = event.target.closest("summary, details, a, button, input, textarea, select, label");
    if (inner && inner !== element && element.contains(inner)) return;
    if (window.getSelection?.().toString()) return;
  }
  handleAction(element.dataset.action, element.dataset.arg, element).catch(
    (error) => {
      busy = false;
      toast(error.message);
    },
  );
});
let saveTimer;
function saveEditorDraft(input) {
  state.drafts[input.dataset.id] = {
    ...state.drafts[input.dataset.id],
    code: input.value,
    cursor: input.selectionStart,
    ...(getQuestion(input.dataset.id) ? { executionMode: getQuestion(input.dataset.id).executionMode, gradingRevision: getQuestion(input.dataset.id).gradingRevision, hints, answerShown } : {}),
  };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => persist().catch((error) => toast("保存失败 " + error.message)),
    150,
  );
}
app.addEventListener("focusin", (event) => {
  if (event.target.id !== "sql-editor" || !route().startsWith("/question/") || !state.settings.customKeyboard) return;
  const input = event.target;
  questionKeyboard = true;
  const keyboard = input.closest(".editor-workspace")?.querySelector(".keyboard-wrap");
  if (!keyboard) return;
  keyboard.classList.remove("hidden");
  document.body.classList.add("has-sql-keyboard");
  applyKeyboardHeight();
  requestAnimationFrame(() => {
    if (document.activeElement !== input || input.closest(".fullscreen")) return;
    const availableBottom = keyboard.getBoundingClientRect().top - 8;
    const editor = input.getBoundingClientRect();
    const covered = editor.top + Math.min(editor.height, 96) - availableBottom;
    if (covered > 0) window.scrollBy(0, covered);
  });
});
app.addEventListener("editorchange", (event) => saveEditorDraft(event.target));
app.addEventListener("input", (event) => {
  const input = event.target;
  resizeTextField(input);
  if (input.dataset.setting) updateSettingsPreview();
  if (input.id === "sql-editor") {
    return;
  } else if (input.id === "note") {
    state.notes[lessonNoteKey(content.curriculumMigration, input.dataset.id)] = input.value;
    const status = document.querySelector("#note-status");
    if (status) status.textContent = "";
  }
  else if (input.id === "search" || input.id === "card-search") {
    if (input.id === "card-search") {
      cardSearch = input.value;
      cardBrowseLimit = 40;
    } else {
      search = input.value;
    }
    const inputId = input.id;
    const position = input.selectionStart;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      render().then(() => {
        const searchBox = document.getElementById(inputId);
        searchBox?.focus();
        searchBox?.setSelectionRange(position, position);
      });
    }, 150);
    return;
  } else return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => persist().catch((error) => toast("保存失败 " + error.message)),
    150,
  );
});
app.addEventListener("change", async (event) => {
  const input = event.target;
  try {
    if (input.id === "card-chapter") cardChapter = input.value;
    if (input.dataset.filter) {
      questionFilters[input.dataset.filter] = input.value;
      await render();
    }
    if (input.dataset.setting) {
      const key = input.dataset.setting;
      let value =
        input.type === "checkbox" ? input.checked : Number(input.value);
      if (
        input.type === "number" &&
        (!Number.isFinite(value) ||
          value < Number(input.min) ||
          value > Number(input.max))
      ) {
        toast("请输入 " + input.min + " 至 " + input.max + " 的数字。");
        await render();
        return;
      }
      state.settings[key] = value;
      await persist();
      toast("设置已保存。");
    }
    if (input.id === "lab-dataset") {
      lastResult = null;
      labInfo = null;
      navigate("/lab/" + input.value);
    }
    if (input.id === "dataset-file") {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 30 * 1024 * 1024)
        throw new Error("文件超过 30 MB，请拆分后导入。");
      const extension = file.name.split(".").pop().toLowerCase();
      const buffer = await file.arrayBuffer();
      importFileName = file.name;
      importName = file.name.replace(/\.[^.]+$/, "");
      if (["sqlite", "db"].includes(extension)) {
        if (new TextDecoder().decode(buffer.slice(0, 15)) !== "SQLite format 3")
          throw new Error("这不是有效的 SQLite 数据库。");
        importData = { bytes: new Uint8Array(buffer) };
      } else if (extension === "sql") {
        importData = { sql: new TextDecoder().decode(buffer) };
      } else if (extension === "json") {
        const rows = JSON.parse(new TextDecoder().decode(buffer));
        if (
          !Array.isArray(rows) ||
          !rows.length ||
          rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
        )
          throw new Error("JSON 必须是非空对象数组。");
        const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        importData = normalizeImport(
          columns,
          rows.map((r) => columns.map((c) => r[c] ?? null)),
        );
      } else {
        const book = XLSX.read(buffer, {
          type: "array",
          codepage: 65001,
          cellDates: false,
        });
        const sheets = book.SheetNames.map((name) => ({
          name,
          data: XLSX.utils.sheet_to_json(book.Sheets[name], {
            header: 1,
            defval: null,
            raw: true,
          }),
        }));
        if (!sheets[0]?.data.length)
          throw new Error("文件中没有可导入的数据。");
        importData = {
          ...normalizeImport(sheets[0].data[0], sheets[0].data.slice(1)),
          sheets,
        };
      }
      await render();
    }
    if (input.id === "import-sheet") {
      const sheets = importData.sheets;
      const index = Number(input.value);
      importData = {
        ...normalizeImport(sheets[index].data[0], sheets[index].data.slice(1)),
        sheets,
      };
      document.querySelector("#import-content .import-preview").innerHTML =
        table(importData.columns, importData.rows, 8);
    }
    if (input.id === "backup-file") {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 220 * 1024 * 1024)
        throw new Error("备份文件超过支持的大小。");
      const backup = JSON.parse(await file.text());
      if (
        backup.format !== "sql-shouji-backup" ||
        backup.version !== 1 ||
        typeof backup.payload !== "string" ||
        (await digest(backup.payload)) !== backup.sha256
      )
        throw new Error("备份格式或 SHA-256 校验失败。");
      const payload = JSON.parse(backup.payload);
      validateState(payload.state);
      if (!Array.isArray(payload.datasets))
        throw new Error("备份数据集格式错误。");
      const restored = payload.datasets.map((d) => {
        if (
          !d.id?.startsWith("data-") ||
          typeof d.name !== "string" ||
          typeof d.bytes !== "string"
        )
          throw new Error("个人数据库信息无效。");
        const bytes = base64ToBytes(d.bytes);
        if (new TextDecoder().decode(bytes.slice(0, 15)) !== "SQLite format 3")
          throw new Error("备份中包含损坏的数据库。");
        return { ...d, bytes };
      });
      pendingBackup = { state: payload.state, datasets: restored };
      document.querySelector("#backup-preview").innerHTML =
        `<div class="notice success">文件校验通过\n${payload.state.completed.length} 个已完成知识点\n${payload.state.attempts.length} 次作答\n${restored.length} 个个人数据库</div><div class="actions">${button("合并记录", "restoreBackup", "merge", "primary")}${button("覆盖记录", "restoreBackup", "replace", "outline")}</div>`;
    }
  } catch (error) {
    pendingBackup = null;
    toast(error.message);
  }
});
function normalizeImport(columns, rows) {
  if (!columns.length || columns.length > 100)
    throw new Error("导入需包含 1 至 100 个字段。");
  const names = columns.map((c, i) => String(c ?? "column_" + (i + 1)).trim());
  if (names.some((n) => !n) || new Set(names).size !== names.length)
    throw new Error("字段名为空或重复，请修改表头后重试。");
  if (rows.length > 100000) throw new Error("导入最多支持 100000 行。");
  const values = rows.map((row) =>
    names.map((_, i) => {
      const v = row[i] ?? null;
      if (v !== null && !["string", "number", "boolean"].includes(typeof v))
        throw new Error("字段仅支持文本、数值、布尔和 null。");
      return typeof v === "boolean" ? Number(v) : v;
    }),
  );
  return { columns: names, rows: values };
}
app.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id !== "card-form") return;
  try {
    const id = event.target.dataset.id;
    const front = document.querySelector("#card-front").value.trim(),
      back = document.querySelector("#card-back").value.trim();
    if (!front || !back) throw new Error("请填写正面问题和背面答案。");
    const card = {
      id: id === "new" ? "user-" + Date.now() : id,
      type: "个人笔记",
      front: { question: front },
      back: {
        answer: back,
        explanation: document.querySelector("#card-explanation").value.trim(),
      },
      tags: document
        .querySelector("#card-tags")
        .value.split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      updatedAt: now().toISOString(),
    };
    state.userCards = [...state.userCards.filter((c) => c.id !== id), card];
    await persist();
    navigate("/my-cards");
    toast("个人闪卡已保存。");
  } catch (error) {
    toast(error.message);
  }
});
window.addEventListener("hashchange", async () => {
  document.body.classList.remove("editor-is-fullscreen");
  const path = route();
  const position = listPositions.get(path);
  if (position) search = position.search;
  await render();
  if (route() === path) window.scrollTo(0, position?.scroll || 0);
});
window.addEventListener("resize", () => { resizeTextFields(); applyKeyboardHeight(); document.querySelector("#sql-editor")?._editor?.sync(); });
const textFieldObserver = new ResizeObserver((entries) => {
  const width = entries[0].contentRect.width;
  if (textFieldObserver.lastWidth === width) return;
  textFieldObserver.lastWidth = width;
  resizeTextFields();
  document.querySelector("#sql-editor")?._editor?.sync();
});
textFieldObserver.observe(app);
window.addEventListener("pagehide", () => persist());
window.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
});
window.onNativeBack = () => {
  if (closeTopLayer()) return true;
  const diagram = document.querySelector(".erd-fullscreen");
  if (diagram) {
    diagram.querySelector('[data-erd-action="expand"]').click();
    return true;
  }
  const fullscreen = document.querySelector(".editor-workspace.fullscreen");
  if (fullscreen) {
    fullscreen.querySelector('[data-action="editorFullscreen"]').click();
    return true;
  }
  if (route() === "/") return false;
  history.back();
  return true;
};
window.onNativePause = () => persist();
let lastInteraction = Date.now();
let clockStarted = Date.now();
for (const event of ["pointerdown", "keydown", "input"])
  document.addEventListener(
    event,
    () => {
      lastInteraction = Date.now();
    },
    { passive: true },
  );
function recordStudyTime() {
  const time = Date.now();
  if (state && !document.hidden && time - lastInteraction < 60000) {
    const elapsed = Math.min(10, Math.max(0, (time - clockStarted) / 1000));
    state.studySeconds = (state.studySeconds || 0) + elapsed;
    if (elapsed > 0) state.studyDays[today()] = true;
  }
  clockStarted = time;
}
setInterval(() => {
  recordStudyTime();
  if (state) persist().catch(() => {});
}, 10000);
document.addEventListener("visibilitychange", () => {
  clockStarted = Date.now();
  lastInteraction = Date.now();
});
async function boot() {
  try {
    [content, dbManifest, state] = await Promise.all([
      fetch("content.json").then((r) => r.json()),
      fetch("databases.json").then((r) => r.json()),
      openStore(),
    ]);
    const migrated = migrateLessonBookmarks(state, content.curriculumMigration);
    if (state.contentVersion !== content.contentVersion || migrated) {
      state.contentVersion = content.contentVersion;
      state.resourceCheck = null;
      await persist();
    }
    applyBodyFont();
    personal = await datasets();
    if (window.AndroidUpdates) {
      try {
        nativeVersion = JSON.parse(window.AndroidUpdates.getInfo());
        if (nativeVersion.ready)
          updateState = {
            status: "ready",
            message: "下载与校验完成",
            progress: 100,
            release: nativeVersion.release,
          };
      } catch {}
    }
    startWorker();
    await rpc("selftest");
    await render();
  } catch (error) {
    app.innerHTML = `<main class="page"><h1>无法打开本地学习资源</h1><div class="notice error">${e(error.message)}</div><p>请重新打开应用，或使用完整安装包更新。</p></main>`;
  }
}
boot();

function keyboardHeightLimit() {
  return Math.max(150, Math.min(520, Math.floor(window.innerHeight * 0.62)));
}
function applyKeyboardHeight() {
  const height = Math.max(150, Math.min(keyboardHeightLimit(), Number(state?.settings.keyboardHeight) || 240));
  document.documentElement.style.setProperty("--sql-keyboard-height", height + "px");
  const handle = document.querySelector(".keyboard-resize");
  handle?.setAttribute("aria-valuenow", String(height));
  handle?.setAttribute("aria-valuemax", String(keyboardHeightLimit()));
  return height;
}
function mountKeyboardResize() {
  const handle = document.querySelector(".keyboard-resize");
  if (!handle) return;
  applyKeyboardHeight();
  let drag = null;
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { y: event.clientY, height: applyKeyboardHeight() };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    state.settings.keyboardHeight = Math.max(150, Math.min(keyboardHeightLimit(), Math.round(drag.height + drag.y - event.clientY)));
    applyKeyboardHeight();
  });
  const finish = async () => {
    if (!drag) return;
    drag = null;
    await persist();
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
  handle.addEventListener("keydown", async (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === "Home" ? 150 : event.key === "End" ? keyboardHeightLimit() : applyKeyboardHeight() + (event.key === "ArrowUp" ? 20 : -20);
    state.settings.keyboardHeight = Math.max(150, Math.min(keyboardHeightLimit(), target));
    applyKeyboardHeight();
    await persist();
  });
}

// ===== 练习题作答页：题目区独立滚动 + 可拖动分隔条 =====
const QUIZ_SPLITTER = 24, QUIZ_MIN_TOP = 72, QUIZ_MIN_BOTTOM = 170;
function captureQuizScroll() {
  document.querySelectorAll(".quiz-pane").forEach((pane) => { if (!pane.hidden) quizScroll[pane.dataset.pane] = pane.scrollTop; });
}
function restoreQuizScroll() {
  document.querySelectorAll(".quiz-pane").forEach((pane) => { pane.scrollTop = quizScroll[pane.dataset.pane] || 0; });
}
async function loadQuizTables(retry = false) {
  const pane = document.querySelector('.quiz-pane[data-pane="数据表"]');
  if (!pane) return;
  const pending = pane.querySelector(".quiz-tables-pending") || (retry || pane.querySelector(".notice.error") ? pane : null);
  if (!pending) return;
  const q = getQuestion(route().split("/")[2]);
  if (!q) return;
  pane.innerHTML = '<p class="muted quiz-tables-pending">正在加载本题的数据表…</p>';
  try {
    const tables = await questionTables(q);
    pane.innerHTML = tables.length ? renderTables(tables, false) : empty("暂无公开数据表");
  } catch (error) {
    pane.innerHTML = `<div class="notice error">${e(error.message)}</div><button class="outline" data-action="quizTab" data-arg="数据表" data-retry="1">重新加载数据表</button>`;
  }
  pane.scrollTop = quizScroll["数据表"] || 0;
}
function quizRatio() {
  return Math.max(0.15, Math.min(0.75, Number(state?.settings.quizSplit) || 0.4));
}
function layoutQuiz() {
  const box = document.querySelector(".quiz-split");
  if (!box) return;
  if (box.classList.contains("expanded")) { box.style.height = ""; syncStems(); return; } // 展开全文：整页一起滚动
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight;
  const top = box.getBoundingClientRect().top + window.scrollY;
  const keyboard = document.body.classList.contains("has-sql-keyboard") ? applyKeyboardHeight() : 0;
  const total = Math.max(QUIZ_MIN_TOP + QUIZ_MIN_BOTTOM + QUIZ_SPLITTER, Math.floor(height - top - keyboard - 8));
  box.style.height = total + "px";
  const room = total - QUIZ_SPLITTER;
  // 键盘弹出时可视高度变小：题目区按比例缩小，但至少留出 72px 回看题目、170px 编辑代码
  // 可视高度很小（小屏手机或键盘弹出）：题目区上限 30%，编辑区至少 230px，保证输入位置不被遮挡
  const compact = height < 620;
  const minBottom = compact ? 230 : QUIZ_MIN_BOTTOM;
  const wanted = Math.round(room * (compact ? Math.min(quizRatio(), 0.3) : quizRatio()));
  const topHeight = Math.max(QUIZ_MIN_TOP, Math.min(room - minBottom, wanted));
  box.style.setProperty("--quiz-top", topHeight + "px");
  box.style.setProperty("--quiz-bottom", room - topHeight + "px");
  const handle = box.querySelector(".quiz-splitter");
  handle?.setAttribute("aria-valuenow", String(Math.round(quizRatio() * 100)));
  syncStems();
}
function mountQuizSplit() {
  const box = document.querySelector(".quiz-split");
  if (!box) return;
  box.closest(".page")?.classList.add("quiz-page");
  if (quizExpanded) { box.classList.add("expanded"); box.closest(".page")?.classList.add("quiz-expanded"); } // 重绘（运行、提交等）后保持展开状态
  restoreQuizScroll();
  layoutQuiz();
  if (quizTab === "数据表") loadQuizTables();
  const handle = box.querySelector(".quiz-splitter");
  let drag = null;
  const setRatio = (value) => {
    state.settings.quizSplit = Math.round(Math.max(0.15, Math.min(0.75, value)) * 1000) / 1000;
    layoutQuiz();
  };
  handle.addEventListener("pointerdown", (event) => {
    drag = { y: event.clientY, top: box.querySelector(".quiz-top").getBoundingClientRect().height, room: box.getBoundingClientRect().height - QUIZ_SPLITTER };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (drag) setRatio((drag.top + event.clientY - drag.y) / drag.room);
  });
  const finish = async () => {
    if (!drag) return;
    drag = null;
    await persist();
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("lostpointercapture", finish);
  handle.addEventListener("keydown", async (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setRatio(event.key === "Home" ? 0.15 : event.key === "End" ? 0.75 : quizRatio() + (event.key === "ArrowDown" ? 0.05 : -0.05));
    await persist();
  });
}
window.addEventListener("resize", () => requestAnimationFrame(layoutQuiz));
window.visualViewport?.addEventListener("resize", () => requestAnimationFrame(layoutQuiz));
new MutationObserver(() => requestAnimationFrame(layoutQuiz)).observe(document.body, { attributes: true, attributeFilter: ["class"] });
