# -*- coding: utf-8 -*-
"""Genera booklet1.pdf y booklet2.pdf (baraja española) con la misma imposición
y geometría que el manual Rider-Waite original."""
import os, subprocess, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from contenido import PAGES

B = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(B, "out"); os.makedirs(OUT, exist_ok=True)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
PHONE = "927 066 862"
PW, PH = 841.92, 595.32

# Marcos medidos en el PDF original (x0, top) del trazo; ancho/alto por fila.
# Orden en cada hoja: fila 1 (4 marcos), fila 2 (4 marcos).
SHEETS = {
    "booklet1": [
        dict(frames=[(12.55, 12.60), (215.89, 12.00), (433.20, 12.26), (636.16, 11.65),
                     (12.55, 311.61), (215.89, 311.61), (433.20, 310.74), (636.16, 310.74)],
             sizes=[(192.61, 272.49)] * 2 + [(192.24, 272.01)] * 2 + [(192.61, 272.49)] * 2 + [(192.24, 272.01)] * 2,
             pages=[32, 1, 28, 5, 30, 3, 26, 7], hcut=298.15, vcut=420.3),
        dict(frames=[(13.00, 12.85), (216.37, 12.25), (432.70, 12.75), (636.07, 12.15),
                     (13.00, 311.86), (216.37, 311.86), (432.70, 311.76), (636.07, 311.76)],
             sizes=[(192.63, 272.49)] * 8,
             pages=[6, 27, 2, 31, 8, 25, 4, 29], hcut=298.10, vcut=421.2),
    ],
    "booklet2": [
        dict(frames=[(12.45, 12.60), (215.82, 12.00), (432.60, 12.61), (635.56, 12.00),
                     (12.45, 311.61), (215.82, 311.61), (432.60, 311.09), (635.56, 311.09)],
             sizes=[(192.63, 272.49)] * 2 + [(192.24, 272.01)] * 2 + [(192.63, 272.49)] * 2 + [(192.24, 272.01)] * 2,
             pages=[24, 9, 20, 13, 22, 11, 18, 15], hcut=298.05, vcut=420.35),
        dict(frames=[(13.00, 12.85), (216.37, 12.25), (432.70, 12.75), (636.07, 12.15),
                     (13.00, 311.86), (216.37, 311.86), (432.70, 311.76), (636.07, 311.76)],
             sizes=[(192.63, 272.49)] * 8,
             pages=[14, 19, 10, 23, 16, 17, 12, 21], hcut=298.05, vcut=421.2),
    ],
}

CSS = """
@font-face{font-family:Aptos;src:url(fonts/Aptos.ttf)}
@font-face{font-family:Aptos;font-weight:bold;src:url(fonts/Aptos-Bold.ttf)}
@font-face{font-family:Aptos;font-style:italic;src:url(fonts/Aptos-Italic.ttf)}
@font-face{font-family:Aptos;font-style:italic;font-weight:bold;src:url(fonts/Aptos-Bold-Italic.ttf)}
@font-face{font-family:BahnL;src:url(fonts/Bahn-Light.ttf)}
@page{size:%(pw)spt %(ph)spt;margin:0}
html,body{margin:0;padding:0}
body{font-family:Aptos;color:#000}
.sheet{position:relative;width:%(pw)spt;height:%(ph)spt;overflow:hidden;page-break-after:always}
.sheet:last-child{page-break-after:auto}
.cut{position:absolute;left:0;top:0;width:%(pw)spt;height:%(ph)spt}
.frame{position:absolute;box-sizing:border-box;border:0.75pt solid #000;overflow:visible}
.txt{position:absolute;left:12.5pt;right:13.5pt;top:%(toptxt)spt;text-align:justify;line-height:1.32}
.txt p{margin:0 0 8pt 0}
.txt p.h{font-weight:bold;font-size:9.96pt}
.txt p.ind{margin-left:22pt}
.txt .e{clear:both;display:flow-root}
.txt .e img{float:left;width:38pt;height:auto;margin:1pt 8pt 2pt 0}
.pn{position:absolute;left:0;right:0;top:%(toppn)spt;text-align:center;font-size:11.04pt;line-height:1.2}
.cover{position:absolute;left:207.15pt;top:0.05pt;width:209.69pt;height:299.05pt;z-index:5}
.logo{position:absolute;left:%(logox)spt;top:%(logoy)spt;width:105pt;height:104pt}
.phone{position:absolute;left:0;right:0;top:%(phoney)spt;text-align:center;font-family:BahnL;font-size:18pt;line-height:1;color:#80340d;white-space:pre}
"""

PARAMS = dict(pw=PW, ph=PH, toptxt=9.6, toppn=254.6, logox=45.45, logoy=73.1, phoney=189.6)


