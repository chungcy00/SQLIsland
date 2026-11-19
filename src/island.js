// 首页数据岛：4×3 表格地块，亮起数量对应学习进度。纯函数，无统计逻辑。
// 轮廓与几何取自 新版设计规范/预览原型/home.html；色值见 新版设计规范/DESIGN.md §5。
export const ISLAND_TILES = 12;
const OUTLINE =
  "M22 92C20 74 38 60 60 57 72 55 80 47 98 50 120 53 141 66 145 86 148 100 138 111 123 116 110 121 104 133 86 132 70 131 62 124 47 122 31 119 24 106 22 92Z";
const COLUMNS = 4;

// lit = floor(12 × 已学完 ÷ 总数)；总数为 0 → 0；夹在 0–12；无半亮。
export function islandLitCount(done, total) {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(ISLAND_TILES, Math.max(0, Math.floor((ISLAND_TILES * done) / total)));
}

// 点亮顺序：后排自左至右、逐行向前（与里程碑 tile-1…12 同序）。
export function islandSvg(litCount, className = "") {
  const lit = Math.min(ISLAND_TILES, Math.max(0, Math.floor(Number(litCount) || 0)));
  let tiles = "";
  for (let n = 0; n < ISLAND_TILES; n++) {
    const column = n % COLUMNS;
    const row = Math.floor(n / COLUMNS);
    const colors = n < lit ? 'fill="#38607F" stroke="#38607F"' : 'fill="#F3F8FA" stroke="#A9C2D2"';
    tiles += `<rect x="${-36.5 + column * 19}" y="${-27 + row * 19}" width="16" height="16" rx="3" ${colors}/>`;
  }
  return `<svg class="${className}" viewBox="0 0 160 160" aria-hidden="true" focusable="false" data-lit="${lit}">` +
    `<g fill="none" stroke="#CFE0EA" stroke-width="1.5">` +
    `<path opacity=".35" transform="translate(80 92) scale(1.26) translate(-80 -92)" d="${OUTLINE}"/>` +
    `<path opacity=".6" transform="translate(80 92) scale(1.12) translate(-80 -92)" d="${OUTLINE}"/></g>` +
    `<path d="${OUTLINE}" transform="translate(0 5)" fill="#BCCFDB"/>` +
    `<path d="${OUTLINE}" fill="#E4EEF4" stroke="#8FB1C8" stroke-width="1.75" stroke-linejoin="round"/>` +
    `<g transform="translate(80 90) scale(1 .58) rotate(45)" stroke-width="1.4">${tiles}</g>` +
    `<g stroke="#17293A" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M99 79V50" fill="none"/><path d="M99 50l17 6.500-17 6.500z" fill="#F0B94D"/></g></svg>`;
}
