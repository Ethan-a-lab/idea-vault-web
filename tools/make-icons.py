# -*- coding: utf-8 -*-
"""
重新生成站点图标（assets/icons/ 下的全套 PNG）。

改动图标设计后跑一次：  python tools/make-icons.py

原理：让无头 Chrome 把 SVG 渲成 512px，再用 PIL 的 LANCZOS 降到目标尺寸，
比直接渲染小尺寸更干净。依赖：Chrome、Pillow。不参与站点运行，纯开发工具。
"""
import os
import shutil
import subprocess
import tempfile

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "assets", "icons")
DESK = os.path.join(REPO, "desk", "assets", "icons")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

GRAD = """<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD3A3"/>
      <stop offset="0.55" stop-color="#9079A6"/>
      <stop offset="1" stop-color="#443E75"/>
    </linearGradient>"""

# 小尺寸专用渐变：中间过渡色提亮，缩到 32px 时三根柱子更容易分辨
GRAD_SMALL = """<linearGradient id="bgs" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD3A3"/>
      <stop offset="0.5" stop-color="#A493B8"/>
      <stop offset="1" stop-color="#4A4380"/>
    </linearGradient>"""

# 三根柱子：薄荷（金融）、金（外语）、长春花蓝（AI）
PILLARS = """<rect x="54" y="90" width="24" height="56" rx="12" fill="#7BEFC2"/>
  <rect x="88" y="62" width="24" height="84" rx="12" fill="#FFE07A"/>
  <rect x="122" y="80" width="24" height="66" rx="12" fill="#B9C6FF"/>"""


def build_svg(kind):
    if kind == "round":       # 浏览器标签用，四角透明
        body = '<rect width="200" height="200" rx="44" fill="url(#bg)"/>\n  ' + PILLARS
        extra = ""
    elif kind == "square":    # 桌面图标用，满幅不透明
        body = '<rect width="200" height="200" fill="url(#bg)"/>\n  ' + PILLARS
        extra = ""
    elif kind == "maskable":  # 安卓自适应图标：内容缩进中心 72% 安全区
        body = ('<rect width="200" height="200" fill="url(#bg)"/>\n'
                '  <g transform="translate(100,104) scale(0.72) translate(-100,-104)">\n  '
                + PILLARS + "\n  </g>")
        extra = ""
    elif kind == "small":     # 32px：柱子放大 + 对比增强
        body = ('<rect width="200" height="200" rx="44" fill="url(#bgs)"/>\n'
                '  <g transform="translate(100,104) scale(1.12) translate(-100,-104)">\n  '
                + PILLARS + "\n  </g>")
        extra = GRAD_SMALL
    else:
        raise ValueError(kind)

    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" '
            'width="512" height="512"><defs>' + GRAD + extra + '</defs>\n  '
            + body + '\n</svg>')


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    raise SystemExit("找不到 Chrome / Edge，无法渲染")


def render(chrome, kind, tmp):
    html = os.path.join(tmp, kind + ".html")
    with open(html, "w", encoding="utf-8") as f:
        f.write("<!doctype html><meta charset=utf-8>"
                "<style>html,body{margin:0;padding:0;background:transparent}"
                "svg{display:block}</style>" + build_svg(kind))
    png = os.path.join(tmp, kind + ".png")
    subprocess.run(
        [chrome, "--headless", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=1", "--default-background-color=00000000",
         "--virtual-time-budget=1500", "--window-size=512,512",
         "--screenshot=" + png, "file:///" + html.replace("\\", "/")],
        capture_output=True, timeout=120)
    if not os.path.exists(png):
        raise SystemExit("渲染失败: " + kind)
    return Image.open(png).convert("RGBA")


def save(img, size, name, opaque=False):
    im = img.resize((size, size), Image.LANCZOS)
    if opaque:
        # 桌面图标不要透明底，否则有的启动器会垫成白色
        flat = Image.new("RGB", (size, size), (68, 62, 117))
        flat.paste(im, (0, 0), im)
        im = flat
    path = os.path.join(OUT, name)
    im.save(path, "PNG", optimize=True)
    print("  %-24s %4dx%-4d %6d B" % (name, size, size, os.path.getsize(path)))


def main():
    os.makedirs(OUT, exist_ok=True)
    chrome = find_chrome()
    tmp = tempfile.mkdtemp(prefix="icon-")
    try:
        imgs = {k: render(chrome, k, tmp) for k in ("round", "square", "maskable", "small")}
        save(imgs["small"], 32, "favicon-32.png")
        save(imgs["square"], 180, "apple-touch-icon.png", opaque=True)
        save(imgs["square"], 192, "icon-192.png", opaque=True)
        save(imgs["square"], 512, "icon-512.png", opaque=True)
        save(imgs["maskable"], 512, "icon-maskable-512.png", opaque=True)

        if os.path.isdir(DESK):
            for n in ("icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"):
                shutil.copyfile(os.path.join(OUT, n), os.path.join(DESK, n))
            print("  已同步到 desk/assets/icons/（记得把 desk/sw.js 的 VERSION 加一）")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