def frame_html(num, x, y, w, h):
    # El borde CSS se dibuja hacia adentro del box; centrar el trazo en (x, y).
    style = f"left:{x-0.375:.3f}pt;top:{y-0.375:.3f}pt;width:{w+0.75:.3f}pt;height:{h+0.75:.3f}pt"
    inner = ""
    if num == 1:
        inner = ""  # la portada va como imagen por encima del marco
    elif num == 32:
        inner = f'<img class="logo" src="img/logo.png"><div class="phone">{PHONE}</div>'
    else:
        pg = PAGES[num]
        inner = f'<div class="txt" style="font-size:{pg["size"]}pt">{pg["html"]}</div><div class="pn">{num}</div>'
    return f'<div class="frame" style="{style}">{inner}</div>'


def sheet_html(sh):
    parts = [f'<div class="sheet">']
    parts.append(f'<svg class="cut" viewBox="0 0 {PW} {PH}" width="{PW}pt" height="{PH}pt">'
                 f'<line x1="0" y1="{sh["hcut"]}" x2="{PW}" y2="{sh["hcut"]}" stroke="#042433" stroke-width="0.14" stroke-dasharray="0.56 0.42"/>'
                 f'<line x1="{sh["vcut"]}" y1="0" x2="{sh["vcut"]}" y2="{PH}" stroke="#042433" stroke-width="0.14" stroke-dasharray="0.56 0.42"/></svg>')
    for (x, y), (w, h), num in zip(sh["frames"], sh["sizes"], sh["pages"]):
        parts.append(frame_html(num, x, y, w, h))
        if num == 1:
            parts.append('<img class="cover" src="img/portada.png">')
    parts.append("</div>")
    return "".join(parts)


def build(name, sheets, params):
    html = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>%s</title><style>%s</style></head><body>%s</body></html>'
            % (name, CSS % params, "".join(sheet_html(s) for s in sheets)))
    hp = os.path.join(B, name + ".html")
    open(hp, "w", encoding="utf-8").write(html)
    pdf = os.path.join(OUT, name + ".pdf")
    r = subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                        "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000",
                        f"--print-to-pdf={pdf}", "file://" + hp], capture_output=True, text=True, timeout=120)
    if not os.path.exists(pdf):
        print(r.stderr[-2000:]); raise SystemExit("chrome fallo")
    # MediaBox exacto A4 apaisado (Chromium recorta 0,36 pt de alto): se agrega abajo.
    from pypdf import PdfReader, PdfWriter
    rd = PdfReader(pdf); wr = PdfWriter()
    for pg in rd.pages:
        mb = pg.mediabox
        dh = PH - float(mb.height)
        pg.mediabox.lower_left = (float(mb.left), float(mb.bottom) - dh)
        pg.cropbox.lower_left = pg.mediabox.lower_left
        wr.add_page(pg)
    wr.add_metadata({"/Title": "Baraja Española - Guía práctica de lectura", "/Author": "Tarot Store Perú"})
    with open(pdf, "wb") as f:
        wr.write(f)
    return pdf


def check(pdf, sheets):
    """Detecta texto que se sale del marco (por debajo del número de página)."""
    import pdfplumber
    problems = []
    with pdfplumber.open(pdf) as doc:
        for p, sh in zip(doc.pages, sheets):
            words = p.extract_words(extra_attrs=["size"])
            for (x, y), (w, h), num in zip(sh["frames"], sh["sizes"], sh["pages"]):
                ws = [wd for wd in words if x - 2 <= wd["x0"] and wd["x1"] <= x + w + 2 and y - 2 <= wd["top"] and wd["bottom"] <= y + h + 2]
                body = [wd for wd in ws if not (abs(wd["size"] - 11.04) < 0.1 and wd["text"] == str(num))]
                pn = [wd for wd in ws if abs(wd["size"] - 11.04) < 0.1 and wd["text"] == str(num)]
                if num in (1, 32):
                    continue
                if not pn:
                    problems.append((num, "sin numero de pagina"))
                    continue
                maxb = max(wd["bottom"] for wd in body) if body else 0
                limit = pn[0]["top"] - 1
                free = limit - maxb
                print(f"  pag {num:2d}: texto hasta {maxb:7.2f}, numero en {pn[0]['top']:7.2f}, libre {free:6.2f}pt")
                if free < 0:
                    problems.append((num, f"desborde {-free:.1f}pt"))
    return problems


if __name__ == "__main__":
    allp = []
    for name, sheets in SHEETS.items():
        pdf = build(name, sheets, PARAMS)
        print("==", pdf)
        allp += check(pdf, sheets)
    print("PROBLEMAS:", allp)
