"""Generate 1200x630 JPEG OG cards for every post in content/blog/."""

import os
import re
import glob
import textwrap
from PIL import Image, ImageDraw, ImageFont

REPO = "/Users/jjem/Projects/ai-saas"
OUTDIR = os.path.join(REPO, "public", "blog")
W, H = 1200, 630

BG = (10, 10, 10)
GLOW_PURPLE = (168, 85, 247)
GLOW_BLUE = (96, 165, 250)
FG_PRIMARY = (250, 250, 250)
FG_MUTED = (163, 163, 163)

CATEGORY_ACCENT = {
    "ai-architecture": (168, 85, 247),
    "ai-memory": (96, 165, 250),
    "ai-productivity": (236, 72, 153),
    "security": (34, 197, 94),
    "integrations": (59, 130, 246),
    "updates": (234, 179, 8),
    "engineering": (251, 146, 60),
    "uncategorized": (163, 163, 163),
}
CATEGORY_LABEL = {
    "ai-architecture": "AI ARCHITECTURE",
    "ai-memory": "AI MEMORY",
    "ai-productivity": "AI PRODUCTIVITY",
    "security": "SECURITY",
    "integrations": "INTEGRATIONS",
    "updates": "UPDATES",
    "engineering": "ENGINEERING",
}

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG = "/System/Library/Fonts/Supplemental/Arial.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap_px(draw, text, f, max_w):
    words = text.split()
    lines = []
    cur = ""
    for wd in words:
        trial = f"{cur} {wd}".strip()
        if draw.textbbox((0, 0), trial, font=f)[2] <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def glow(size, color, radius_scale=0.7):
    """Soft radial glow rendered into a small image and scaled up (cheap blur)."""
    small = 96
    g = Image.new("RGBA", (small, small), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    cx = cy = small // 2
    r = int(small * radius_scale)
    for i in range(r, 0, -2):
        alpha = int(60 * (1 - i / r))  # fade outwards
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=color + (alpha,))
    return g.resize(size, Image.LANCZOS)


def render(slug, title, category, out_path):
    im = Image.new("RGB", (W, H), BG)

    # Corner glows
    g1 = glow((560, 560), GLOW_PURPLE, 1.0)
    im.paste(g1, (-160, -180), g1)
    g2 = glow((520, 520), GLOW_BLUE, 1.0)
    im.paste(g2, (W - 360, H - 320), g2)

    # Soft center vignette (very subtle)
    vign = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vign)
    vd.rectangle([60, 60, W - 60, H - 60], fill=255)
    vign = vign.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(120))
    # skip actual blend — flat bg + corner glows is enough

    draw = ImageDraw.Draw(im)

    safe_x = 90
    safe_top = 90

    # Category badge
    cat_label = CATEGORY_LABEL.get(category, category.upper().replace("-", " "))
    cat_color = CATEGORY_ACCENT.get(category, (163, 163, 163))
    f_cat = font(BOLD, 18)
    bbox = draw.textbbox((0, 0), cat_label, font=f_cat)
    pad_x, pad_y = 14, 8
    pill_w = (bbox[2] - bbox[0]) + pad_x * 2
    pill_h = (bbox[3] - bbox[1]) + pad_y * 2
    # pill bg (translucent via paste)
    pill = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle(
        [0, 0, pill_w - 1, pill_h - 1],
        radius=pill_h // 2,
        fill=cat_color + (32,),
        outline=cat_color + (140,),
        width=1,
    )
    im.paste(pill, (safe_x, safe_top), pill)
    draw.text((safe_x + pad_x, safe_top + pad_y - 2), cat_label, font=f_cat, fill=cat_color)

    # Title — clamp to ~3 lines
    y = safe_top + pill_h + 40
    max_w = W - safe_x * 2
    f_title = font(BOLD, 64)
    lines = wrap_px(draw, title, f_title, max_w)
    if len(lines) > 3:
        # shrink one step
        f_title = font(BOLD, 56)
        lines = wrap_px(draw, title, f_title, max_w)
    if len(lines) > 3:
        f_title = font(BOLD, 48)
        lines = wrap_px(draw, title, f_title, max_w)
    if len(lines) > 3:
        lines = lines[:3]
        lines[2] = lines[2].rstrip() + "…"
    for i, line in enumerate(lines):
        draw.text((safe_x, y), line, font=f_title, fill=FG_PRIMARY)
        y += f_title.size + 12

    # Author / brand row
    f_meta = font(REG, 22)
    f_brand = font(BOLD, 26)
    brand = "Lattice OS"
    meta = "joshuajair"
    meta_y = H - 90

    # logo dot
    logo_r = 14
    draw.ellipse(
        [safe_x, meta_y - logo_r, safe_x + logo_r * 2, meta_y + logo_r],
        fill=cat_color,
    )
    draw.text((safe_x + logo_r * 2 + 14, meta_y - 16), brand, font=f_brand, fill=FG_PRIMARY)
    brand_w = draw.textbbox((0, 0), brand, font=f_brand)[2]
    draw.text(
        (safe_x + logo_r * 2 + 14 + brand_w + 16, meta_y - 12),
        "·  " + meta,
        font=f_meta,
        fill=FG_MUTED,
    )

    # right-aligned site
    f_site = font(REG, 18)
    site = "gen1e.xyz"
    sw = draw.textbbox((0, 0), site, font=f_site)[2]
    draw.text((W - safe_x - sw, meta_y - 6), site, font=f_site, fill=FG_MUTED)

    im.save(out_path, "JPEG", quality=85, optimize=True, progressive=True)
    return os.path.getsize(out_path)


def extract(split_char="---"):
    posts = []
    for f in sorted(glob.glob(os.path.join(REPO, "content/blog/*.mdx"))):
        text = open(f).read()
        fm = text.split(split_char, 2)[1]
        def gv(k):
            m = re.search(rf"^{k}:\s*(.+)$", fm, re.M)
            return m.group(1).strip().strip("\"'") if m else ""
        posts.append({
            "slug": os.path.basename(f).replace(".mdx", ""),
            "title": gv("title"),
            "category": gv("category") or "uncategorized",
        })
    return posts


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    posts = extract()
    print(f"Rendering {len(posts)} OG cards -> {OUTDIR}")
    for p in posts:
        out = os.path.join(OUTDIR, f"{p['slug']}-og.jpg")
        size = render(p["slug"], p["title"], p["category"], out)
        print(f"  {os.path.basename(out):60s} {size/1024:6.1f} KB  [{p['category']}]")


if __name__ == "__main__":
    main()
