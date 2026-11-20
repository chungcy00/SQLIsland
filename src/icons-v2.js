// 新版图标（B8）：ChatGPT 绘制的 49 个线性图标，构建时内联。
import back from "../resources/ASSETS/v2/icons/back.svg";
import backup from "../resources/ASSETS/v2/icons/backup.svg";
import book from "../resources/ASSETS/v2/icons/book.svg";
import card from "../resources/ASSETS/v2/icons/card.svg";
import chart from "../resources/ASSETS/v2/icons/chart.svg";
import check from "../resources/ASSETS/v2/icons/check.svg";
import clock from "../resources/ASSETS/v2/icons/clock.svg";
import close from "../resources/ASSETS/v2/icons/close.svg";
import cloud from "../resources/ASSETS/v2/icons/cloud.svg";
import code from "../resources/ASSETS/v2/icons/code.svg";
import code_lab from "../resources/ASSETS/v2/icons/code_lab.svg";
import copy from "../resources/ASSETS/v2/icons/copy.svg";
import database from "../resources/ASSETS/v2/icons/database.svg";
import dataset from "../resources/ASSETS/v2/icons/dataset.svg";
import down from "../resources/ASSETS/v2/icons/down.svg";
import download from "../resources/ASSETS/v2/icons/download.svg";
import edit from "../resources/ASSETS/v2/icons/edit.svg";
import expand from "../resources/ASSETS/v2/icons/expand.svg";
import favorites from "../resources/ASSETS/v2/icons/favorites.svg";
import filter from "../resources/ASSETS/v2/icons/filter.svg";
import flashcards_active from "../resources/ASSETS/v2/icons/flashcards_active.svg";
import flashcards_inactive from "../resources/ASSETS/v2/icons/flashcards_inactive.svg";
import flip from "../resources/ASSETS/v2/icons/flip.svg";
import home_active from "../resources/ASSETS/v2/icons/home_active.svg";
import home_inactive from "../resources/ASSETS/v2/icons/home_inactive.svg";
import keyboard from "../resources/ASSETS/v2/icons/keyboard.svg";
import learn_active from "../resources/ASSETS/v2/icons/learn_active.svg";
import learn_inactive from "../resources/ASSETS/v2/icons/learn_inactive.svg";
import mine_active from "../resources/ASSETS/v2/icons/mine_active.svg";
import mine_inactive from "../resources/ASSETS/v2/icons/mine_inactive.svg";
import offline from "../resources/ASSETS/v2/icons/offline.svg";
import phone from "../resources/ASSETS/v2/icons/phone.svg";
import play from "../resources/ASSETS/v2/icons/play.svg";
import plus from "../resources/ASSETS/v2/icons/plus.svg";
import practice_active from "../resources/ASSETS/v2/icons/practice_active.svg";
import practice_inactive from "../resources/ASSETS/v2/icons/practice_inactive.svg";
import project from "../resources/ASSETS/v2/icons/project.svg";
import redo from "../resources/ASSETS/v2/icons/redo.svg";
import reset from "../resources/ASSETS/v2/icons/reset.svg";
import right from "../resources/ASSETS/v2/icons/right.svg";
import search from "../resources/ASSETS/v2/icons/search.svg";
import settings from "../resources/ASSETS/v2/icons/settings.svg";
import shrink from "../resources/ASSETS/v2/icons/shrink.svg";
import skip from "../resources/ASSETS/v2/icons/skip.svg";
import star from "../resources/ASSETS/v2/icons/star.svg";
import stats from "../resources/ASSETS/v2/icons/stats.svg";
import undo from "../resources/ASSETS/v2/icons/undo.svg";
import wrap from "../resources/ASSETS/v2/icons/wrap.svg";
import wrongbook from "../resources/ASSETS/v2/icons/wrongbook.svg";
const raw = { back, backup, book, card, chart, check, clock, close, cloud, code, code_lab, copy, database, dataset, down, download, edit, expand, favorites, filter, flashcards_active, flashcards_inactive, flip, home_active, home_inactive, keyboard, learn_active, learn_inactive, mine_active, mine_inactive, offline, phone, play, plus, practice_active, practice_inactive, project, redo, reset, right, search, settings, shrink, skip, star, stats, undo, wrap, wrongbook };
const aliases = { wrong: "wrongbook", cards: "card" };
const cache = new Map();
function inner(name) {
  if (cache.has(name)) return cache.get(name);
  const source = raw[aliases[name] || name];
  let result = null;
  if (source) {
    result = source
      .replace(/^[\s\S]*?<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .replace(/(stroke|fill)="#38607F"/gi, '$1="currentColor"')
      .replace(/fill="#E2ECF2"/gi, 'fill="var(--icon-fill,#E2ECF2)"')
      .replace(/\s+/g, " ")
      .trim();
  }
  cache.set(name, result);
  return result;
}
export const hasIcon = (name) => !!inner(name);
export const iconSvg = (name, cls = "") =>
  `<svg class="icon v2 ${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner(name)}</svg>`;
