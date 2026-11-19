import { lessonComplete, lessonNote, lessonNoteKey, migrateLessonBookmarks } from "./curriculum-progress.js";
import { isCurrentQuestionAttempt, questionDraft } from "./question-progress.js";
import { actionIconPaths } from "./action-icons.js";
import { fetchLatestUpdate, UPDATE_REPOSITORY } from "./updates.js";
import release from "../release.json";
import { editorBody, mountEditor, editorCommand } from "./editor.js";
import { mountErd } from "./erd.js";
import { businessErdDictionary } from "./erd-dictionary.js";
import { requirementSections, readingChunks } from "./lesson-presentation.js";
import { formatSqlForDisplay } from "./sql-format.js";
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
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  edit: "m4 16-1 5 5-1L21 7l-5-5Z M14 4l6 6",
  database:
    "M20 6c0 2-4 4-8 4s-8-2-8-4 4-4 8-4 8 2 8 4ZM4 6v12c0 2 4 4 8 4s8-2 8-4V6 M4 12c0 2 4 4 8 4s8-2 8-4",
  clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  wrong: "M5 3h14v18H5Z M9 9l6 6 M15 9l-6 6",
  play: "m8 4 13 8-13 8Z",
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
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
const actionIcon = (name) => `<svg class="icon material-icon" viewBox="0 0 24 24" aria-hidden="true">${actionIconPaths[name].map((path) => `<path d="${path}"/>`).join("")}</svg>`;
const image = (path, cls = "", alt = "") =>
  `<img class="${cls}" src="assets/${path}.png" alt="${e(alt)}">`;
const button = (label, action, arg = "", cls = "") =>
  `<button class="${cls}" data-action="${action}" data-arg="${e(arg)}">${label}</button>`;
const goButton = (label, route, cls = "") => button(label, "go", route, cls);
const code = (sql) => `<pre><code>${e(formatSqlForDisplay(sql))}</code></pre>`;
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
const empty = (title, description = "", action = "") =>
  `<div class="empty">${image("illustrations/states/state_empty")}<h3>${e(title)}</h3>${description ? `<p>${e(description)}</p>` : ""}${action}</div>`;
