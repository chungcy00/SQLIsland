"""里程碑岛：由参考图描摹重建的矢量 SVG（岛体 island + 12 块地块 + 旗子）。
依赖（在独立 venv 中安装）：vtracer numpy pillow scipy resvg-py。
参考图：A 空岛（几何基准）、C 点亮地块（地块形状与栅格）、D 旗子。用法：
  python build_milestone.py <A.png> <C.png> <D.png> <输出目录>"""
import sys, os, re, io
import numpy as np, vtracer
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure, morphology
A_PNG, C_PNG, D_PNG, OUT = sys.argv[1:5]
TMP = os.path.join(OUT, "_work"); os.makedirs(TMP, exist_ok=True)
W, H = 1536, 1024
TRACE = dict(colormode="color", hierarchical="stacked", mode="spline", corner_threshold=60, length_threshold=4.0, max_iterations=10, splice_threshold=45, path_precision=1)

# 1) 岛体：把过淡的等高线增强后描摹（浅色线在原图里太淡，直接描摹会丢）
A = np.array(Image.open(A_PNG).convert("RGB")).astype(int)
nonwhite = A.min(2) < 247
body = ndi.binary_dilation(ndi.binary_opening(nonwhite, structure=np.ones((3, 3)), iterations=5), iterations=3)
rings = ndi.binary_opening(nonwhite & ~body, structure=np.ones((2, 2)))
P = np.full_like(A, 255); P[nonwhite & ~rings] = A[nonwhite & ~rings]   # 细线（等高线/水波）另行用描边重建，这里先去掉
Image.fromarray(P.astype("uint8")).save(os.path.join(TMP, "A_P.png"))
vtracer.convert_image_to_svg_py(os.path.join(TMP, "A_P.png"), os.path.join(TMP, "A_P.svg"), filter_speckle=5, color_precision=6, layer_difference=18, **{**TRACE, "path_precision": 0})

def paths(svg):
    out = []
    for m in re.finditer(r'<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"/>', svg):
        out.append((m.group(1), m.group(2).upper(), float(m.group(3)), float(m.group(4))))
    return out
def lum(h): r, g, b = int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16); return (r + g + b) / 3
island = []
for d, fill, tx, ty in paths(open(os.path.join(TMP, "A_P.svg")).read()):
    if lum(fill) > 247: continue                      # 去掉白色背景块
    t = f' transform="translate({tx:g} {ty:g})"' if (tx or ty) else ""
    island.append(f'<path d="{d}" fill="{fill}"{t}/>')

# 1b) 等高线与水波：骨架化后用平滑描边重建（保持细线的形状与淡色）
skel = morphology.skeletonize(rings)
dt = ndi.distance_transform_edt(rings)
pts = set(zip(*np.where(skel)))
NB = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
def nbrs(p): return [(p[0] + dy, p[1] + dx) for dy, dx in NB if (p[0] + dy, p[1] + dx) in pts]
def smooth_d(pl):
    q = measure.approximate_polygon(np.array(pl, float), 2.0)
    if len(q) < 3: return None
    d = f"M{q[0][1]:.0f} {q[0][0]:.0f}"
    for i in range(len(q) - 1):
        p0, p1, p2, p3 = q[max(i - 1, 0)], q[i], q[i + 1], q[min(i + 2, len(q) - 1)]
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        d += f"C{c1[1]:.0f} {c1[0]:.0f} {c2[1]:.0f} {c2[0]:.0f} {p2[1]:.0f} {p2[0]:.0f}"
    return d
strokes = []
while pts:
    ends = [p for p in pts if len(nbrs(p)) == 1]
    cur = ends[0] if ends else next(iter(pts)); path = [cur]; pts.discard(cur)
    while True:
        nx = nbrs(cur)
        if not nx: break
        cur = nx[0]; path.append(cur); pts.discard(cur)
    if len(path) < 25: continue
    ys, xs = zip(*path); col = A[ys, xs].mean(0)
    wd = float(np.clip(2 * dt[ys, xs].mean(), 3, 7))
    d = smooth_d(path)
    if d: strokes.append((d, "#%02X%02X%02X" % tuple(int(round(v)) for v in col), wd))
