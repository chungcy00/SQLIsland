"""业务六图新版试验：位图配色映射 + 统一“岛底/等深线/日光点”场景骨架。
输入只读旧目录 resources/ASSETS/illustrations/business；输出写入 v2/illustrations/business（同名）。
用法：python3 -I recolor_business.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
SRC = os.path.join(ROOT, "ASSETS/illustrations/business")
OUT = os.path.join(ROOT, "ASSETS/v2/illustrations/business")
NAMES = ["retail_sales", "ecommerce_customer", "inventory_management",
         "procurement_data", "financial_data", "human_resources"]

hexrgb = lambda s: tuple(int(s[i:i+2], 16) for i in (1, 3, 5))
# 亮度 → 新版色阶（旧图为同一套蓝灰+奶油色；按亮度渐变映射可保留抗锯齿边缘）
RAMP = [(80, "#2A4A66"), (100, "#38607F"), (125, "#4F7A97"), (150, "#7FA3BB"),
        (180, "#AFCADA"), (210, "#D6E5EE"), (228, "#F2F7FA"), (238, "#FFFFFF")]
LUT_X = np.array([r[0] for r in RAMP], float)
LUT_C = np.array([hexrgb(r[1]) for r in RAMP], float)

def recolor(img):
    a = np.array(img.convert("RGBA"))
    alpha = a[..., 3]
    alpha = np.where(alpha < 128, 0, 255).astype(np.uint8)   # 去掉旧图边缘半透明杂色
    rgb = a[..., :3].astype(float)
    lum = 0.30 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]
    out = np.stack([np.interp(lum, LUT_X, LUT_C[:, k]) for k in range(3)], -1)
    res = np.dstack([out.astype(np.uint8), alpha])
    return Image.fromarray(res, "RGBA")

def crop_subject(im):
    return im.crop(im.getchannel("A").getbbox())

def skeleton(w, h, scale_ring=1.0):
    """岛底（浅湖面椭圆）+ 两圈等深线 + 日光黄小点；全部六图共用"""
    S = 3
    c = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    cx, cy = w * S / 2, h * S * 0.80
    rx, ry = w * S * 0.46, h * S * 0.115
    for k, (m, col) in enumerate([(1.22, "#DCE8EF"), (1.1, "#C9DBE5")]):
        d.ellipse([cx - rx * m, cy - ry * m, cx + rx * m, cy + ry * m], outline=hexrgb(col), width=int(1.5 * S * scale_ring))
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=hexrgb("#E2ECF2"), outline=hexrgb("#B7CBD8"), width=int(1.75 * S * scale_ring))
    # 日光黄小旗（岛右缘）：旗杆墨色 + 旗面日光黄
    fx, fy = w * S * 0.90, cy
    ph, lw = h * S * 0.17, int(1.75 * S * scale_ring * 1.6)
    d.line([fx, fy, fx, fy - ph], fill=hexrgb("#17293A"), width=lw)
    d.polygon([(fx, fy - ph), (fx + ph * 0.42, fy - ph * 0.8), (fx, fy - ph * 0.6)], fill=hexrgb("#F0B94D"))
    return c.resize((w, h), Image.LANCZOS)

def compose(subj, w, h, fit_h, bottom):
    base = skeleton(w, h)
    s = fit_h / subj.height
    sub = subj.resize((max(1, int(subj.width * s)), int(fit_h)), Image.LANCZOS)
    base.alpha_composite(sub, ((w - sub.width) // 2, int(bottom - sub.height)))
    return base

def save(im, path):
    im.quantize(colors=160, method=Image.FASTOCTREE, dither=Image.NONE).save(path, optimize=True)

if __name__ == "__main__":
    for n in NAMES:
        src = Image.open(os.path.join(SRC, f"business_{n}.png"))
        subj = crop_subject(recolor(src))
        sq = compose(subj, 1254, 1254, fit_h=1254 * 0.62 if subj.height > subj.width * 0.9 else 1254 * 0.56, bottom=1254 * 0.84)
        # 主体不超过画面约 70%：按宽度再限制
        save(sq, os.path.join(OUT, f"business_{n}.png"))
        # 3:1 条幅：主体缩小置于中心安全区
        bn = compose(subj, 1254, 418, fit_h=418 * 0.68, bottom=418 * 0.86)
        save(bn, os.path.join(OUT, f"business_{n}_banner3x1.png"))
        print(n, os.path.getsize(os.path.join(OUT, f"business_{n}.png")) // 1024, "KB")
