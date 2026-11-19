// 装饰 SVG 片段：等深线、潮线（新版设计规范/DESIGN.md §3.3）。仅用于指定位置，均为装饰（aria-hidden）。
const RING = "M-95 6C-95-30-55-62-8-60 42-58 78-30 74 8 70 44 34 70-12 68-62 66-95 42-95 6Z";
export const contourSvg = (className = "") =>
  `<svg class="${className}" viewBox="0 0 200 220" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.25"><g transform="translate(150 118)">${[0.55, 0.85, 1.2, 1.6, 2.05].map((s) => `<path d="${RING}" transform="scale(${s})"/>`).join("")}</g></svg>`;
export const tideSvg = (className = "") =>
  `<div class="${className}" aria-hidden="true"><svg viewBox="0 0 360 12" preserveAspectRatio="none" focusable="false"><path d="M0 7C22 4 41 9 66 6.5S110 3 134 6.5 182 10 210 6 262 3 291 7 338 9 360 5.5" fill="none" stroke="#D8E5EC" stroke-width="1" stroke-linecap="round" opacity=".8"/></svg></div>`;