ring_svg = [f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w:.1f}" stroke-linecap="round" stroke-linejoin="round"/>' for d, c, w in strokes]

# 2) 地块：用 C 的 12 块平均形状，栅格取自 C，按岛面中心平移缩放到 A
C = np.array(Image.open(C_PNG).convert("RGB")).astype(int)
dark = (abs(C[:, :, 0] - 0x3A) < 30) & (abs(C[:, :, 1] - 0x66) < 30) & (abs(C[:, :, 2] - 0x87) < 30) & (C.sum(2) < 420)
dark = ndi.binary_opening(dark, iterations=3)
lab, n = ndi.label(dark); ids = [i for i in range(1, n + 1) if (lab == i).sum() > 8000]
cent = np.array([ndi.center_of_mass(lab == i)[::-1] for i in ids])
acc = np.zeros((161, 261))
for i, (cx, cy) in zip(ids, cent):
    cx, cy = int(round(cx)), int(round(cy)); acc += (lab == i)[cy - 80:cy + 81, cx - 130:cx + 131]
proto = ndi.gaussian_filter(ndi.binary_erosion(acc / len(ids) > 0.5, iterations=2).astype(float), 2.0)   # 内缩 2px，配合 3px 描边得到原尺寸；高斯平滑去锯齿
cnt = max(measure.find_contours(np.pad(proto, 1), 0.5), key=len)
cnt = measure.approximate_polygon(cnt, 1.6)[:-1] - 1
for _ in range(2):  # Chaikin 切角，得到圆角
    nxt = []
    for a, b in zip(cnt, np.roll(cnt, -1, axis=0)):
        nxt += [0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b]
    cnt = np.array(nxt)
c0 = np.array([130.0, 80.0])
tile_d = "M" + "L".join(f"{x - c0[0]:.0f} {y - c0[1]:.0f}" for y, x in cnt) + "Z"
# 栅格：沿 e1(下右) 3 块、沿 e2(下左) 4 块。行 i=0..2 由后向前；行内 j=3..0 由左向右
p0 = cent[np.argmin(cent[:, 1])]
e1 = np.array([126.0, 56.0]); e2 = np.array([-128.0, 62.0])
order = []
for i in range(3):
    for j in (3, 2, 1, 0):
        order.append(p0 + i * e1 + j * e2)
sA = 1035 / 1078; cA, cC = np.array([764, 510]), np.array([779, 520])
tiles = []
for k, p in enumerate(order, 1):
    x, y = cA + (p - cC) * sA
    tiles.append(f'<path id="tile-{k}" class="tile" transform="translate({x:.1f} {y:.1f}) scale({sA:.3f})" d="{tile_d}" fill="#F3F8FA" stroke="#A9C2D2" stroke-width="3" stroke-linejoin="round"/>')

# 3) 旗子：描摹 D 的旗，重新着色为规范色，固定在岛面后部
D = Image.open(D_PNG).convert("RGB")
Dn = np.array(D).astype(int); ys, xs = np.where(Dn.min(2) < 200)
box = (xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7)
D.crop(box).save(os.path.join(TMP, "D_c.png"))
vtracer.convert_image_to_svg_py(os.path.join(TMP, "D_c.png"), os.path.join(TMP, "D_c.svg"), filter_speckle=4, color_precision=5, layer_difference=24, **TRACE)
flag = []
for d, fill, tx, ty in paths(open(os.path.join(TMP, "D_c.svg")).read()):
    if lum(fill) > 235: continue
    r, g, b = (int(fill[i:i + 2], 16) for i in (1, 3, 5))
    col = "#F0B94D" if (r > 180 and b < 140) else "#17293A"
    t = f' transform="translate({tx:g} {ty:g})"' if (tx or ty) else ""
    flag.append(f'<path d="{d}" fill="{col}"{t}/>')
fw, fh = box[2] - box[0], box[3] - box[1]
fs = 0.72
# 旗杆根部（原图 D 中位于裁切框下沿、水平约 1/10 处）落在最后一排地块后方
bx, by = 790, 322
flag_g = f'<g id="flag"><g transform="translate({bx - 0.09 * fw * fs:.1f} {by - fh * fs + 6:.1f}) scale({fs})">' + "".join(flag) + "</g></g>"

svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="学习里程碑岛">' \
      f'<g id="island"><g id="contours">' + "".join(ring_svg) + "</g>" + "".join(island) + "</g>" + "<g id=\"tiles\">" + "".join(tiles) + "</g>" + flag_g + "</svg>"
open(os.path.join(OUT, "milestone.svg"), "w", encoding="utf-8").write(svg)
print("ring strokes", len(ring_svg)); print("svg KB", len(svg.encode()) // 1024, "island paths", len(island), "tiles", len(tiles), "flag paths", len(flag), "flag box", fw, fh)

# 4) 动画预览页（把 SVG 内联；仅用于验证，不是正式代码）
TEST = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>里程碑岛 · 动画预览</title>
<style>
:root{--ink:#17293A;--ink2:#4A6075;--lake:#E2ECF2;--line:#CFE0EA;--pri:#38607F;color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#F2F6F9;color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC",sans-serif;padding:16px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}
h1{font-size:20px;margin:4px 0 4px}.aux{color:var(--ink2);font-size:13px;margin:0 0 12px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px}
#stage svg{display:block;width:100%;height:auto;max-width:480px;margin:0 auto}
.tile{transition:fill .12s linear,stroke .12s linear}
.tile.on{fill:#38607F;stroke:#38607F}
#flag{opacity:0;transform:translateY(34px);transition:transform .26s cubic-bezier(.2,.8,.2,1),opacity .18s linear}
#flag.up{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.tile,#flag{transition:none}}
.bar{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
button{min-height:44px;padding:0 18px;border-radius:12px;border:1.5px solid var(--pri);background:#fff;color:var(--pri);font:600 15px inherit;cursor:pointer}
button:focus-visible{outline:3px solid #F0B94D;outline-offset:2px}
#info{font-size:12.5px;color:var(--ink2)}
.ok{color:#2E6B4A;font-weight:600}
</style></head><body>
<h1>里程碑岛 · 动画预览</h1>
<p class="aux">12 块地块依次点亮（约 600ms，一次），随后旗子升起并保持最终状态。独立资源预览，未接入正式软件。</p>
<div class="card" id="stage"><!--SVG--></div>
<div class="bar"><button id="replay" type="button">重新播放</button><span id="info"></span></div>
<script>
(function(){
  var svg=document.querySelector('#stage svg'),tiles=[].slice.call(svg.querySelectorAll('.tile')),flag=svg.querySelector('#flag');
  var reduce=matchMedia('(prefers-reduced-motion: reduce)'),timers=[],STEP=28,FLAG_AT=340;
  function clear(){timers.forEach(clearTimeout);timers=[]}
  function reset(){clear();tiles.forEach(function(t){t.classList.remove('on')});flag.classList.remove('up')}
  function finalState(){clear();tiles.forEach(function(t){t.classList.add('on')});flag.classList.add('up')}
  function play(){
    if(reduce.matches){finalState();return}
    reset();void svg.getBoundingClientRect();
    tiles.forEach(function(t,i){timers.push(setTimeout(function(){t.classList.add('on')},i*STEP))});
    timers.push(setTimeout(function(){flag.classList.add('up')},FLAG_AT));
  }
  var ids=tiles.map(function(t){return t.id}),good=tiles.length===12&&ids.every(function(id,i){return id==='tile-'+(i+1)});
  document.getElementById('info').innerHTML=(good?'<span class="ok">地块 12/12，tile-1→tile-12</span>':'地块数量异常：'+tiles.length)+(reduce.matches?' · 已按系统“减少动画”直接显示最终状态':'');
  document.getElementById('replay').addEventListener('click',play);
  reduce.addEventListener&&reduce.addEventListener('change',function(){if(reduce.matches)finalState()});
  play();
})();
</script></body></html>"""
open(os.path.join(OUT, "test.html"), "w", encoding="utf-8").write(TEST.replace("<!--SVG-->", svg))
print("test.html written")
