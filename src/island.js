// 首页数据岛：使用用户提供插画的矢量重建版（resources/ASSETS/v2/illustrations/milestone/milestone.svg），
// 按学习进度点亮 12 块地块。纯函数，无统计逻辑；SVG 源由调用方传入（构建期内联）。
export const ISLAND_TILES = 12;

// lit = floor(12 × 已学完 ÷ 总数)；总数为 0 → 0；夹在 0–12；无半亮。
export function islandLitCount(done, total) {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(ISLAND_TILES, Math.max(0, Math.floor((ISLAND_TILES * done) / total)));
}

// 点亮顺序即地块编号：tile-1…12（后排自左至右、逐行向前）。亮块 fill/stroke = #38607F（主色）。
// 首页为静态：旗子保持可见，不播放动画；装饰性，不朗读。
export function islandSvg(litCount, source, className = "") {
  const lit = Math.min(ISLAND_TILES, Math.max(0, Math.floor(Number(litCount) || 0)));
  let svg = String(source || "");
  svg = svg.replace(/<svg /, `<svg class="${className}" aria-hidden="true" focusable="false" data-lit="${lit}" `);
  svg = svg.replace(/\s+role="img"/, "").replace(/\s+aria-label="[^"]*"/, "");
  for (let n = 1; n <= lit; n++) {
    svg = svg.replace(new RegExp(`<path id="tile-${n}" class="tile"([^>]*?)fill="#F3F8FA" stroke="#A9C2D2"`), `<path id="tile-${n}" class="tile on"$1fill="#38607F" stroke="#38607F"`);
  }
  return svg;
}