const linkRow = (title, description, route, ico = "book", asset = false) =>
  goButton(
    `<span class="list-icon">${asset ? image("functions/" + ico, "asset-icon") : icon(ico)}</span><div class="grow"><h3>${e(title)}</h3>${description ? `<small>${e(description)}</small>` : ""}</div>${icon("right", "chevron")}`,
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
  state.activity[today()] = (state.activity[today()] || 0) + 1;
  await persist();
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
  button(
    icon("star"),
    "favorite",
    id,
    "icon-button favorite " + (favorite(id) ? "selected" : ""),
  );
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
function shell(title, body, tab = "home", detail = false, extra = "") {
  const navigation = [
    ["home", "首页", "/"],
    ["learn", "学习", "/learn"],
    ["practice", "练习", "/practice"],
    ["flashcards", "闪卡", "/cards"],
    ["mine", "我的", "/mine"],
  ];
  app.innerHTML = `<header class="appbar">${detail ? button(icon("back"), "back", "", "icon-button") : image("brand/logo_d", "logo")}<h1>${e(title)}</h1>${extra || (!detail ? goButton(icon("settings"), "/settings", "icon-button") : "")}</header><main class="page ${detail ? "detail" : ""}">${body}</main>${detail ? "" : `<nav aria-label="主导航">${navigation.map(([key, label, path]) => goButton(`<span class="nav-icon">${image(`navigation/${key}_${tab === key ? "active" : "inactive"}`)}</span>${label}`, path, tab === key ? "active" : "")).join("")}</nav>`}`;
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
    `<section class="panel continue learning-hero"><div class="study-badge">连续学习 ${studyStreak()} 天 · 累计 ${minutes} 分钟</div><div class="learning-hero-content"><div class="grow"><h2>${e(title)}</h2><p class="hero-summary">${summary}</p></div>${image("illustrations/states/state_home_learning", "learning-hero-art")}</div><div class="hero-actions">${goButton(icon("play") + " " + (state.lastLesson ? "继续学习" : "开始学习"), "/lesson/" + next.id, "primary")}${goButton("待复习 " + dueCards().length + " 卡", "/cards", "hero-review")}</div></section>
    <div class="section-heading"><h2>快捷入口</h2></div><div class="home-shortcuts">${shortcuts.map(([label, route, asset, count]) => goButton(`<span class="list-icon">${image("functions/" + asset, "asset-icon")}</span><span class="grow"><strong>${label}</strong>${count ? `<small>${count}</small>` : ""}</span>`, route, "shortcut-tile")).join("")}</div>
    <div class="section-heading"><h2>学习路线</h2>${goButton("查看统计", "/stats")}</div><div class="stats home-progress"><div class="stat"><strong>${completedKnowledgePoints()}<small> / ${knowledgePoints().length}</small></strong><small>学完知识点</small></div><div class="stat"><strong>${stats.done}<small> / ${content.questions.length}</small></strong><small>独立完成题目</small></div><div class="stat"><strong>${studiedCards()}<small> / 200</small></strong><small>已学闪卡</small></div></div>
    <div class="home-stages">${stages.map((stage) => {
      const chapters = content.chapters.filter((c) => c.stage === stage);
      const points = chapters.flatMap((c) => c.knowledgePoints);
      const done = points.filter((k) => completedLesson(k.id)).length;
      return button(`<span class="row between"><strong>${stage}</strong>${icon("right", "chevron")}</span><small>${chapters.length} 章 · ${done} / ${points.length} 已学</small><span class="progress"><span style="width:${points.length ? done / points.length * 100 : 0}%"></span></span>`, "homeStage", stage, "home-stage");
    }).join("")}</div>
    <div class="section-heading"><h2>业务实战</h2>${goButton("全部项目", "/projects")}</div><div class="home-projects" aria-label="业务项目">${projects.map((p) => {
      const tasks = content.questions.filter((q) => q.chapterId === "ch19" && q.projectId === p[0]);
      const done = tasks.filter((q) => independentDone(q.id)).length;
      return goButton(`${image("illustrations/business/business_" + p[3], "home-project-art")}<strong>${e(p[1])}</strong><small>${done} / ${tasks.length} 项任务已完成</small>`, "/projects/" + p[0], "home-project");
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
  shell(
    "学习路线",
    `<div class="row between route-summary"><h2>体系课程</h2>${tag(completedKnowledgePoints() + " / " + knowledgePoints().length + " 已学")}</div><div class="search">${icon("search")}<input id="search" value="${e(search)}" placeholder="搜索知识点或语法" aria-label="搜索章节或知识点"></div><div class="chips stage-filters">${stages.map((stage) => button(stage, "learningStage", stage, "chip " + (view.stage === stage ? "selected" : ""))).join("")}</div><div class="chapter-list">${matching
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
            ? '<span class="point-check">' + icon("check") + '</span>'
            : '<span class="point-dot"></span>';
          return goButton(
            status + '<span class="grow">' + e(k.title) + '</span>' +
              (active ? '<small class="learning-position">上次学到</small>' : '') + icon("right", "chevron"),
            "/lesson/" + k.id,
            "knowledge-row" + (done ? " completed" : "") + (active ? " current" : ""),
          );
        }).join("");
        return `<section class="chapter-card${current ? " current-chapter" : ""}">
          <button class="chapter-toggle" data-action="toggleChapter" data-arg="${c.id}" aria-expanded="${!!expanded}" aria-controls="learn-points-${c.id}">
            <span class="chapter-number">${String(c.number).padStart(2, "0")}</span>
            <strong class="grow">${e(c.title)}${current ? '<span class="sr-only">，上次学习的章节</span>' : ''}</strong>
            <small class="chapter-count" aria-label="已学 ${learned} 个，共 ${c.knowledgePoints.length} 个知识点">${learned} / ${c.knowledgePoints.length}</small>
            ${icon("right", expanded ? "chevron expanded" : "chevron")}
          </button>
          <div class="progress chapter-progress" role="progressbar" aria-label="${e(c.title)}学习进度" aria-valuemin="0" aria-valuemax="${c.knowledgePoints.length}" aria-valuenow="${learned}"><span style="width:${learned / c.knowledgePoints.length * 100}%"></span></div>
          <div id="learn-points-${c.id}" ${expanded ? '' : 'hidden'}>${expanded ? '<p class="chapter-goal">' + e(c.objective) + '</p><div class="chapter-points">' + rows + '</div>' : ''}</div>
        </section>`;
      })
      .join("")}</div>${matching.length ? "" : empty("未找到相关内容", "", button("重置筛选", "resetLearning", "", "outline"))}`,
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
    const preview = table(t.columns, rows.slice(0, 5));
    return `<section class="source-table"><div class="row between table-heading"><h3><span class="source-table-name" title="${e(t.name)}">${e(t.name)}</span></h3><small>${rowCount} 行</small></div>${descriptions[t.name] ? `<p class="source-table-description">${teachingText(descriptions[t.name])}</p>` : ""}${preview}${expandable && rows.length > 5 ? `<details class="remaining-rows"><summary>查看其余 ${rows.length - 5} 行</summary>${table(t.columns, rows.slice(5), rows.length)}</details>` : ""}${rowCount > displayedRows ? `<small>预览前 ${displayedRows} 行</small>` : ""}</section>`;
  }).join("");
}
function lessonCode(sql) {
  const formatted = formatSqlForDisplay(sql || "");
  if (formatted.split("\n").length <= 14) return code(sql);
  return `<details class="long-code"><summary><span class="code-expand-label">展开完整 SQL</span><span class="code-collapse-label">收起 SQL</span></summary>${code(sql)}</details><div class="code-excerpt" aria-hidden="true">${code(formatted.split("\n").slice(0, 10).join("\n"))}</div>`;
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
      case "table": return `<div class="concept-comparison">${table(block.columns, block.rows)}</div>`;
      case "code": return code(block.sql);
      default: return "";
    }
  }).join("");
}
function conceptContent(k) {
  return `<div class="concept-group">${k.presentation ? renderTeachingBlocks(k.presentation.conceptBlocks) : `<p>${e(k.concept)}</p>${(k.teaching?.mergedConcepts || []).map(item => `<p>${e(item.explanation)}</p>`).join("")}`}</div>`;
}
function lessonTeaching(k) {
  if (!k.teaching) return "";
  const presentation = k.presentation;
  const method = presentation ? renderTeachingBlocks(presentation.methodBlocks) : `<p>${e(k.teaching.codeExplanation || "")}</p>`;
  return `<div class="lesson-demand"><h3>实际业务需求</h3><p>${e(presentation?.problem || k.teaching.problem)}</p></div><div class="lesson-method"><h3>查询思路讲解</h3>${method}</div>`;
}
function lessonBreakdown(k) {
  const fragments = (k.presentation?.breakdown || []).map(step => step.kind === "fragment"
    ? `<div class="code-explanation-part"><h4>${e(step.title)}</h4><small>代码片段 · 不能独立运行</small>${code(step.sql)}<p><strong>作用：</strong>${e(step.purpose)}</p><p><strong>原因：</strong>${e(step.reason)}</p></div>`
    : `<details class="lesson-checkpoint"><summary>${e(step.title)}</summary>${renderTables(step.sourceTables)}${code(step.sql)}<p>${e(step.purpose)}</p><p>${e(step.reason)}</p><h3>中间结果</h3>${table(step.result.columns, step.result.rows)}</details>`).join("");
  const steps = k.presentation ? "" : (k.teaching?.checkpoints || []).map(step =>
    `<details class="lesson-checkpoint"><summary>${e(step.label)} · <code>${e(step.name)}</code></summary>${lessonCode(step.sql)}${table(step.result.columns, step.result.rows)}</details>`
  ).join("");
  return `<div class="lesson-breakdown">${fragments ? `<div class="lesson-code-explanation"><h3>代码拆解</h3>${fragments}</div>` : ""}${steps}</div>`;
}
function lessonCompleteCode(k) {
  return `<div class="lesson-complete-code"><h3>完整代码</h3>${code(k.presentation?.completeCode.mysqlSql || k.mysqlSql)}${k.sqliteSql ? button(actionIcon("play") + " 运行兼容示例", "lessonRun", k.id, "primary full") : ""}</div>`;
}
function lessonExtensions(k) {
  return (k.presentation?.extensions || k.teaching?.mergeExamples || []).map(example =>
    `<details class="lesson-checkpoint lesson-extension"><summary>${e(example.label)}</summary>${example.sourceTables ? renderTables(example.sourceTables) : ""}${lessonCode(example.sql)}<h3>示例执行结果</h3>${table(example.result.columns, example.result.rows)}${example.explanationBlocks ? renderTeachingBlocks(example.explanationBlocks) : `<p>${e(example.explanation)}</p>`}</details>`
  ).join("");
}
function lessonExpected(k) {
  const result = k.presentation?.expectedResult || k.result;
  if (!result?.columns) return "";
  return `<div class="lesson-expected"><h3>预期查询结果</h3>${`<small>${result.totalRows ?? result.rows.length} 行 · ${result.columns.length} 列${result.totalRows > result.rows.length ? " · 展示样例" : ""}</small>`}${table(result.columns, result.rows)}<div class="lesson-result-explanation"><h3>结果解读</h3>${k.presentation ? renderTeachingBlocks(k.presentation.resultBlocks) : `<p>${e(k.teaching?.resultExplanation || "")}</p>`}</div></div>`;
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
  return `<small>本次 SQLite 兼容执行结果 · ${result.rowCount} 行${result.rowCount > shown.length ? ` · 展示前 ${shown.length} 行` : ""}</small>${table(result.columns, shown)}`;
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
    <header class="lesson-intro"><div class="question-meta">${tag(chapter.title)}${tag(k.compatibility?.status || "MySQL 教学")}<small>${position} / ${chapter.knowledgePoints.length}</small></div><h1 class="lesson-title">${e(k.title)}</h1>${goal ? `<section class="lesson-purpose" data-lesson-section="purpose"><p>能够运用本节知识完成：${e(goal)}</p></section>` : ""}</header>
    <div class="lesson-foundation"><section class="lesson-section" data-lesson-section="concept"><h2>核心概念</h2><div class="lesson-concept">${conceptContent(k)}</div>${sharedExample ? parameters : ""}</section>
    ${!sharedExample ? `<section class="lesson-section" data-lesson-section="syntax"><h2>语法</h2>${k.presentation?.syntax.purpose ? `<p class="syntax-purpose">${teachingText(k.presentation.syntax.purpose)}</p>` : ""}${lessonCode(k.syntax)}${parameters}</section>` : ""}</div>
    ${(k.executionSteps || []).length ? `<section class="lesson-section" data-lesson-section="steps"><h2>执行思路</h2><ol class="steps">${k.executionSteps.map((step, i) => `<li class="step"><b>${i + 1}</b><span>${e(step)}</span></li>`).join("")}</ol></section>` : ""}
    <section class="lesson-section" data-lesson-section="data"><h2>示例数据</h2>${renderTables(k.sourceTables, true, k.presentation?.dataDescriptions)}</section>
    <section class="lesson-section" data-lesson-section="example"><div class="section-heading example-heading"><h2>SQL 示例</h2>${button(icon("code") + " 去实验室", "lessonLab", id, "small-button")}</div>${lessonTeaching(k)}${lessonBreakdown(k)}${lessonCompleteCode(k)}${lessonExpected(k)}<div id="lesson-result" aria-live="polite">${lessonExampleResult?.id === id ? lessonResult(k, lessonExampleResult.result) : ""}</div>${lessonExtensions(k)}</section>
    <section class="lesson-section lesson-cautions"><h2>辨析与易错点</h2><div class="caution-comparison"><h3>辨析</h3><div class="caution-copy">${k.presentation ? renderTeachingBlocks(k.presentation.cautions.comparison) : cautionText(k.comparison)}</div></div>${k.commonError ? `<dl class="mistake-comparison"><div><dt>易错</dt><dd>${lessonMistake(k, "example")}</dd></div>${lessonErrorReason(k) ? `<div class="mistake-reason"><dt>原因</dt><dd>${lessonErrorReason(k)}</dd></div>` : ""}<div><dt>修正</dt><dd>${lessonMistake(k, "correction")}</dd></div></dl>` : ""}<div class="caution-reason"><h3>注意事项</h3><div class="caution-copy">${k.presentation ? renderTeachingBlocks(k.presentation.cautions.notes) : cautionText(k.notes)}</div></div></section>
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
    ${practiceChapters(list, filtered)}${filtered.length ? "" : empty("暂无匹配题目", "", button("重置筛选", "resetQuestions", "", "outline"))}`,
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
function questionRequirements(q) {
  return `<div class="requirement-sections">${requirementSections(q.requirements).map((section) => `<section><h2>${e(section.label)}</h2><div class="requirement-text">${readingChunks(section.text, true).map((chunk) => `<p>${e(chunk)}</p>`).join("")}</div></section>`).join("")}</div>`;
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
  let body = `<div class="quiz-details"><div class="question-meta">${tag(q.type)}${tag(q.difficulty)}<small>${q.id.toUpperCase()}</small></div><h1 class="quiz-title">${e(q.title.split(" · ")[0])}</h1><p class="question-location">第 ${chapter.number} 章 · ${e(chapter.title)}<span>${chapterQuestions.findIndex((item) => item.id === id) + 1} / ${chapterQuestions.length}</span></p>`;
  if (q.type === "选择") {
    body += `<p class="choice-requirements">${e(q.requirements)}</p><div class="choice-options" role="radiogroup" aria-label="答案选项">${q.options.map((o) => `<div class="choice-item">${`<button class="option ${selectedOption === o.id ? "selected" : ""}" data-action="option" data-arg="${e(o.id)}" role="radio" aria-checked="${selectedOption === o.id}"><b>${e(o.id)}</b><span>${e(o.text)}</span>${selectedOption === o.id ? icon("check") : ""}</button>`}${submitted && o.explanation ? `<p class="option-explanation ${o.id === q.correctOptionId ? "correct" : ""}">${o.id === q.correctOptionId ? icon("check") : ""}${e(o.explanation)}</p>` : ""}</div>`).join("")}</div>`;
  } else {
    body += `<div class="tabs">${["题目", "数据表"].map((t) => button(t, "quizTab", t, quizTab === t ? "selected" : "")).join("")}</div>`;
    if (quizTab === "数据表") {
      try {
        const tables = await questionTables(q);
        body += tables.length ? renderTables(tables, false) : empty("暂无公开数据表");
      } catch (error) {
        body += `<div class="notice error">${e(error.message)}</div>${button("重新加载数据表", "quizTab", "数据表", "outline")}`;
      }
    } else {
      body += `${q.context ? `<p class="question-context">${e(q.context)}</p>` : ""}${questionRequirements(q)}`;
        body += `<section class="question-code"><h2>${q.type === "代码纠错" ? "修正代码" : q.type === "代码填空" ? "补全代码" : "编写 SQL"}</h2>${q.type === "代码填空" ? `<p class="input-guidance">补全 ${e([...new Set((q.initialCode || "").match(/\{\{[^}]+\}\}/g) || [])].join("、") || "代码中的空位")}，可编辑完整 SQL。</p>` : ""}${editor(q.id, draftForQuestion(id).code ?? formatSqlForDisplay(q.initialCode ?? ""), questionKeyboard && state.settings.customKeyboard)}</section>`;
    }
  }
  body += `<section class="question-execution"><div class="actions">${q.type !== "选择" ? button(actionIcon(busy ? "stop" : "play") + (busy ? " 停止" : " 运行"), busy ? "stop" : "runQuestion", q.id, "outline") : ""}<button class="primary" data-action="submitQuestion" data-arg="${id}" ${busy ? "disabled" : ""}>${actionIcon("send")}${busy ? "执行中…" : "提交答案"}</button></div></section>`;
  if (lastResult) body += `<section class="query-output"><div class="row between table-heading"><h2>运行结果</h2><small>${lastResult.rowCount} 行${lastResult.elapsedMs ? " · " + lastResult.elapsedMs + " ms" : ""}</small></div>${table(lastResult.columns, lastResult.rows)}</section>`;
  if (feedback) {
    const title = feedback.unsupported ? "未评定" : feedback.submitted === false ? (feedback.pass ? "运行完成" : "执行失败") : feedback.pass ? "回答正确" : "答案不符";
    body += `<section class="judge-feedback" aria-live="polite"><div class="notice ${feedback.unsupported ? "warning" : feedback.pass ? "success" : "error"}"><strong>${title}</strong>${feedback.message && !(q.type === "选择" && q.options.some((option) => option.explanation === feedback.message)) ? `<p>${e(feedback.message)}</p>` : ""}${feedback.fixtures ? `<small>已检查 ${feedback.fixtures} 组独立夹具</small>` : ""}</div>${feedback.publicComparison ? `<details><summary>公开数据结果对比</summary><h3>你的结果${feedback.publicComparison.actual.rowCount != null ? ' · ' + feedback.publicComparison.actual.rowCount + ' 行' : ''}</h3>${table(feedback.publicComparison.actual.columns, feedback.publicComparison.actual.rows)}<h3>预期结果${feedback.publicComparison.expected.rowCount != null ? ' · ' + feedback.publicComparison.expected.rowCount + ' 行' : ''}</h3>${table(feedback.publicComparison.expected.columns, feedback.publicComparison.expected.rows)}${Math.max(feedback.publicComparison.actual.rowCount || 0, feedback.publicComparison.expected.rowCount || 0) > 40 ? '<small>各展示前 40 行</small>' : ''}</details>` : ""}${!answerShown && (feedback.submitted || q.type === "选择") ? `<details open><summary>答案解析</summary><p>${e(q.type === "选择" ? choiceExplanation(q) : q.explanation)}</p></details>` : ""}</section>`;
  }
  body += `<section class="answer-support"><div class="actions"><button class="outline" data-action="hint" data-arg="${id}" ${hints >= Math.min(q.hints.length, 3) ? "disabled" : ""}>${actionIcon("hint")}提示 ${Math.min(hints, 3)}/${Math.min(q.hints.length, 3)}</button><button class="outline" data-action="showAnswer" data-arg="${id}" ${answerShown ? "disabled" : ""}>${actionIcon("answer")}${answerShown ? "已查看参考答案" : "查看参考答案"}</button></div>${hints ? `<ol class="hint-list">${q.hints.slice(0, hints).map((hint, index) => `<li><small>提示 ${index + 1}</small><p>${e(hint)}</p></li>`).join("")}</ol>` : ""}${answerShown ? `<details class="reference-answer" open><summary>参考答案</summary>${q.type === "选择" ? `<p>正确选项 ${e(q.correctOptionId)}</p>` : code(q.referenceSolutions[0]?.mysqlSql || q.initialCode)}<p>${e(q.type === "选择" ? choiceExplanation(q) : q.explanation)}</p></details>` : ""}</section>`;
  body += `${sequenceButtons(sequence[position - 1], sequence[position + 1], "question")}</div>`;
  if (route() !== "/question/" + id || renderVersion !== revision) return;
  shell(q.type === "选择" ? "选择练习" : "SQL 练习", body, "practice", true, favButton(id));
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
function cardsPage() {
  const fresh = allCards().filter((c) => !state.reviews[c.id]);
  const query = cardSearch.trim().toLowerCase();
  const matching = content.cards.filter((c) => !query ||
    [c.id, c.front.question, c.back.answer, c.back.explanation, ...(c.tags || [])]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  const scheduled = ["每日到期", "新卡", "薄弱"].includes(newMode);
  shell(
    "闪卡",
    `<div class="row between route-summary"><small>200 张内置闪卡</small>${goButton("个人闪卡 " + state.userCards.length, "/my-cards", "small-button")}</div>
    <section class="panel continue card-center"><div class="row between"><div class="grow"><h2>今日复习</h2><div class="card-counts"><span><strong>${dueCards().length}</strong><small>到期</small></span><span><strong>${fresh.length}</strong><small>新卡</small></span><span><strong>${studiedCards()}<small> / 200</small></strong><small>已学内置卡</small></span></div></div>${image("illustrations/states/state_flashcard_review", "card-center-art")}</div>
    <div class="chips review-modes">${["每日到期", "新卡", "章节", "薄弱", "随机", "收藏", "自定义"].map((mode) => button(mode, "cardMode", mode, "chip " + (newMode === mode ? "selected" : ""))).join("")}</div>
    ${newMode === "章节" ? `<label class="form-field">选择章节<select id="card-chapter">${content.chapters.map((c) => `<option value="${c.id}" ${cardChapter === c.id ? "selected" : ""}>${c.number}. ${e(c.title)}</option>`).join("")}</select></label>` : ""}
    <p class="schedule-status">${scheduled ? "计入复习计划" : "自由浏览 · 不改变复习计划"}${newMode === "薄弱" ? " · 近期忘记或困难" : ""}</p>
    ${button(newMode === "每日到期" ? "开始今日复习" : "开始" + newMode + "复习", "startCards", newMode, "primary full")}${state.flashSession ? button("继续上次复习", "resumeCards", "", "tonal full") : ""}</section>
    <div class="section-heading"><h2>浏览闪卡</h2>${goButton(icon("plus") + " 新建", "/card-edit/new", "small-button")}</div>
    <div class="search">${icon("search")}<input id="card-search" value="${e(cardSearch)}" placeholder="搜索问题、答案或标签" aria-label="搜索闪卡"></div>
    <small class="card-match-count">${matching.length} 张</small>
    ${matching.slice(0, cardBrowseLimit).map((c) => `<article class="card-browser-row"><div class="row between"><small>${e(c.id.toUpperCase())} · ${e(c.type)}</small>${button("复制为个人闪卡", "copyCard", c.id, "small-button")}</div><details><summary>${e(c.front.question)}</summary><div class="card-browser-answer">${rich(c.back)}</div></details></article>`).join("")}
    ${matching.length > cardBrowseLimit ? button("加载更多闪卡", "moreCards", "", "outline full") : ""}${matching.length ? "" : empty("暂无匹配闪卡", "", button("清除搜索", "resetCardSearch", "", "outline"))}`,
    "flashcards",
  );
}
async function startCards(mode, relatedIds) {
  let list = [];
  const all = allCards();
  let scheduled = ["每日到期", "新卡", "薄弱"].includes(mode);
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
    list = content.cards.filter((c) => c.chapterId === cardChapter);
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
function reviewPage() {
  const session = state.flashSession;
  if (!session) return cardsPage();
  const card = allCards().find((c) => c.id === session.ids[session.index]);
  if (!card) {
    const count = session.ratings.length;
    shell(
      count ? "本次复习完成" : "暂无待复习卡片",
      `${image("illustrations/states/" + (count ? "state_learning_complete" : "state_empty"), "summary-illustration")}<p class="review-summary">${count ? "已复习 " + count + " 张卡片" : "当前模式没有待复习卡片"}</p><div class="actions">${goButton("返回闪卡", "/cards", "primary")}${button("浏览新卡", "startCards", "新卡", "outline")}${session.lastRating ? button("撤回上次评分", "undoRating", "", "outline") : ""}</div>`,
      "flashcards",
      true,
    );
    return;
  }
  const schedule = scheduler.repeat(
    state.reviews[card.id]
      ? hydrate(state.reviews[card.id])
      : createEmptyCard(),
    now(),
  );
  shell(
    session.mode + "复习",
    `<div class="row between"><small>${session.index + 1} / ${session.ids.length}</small><div class="row">${tag(session.scheduled ? "计入复习计划" : "自由浏览")}${session.lastRating ? button(icon("undo") + '<span class="sr-only">撤回上次评分</span>', "undoRating", "", "icon-button") : ""}</div></div><div class="progress"><span style="width:${(session.index / session.ids.length) * 100}%"></span></div><div class="row between">${tag(card.type)}${favButton(card.id)}</div><section class="flashcard ${flashBack ? "back" : ""}">${flashBack ? `${rich(card.back)}` : `<div class="question">${e(card.front.question || "")}</div>${rich(Object.fromEntries(Object.entries(card.front).filter(([k]) => k !== "question")))}`}</section>${!flashBack ? button("翻开答案", "flip", "", "primary full") : session.scheduled ? `<div class="rating">${["忘记", "困难", "记得", "熟练"].map((label, i) => button(label + `<small>${interval(schedule[i + 1].card.due)}</small>`, "rate", i + 1)).join("")}</div>` : button("下一张", "skipCard", "", "primary full")}<div class="actions">${button("跳过", "skipCard", "", "outline")}${goButton("暂停复习", "/cards", "outline")}</div>${button("复制为个人闪卡", "copyCard", card.id, "full")}`,
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
    shell(project[1], `<div class="project-intro">${image("illustrations/business/business_" + project[3], "summary-illustration")}<div><p>${e(project[2])}</p><small>金额单位为马币分</small></div></div>${grains.length ? `<p class="project-grain">分析粒度 · ${e(grains.join("、"))}</p>` : ""}${overview}${goButton(icon("database") + " 查看数据表与结构", "/lab/" + id + "-v2", "outline full")}<div class="section-heading"><h2>项目任务</h2><small>已完成 ${done} / ${qs.length}</small></div><div class="project-tasks">${questionList(qs, true)}</div>`, "practice", true);
    return;
  }
  shell(
    "业务实战",
    `<p class="page-meta">${projects.length} 个项目 · ${content.questions.filter((q) => q.chapterId === "ch19").length} 项任务</p>${projects.map((p) => goButton(`${image("illustrations/business/business_" + p[3], "project-img")}<div class="grow"><h3>${p[1]}</h3></div>${icon("right", "chevron")}`, "/projects/" + p[0], "link-row")).join("")}${goButton("第 20 章 · 跨业务综合练习", "/chapter/ch20", "tonal full")}`,
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
    goButton(icon("database"), "/datasets", "icon-button"),
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
    goButton(`<span class="list-icon">${asset ? image("functions/" + ico, "asset-icon") : icon(ico)}</span><span class="grow menu-title">${e(title)}</span>${count ? `<small class="menu-count">${e(count)}</small>` : ""}${icon("right", "chevron")}`, route, "link-row compact");
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
  shell(
    "学习统计",
    `<div class="stats"><div class="stat"><strong>${completedKnowledgePoints()}<small> / ${knowledgePoints().length}</small></strong><small>累计学完知识点</small></div><div class="stat"><strong>${stats.count}<small> / ${content.questions.length}</small></strong><small>累计作答题目</small></div><div class="stat"><strong>${streak}</strong><small>连续学习天数</small></div></div><h2>最近 7 天</h2><small>学习操作次数</small><div class="bar-chart">${days.map((d) => `<div class="bar-day"><div>${d.count}</div><div class="bar" style="height:${Math.max(2, (d.count / max) * 88)}px"></div>${d.label}</div>`).join("")}</div><h2>练习表现</h2><div class="panel"><div class="setting-row"><span>首次独立正确率</span><strong>${stats.rate === null ? "暂无数据" : stats.rate + "%"}</strong></div><div class="setting-row"><span>已独立完成</span><strong>${stats.done} 题</strong></div><div class="setting-row"><span>已完成章节</span><strong>${completed} / 20</strong></div></div><details><summary>统计口径</summary><p class="muted">学习操作包括完成知识点、提交练习和闪卡评级。学习天数包含有效阅读，学习时长从 0.2.0 版本起记录。首次独立正确率按每道已提交题目的首次作答计算，使用提示或参考答案的作答计入辅助学习。</p></details><h2>各章进度</h2>${content.chapters.map((c) => `<div style="margin-bottom:18px"><div class="row between"><small>${c.number}. ${e(c.title)}</small><small>${c.knowledgePoints.filter((k) => completedLesson(k.id)).length}/${c.knowledgePoints.length}</small></div><div class="progress" style="margin:7px 0"><span style="width:${(c.knowledgePoints.filter((k) => completedLesson(k.id)).length / c.knowledgePoints.length) * 100}%"></span></div></div>`).join("")}`,
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
    `${image("illustrations/states/state_backup_restore", "summary-illustration")}<details><summary>备份范围</summary><p class="muted">学习进度、笔记、错题历史、收藏、闪卡计划、个人卡片、草稿和个人数据库。</p></details><p class="muted">${state.lastBackupExportAt ? "上次发起导出 " + new Date(state.lastBackupExportAt).toLocaleString("zh-CN") + "，保存结果以系统提示为准。" : "尚未导出备份"}</p>${button(icon("download") + " 导出完整备份", "exportBackup", "", "primary full")}<h2>恢复备份</h2><label class="form-field">选择 数屿SQL备份文件<input type="file" id="backup-file" accept=".json"></label><div id="backup-preview"></div><p class="muted">合并时保留当前记录，相同 ID 的冲突以当前记录为准。覆盖会替换当前学习记录，需再次确认。</p>`,
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
    `<div class="update-version-card"><div class="update-phone">${icon("phone")}</div><h1>数屿SQL</h1><p class="update-version">v${e(current)}</p><small>构建 ${nativeVersion?.versionCode || release.versionCode}</small><div class="update-status ${status === "latest" || ready ? "success" : status === "error" ? "error" : ""}" role="status">${e(updateState.message)}</div>${status === "downloading" ? `<progress value="${updateState.progress}" max="100" aria-label="下载进度"></progress><small>${updateState.progress}%</small>` : ""}${available && ["available", "downloading", "ready", "permission"].includes(status) ? `<p class="new-version">新版本 v${e(available.versionName)}</p>` : ""}</div><section class="panel update-notes"><div class="row between"><h2>更新说明</h2><small>${e(available?.releaseDate || release.releaseDate)}</small></div><ul>${lines.map((line) => `<li>${e(line)}</li>`).join("")}</ul></section><div class="notice">覆盖更新会保留本地学习记录。安装由安卓系统确认。</div><div class="update-actions">${button(status === "checking" ? "正在检查…" : status === "downloading" ? "正在下载…" : "检查更新", "checkUpdate", "", "primary full")}${status === "available" ? button("下载并校验更新", "downloadUpdate", "", "tonal full") : ""}${ready ? button("安装更新", "installUpdate", "", "primary full") : ""}</div><details><summary>更新来源</summary><p class="muted">GitHub · ${UPDATE_REPOSITORY}<br>下载后核对 SHA-256、包名、版本与签名。</p></details>${!window.AndroidUpdates ? '<p class="muted">安装更新需在安卓应用中完成。</p>' : ""}`,
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
    `${image("illustrations/states/state_offline_ready", "summary-illustration")}<div class="notice ${check?.pass ? "success" : ""}">${check ? `上次检查 ${new Date(check.time).toLocaleString("zh-CN")}\n${check.pass ? "资源完整性与 SQL 引擎自检通过" : e(check.message)}` : "尚未进行完整性检查"}</div>${button("检查离线资源", "checkResources", "", "primary full")}<div id="resource-progress" class="muted" style="margin-top:12px"></div><div class="stats"><div class="stat"><strong>${content.chapters.length}</strong><small>课程章节</small></div><div class="stat"><strong>${content.questions.length}</strong><small>练习题目</small></div><div class="stat"><strong>${content.cards.length}</strong><small>内置闪卡</small></div></div><p class="muted">卸载应用或清除数据会删除个人记录，请先导出备份。</p><details><summary>检查方式</summary><p class="muted">逐项核对 SHA-256，并执行 SQL 引擎自检。</p></details>`,
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
  state.attempts.push(attempt);
  if (!ungraded) state.activity[today()] = (state.activity[today()] || 0) + 1;
  await persist();
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
      result = { pass: false, message: error.message, submitted: submit };
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
    case "completeLesson":
      if (!completedLesson(arg)) {
        if (lessonNoteKey(content.curriculumMigration, arg) === arg) state.completed.push(arg);
        else (state.consolidatedCompleted ??= []).push(arg);
        await markActivity();
        toast("已记录学习进度。");
      }
      await render();
      break;
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
    case "quizTab":
      quizTab = arg === "数据表" ? "数据表" : "题目";
      questionKeyboard = false;
      await render();
      break;
    case "hint":
      hints = Math.min(3, hints + 1);
      state.drafts[arg] = { ...draftForQuestion(arg), executionMode: getQuestion(arg).executionMode, gradingRevision: getQuestion(arg).gradingRevision, hints, answerShown };
      await persist();
      await render();
      break;
    case "showAnswer":
      answerShown = true;
      state.drafts[arg] = { ...draftForQuestion(arg), executionMode: getQuestion(arg).executionMode, gradingRevision: getQuestion(arg).gradingRevision, hints, answerShown: true };
      await persist();
      await render();
      break;
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
        content.cards.filter((c) => c.chapterId === arg).map((c) => c.id),
      );
      break;
    case "copyCard": {
      const source = allCards().find((c) => c.id === arg);
      const c = JSON.parse(JSON.stringify(source));
      c.id = "user-" + Date.now();
      state.userCards.push(c);
      await persist();
      navigate("/card-edit/" + c.id);
      break;
    }
    case "deleteCard":
      if (confirm("删除这张个人闪卡及其复习计划？")) {
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
        !confirm("关闭查询标签并删除该草稿？")
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
      if (confirm("删除这个个人数据库？此操作会删除其中的表和数据。")) {
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
        !confirm("覆盖当前学习记录？个人数据集按 ID 合并。请先导出当前备份。")
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
