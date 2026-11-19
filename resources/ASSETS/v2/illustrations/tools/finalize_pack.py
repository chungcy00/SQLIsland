"""把用户提供的插画统一为透明背景 PNG：清理半透明杂边/碎点，裁到主体，居中放入统一画布。
不重绘、不调色（RGB 不变，只处理 alpha 与画布）。用法：python3 -I finalize_pack.py
输入 final/source/，输出 final/。业务图 1:1(1024²)，其余 3:2(1200×800)，四周留白 6%。"""
import os, glob
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
D = os.path.abspath(os.path.join(os.path.dirname(__file__), "../final"))
SRC = os.path.join(D, "source")
SQ, WIDE, PAD = (1024, 1024), (1200, 800), 0.06
JOBS = {  # 输出名: (输入文件, 画布, 阈值, 最小连通面积)
 "01_brand_island": ("01_brand_island.png", WIDE, 140, 150),
 "02_business_retail_sales": ("02_business_retail_sales_v2_raw.webp", SQ, 140, 150),
 "03_business_ecommerce_customer": ("03_business_ecommerce_customer_v3_raw.webp", SQ, 140, 150),
 "04_business_inventory_management": ("04_business_inventory_management_v2_raw.webp", SQ, 140, 150),
 "05_business_procurement_data": ("05_business_procurement_data_v2_raw.webp", SQ, 140, 150),
 "06_business_financial_data": ("06_business_financial_data_v2_raw.webp", SQ, 140, 150),
 "07_business_human_resources": ("07_business_human_resources_v3_raw.webp", SQ, 140, 150),
 "08_empty_question": ("08_empty_question_v3_raw.webp", WIDE, 140, 150),
 "09_empty_magnifier": ("09_empty_magnifier_v2_raw.webp", WIDE, 140, 150),
 "10_ready_lighthouse": ("10_ready_lighthouse_v2_raw.webp", WIDE, 140, 150),
 "11_ready_anchor": ("11_ready_anchor_v2_raw.webp", WIDE, 140, 150),
 "12_milestone": ("12_milestone_v2_raw.webp", SQ, 140, 150),
 "13_encourage": ("13_encourage_v4_raw.webp", WIDE, 128, 40),
 "14_load_failed_lighthouse_off": ("14_load_failed_v3_raw.webp", WIDE, 128, 40),
}
for out, (src, (cw, ch), thr, minarea) in JOBS.items():
    im = Image.open(os.path.join(SRC, src)).convert("RGBA")
    a = np.array(im)[:, :, 3]
    m = a >= thr
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= minarea])
        m = keep
    m = ndi.binary_fill_holes(m) & True if False else m
    alpha = ndi.gaussian_filter(m.astype(np.float32), 0.7)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    rgba = np.array(im); rgba[:, :, 3] = (alpha * 255).astype(np.uint8)
    ys, xs = np.where(m)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    sub = Image.fromarray(rgba).crop(box)
    s = min(cw * (1 - 2 * PAD) / sub.width, ch * (1 - 2 * PAD) / sub.height)
    sub = sub.resize((max(1, round(sub.width * s)), max(1, round(sub.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.alpha_composite(sub, ((cw - sub.width) // 2, (ch - sub.height) // 2))
    canvas.save(os.path.join(D, out + ".png"), optimize=True)
    print(out, canvas.size, os.path.getsize(os.path.join(D, out + ".png")) // 1024, "KB", "subject", sub.size)
