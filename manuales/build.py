# -*- coding: utf-8 -*-
"""Genera los folletos (4 hojas A4 apaisadas, 8 páginas por cara, 32 páginas)
con marcos perfectamente simétricos para que anverso y reverso coincidan al
imprimir a doble cara (volteo por el borde corto).

    python3 build.py            # las dos guías (Rider-Waite y baraja española)
    python3 build.py rw|es      # solo una
"""
import os, subprocess, sys, importlib
B = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, B)
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
PHONE = "927 066 862"
PW, PH = 841.92, 595.32

# Geometría simétrica (pt). Marco = tamaño del original (192,6 x 272,5), con
# el mismo espacio entre marcos (10,72) y en el centro (24,7); margen igual a
# los 4 lados por simetría, así la cara B cae exactamente sobre la cara A.
FW, FH, GAP, CGAP = 192.6, 272.5, 10.72, 24.7
XC, YC = PW / 2, PH / 2
X3 = XC + CGAP / 2; X4 = X3 + FW + GAP
X2 = XC - CGAP / 2 - FW; X1 = X2 - GAP - FW
Y1 = 12.3; Y2 = PH - Y1 - FH
FRAMES = [(X1, Y1), (X2, Y1), (X3, Y1), (X4, Y1), (X1, Y2), (X2, Y2), (X3, Y2), (X4, Y2)]
assert abs((PW - X4 - FW) - X1) < 1e-6  # simetría horizontal

# Imposición (igual que el original): páginas por marco, fila 1 y fila 2.
IMPOSICION = {
    "booklet1": [[32, 1, 28, 5, 30, 3, 26, 7], [6, 27, 2, 31, 8, 25, 4, 29]],
    "booklet2": [[24, 9, 20, 13, 22, 11, 18, 15], [14, 19, 10, 23, 16, 17, 12, 21]],
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
.lines{position:absolute;left:0;top:0;width:%(pw)spt;height:%(ph)spt}
.frame{position:absolute;width:%(fw)spt;height:%(fh)spt}
.txt{position:absolute;left:12.5pt;right:13.5pt;top:9.6pt;text-align:justify;line-height:1.32}
.txt p{margin:0 0 8pt 0}
.txt p.h{font-weight:bold;font-size:9.96pt}
.txt p.ind{margin-left:22pt}
.txt .e{clear:both;display:flow-root}
.txt .e img{float:left;width:%(imgw)spt;height:auto;margin:1pt %(imggap)spt 2pt %(imgml)spt}
.txt.c4 .e img{width:30pt;margin-left:-3pt}
.txt.c4 p{margin-bottom:4pt}
.pn{position:absolute;left:0;right:0;top:254.6pt;text-align:center;font-size:11.04pt;line-height:1.2}
.cover{position:absolute;left:%(coverx)spt;top:%(covery)spt;width:%(coverw)spt;height:%(coverh)spt;z-index:2}
.lines{z-index:3}
.logo{position:absolute;left:45.45pt;top:73.1pt;width:105pt;height:104pt}
.phone{position:absolute;left:0;right:0;top:189.6pt;text-align:center;font-family:BahnL;font-size:18pt;line-height:1;color:#80340d;white-space:pre}
"""


def frame_html(pages, num, x, y):
    inner = ""
    if num == 32:
        inner = f'<img class="logo" src="img/logo.png"><div class="phone">{PHONE}</div>'
    elif num != 1:
        pg = pages[num]
        inner = f'<div class="txt {pg.get("cls","")}" style="font-size:{pg["size"]}pt">{pg["html"]}</div><div class="pn">{num}</div>'
    return f'<div class="frame" style="left:{x:.3f}pt;top:{y:.3f}pt">{inner}</div>'


def sheet_html(pages, order):
    # Marcos y líneas de corte como SVG (vectorial, sin redondeo a píxel).
    svg = [f'<svg class="lines" viewBox="0 0 {PW} {PH}" width="{PW}pt" height="{PH}pt">',
           f'<line x1="0" y1="{YC}" x2="{PW}" y2="{YC}" stroke="#042433" stroke-width="0.14" stroke-dasharray="0.56 0.42"/>',
           f'<line x1="{XC}" y1="0" x2="{XC}" y2="{PH}" stroke="#042433" stroke-width="0.14" stroke-dasharray="0.56 0.42"/>']
    for (x, y), num in zip(FRAMES, order):
        if num == 1:
            continue  # la portada lleva el borde dentro de la imagen
        svg.append(f'<rect x="{x:.3f}" y="{y:.3f}" width="{FW}" height="{FH}" fill="none" stroke="#000" stroke-width="0.75"/>')
    svg.append("</svg>")
    parts = ['<div class="sheet">'] + svg
    for (x, y), num in zip(FRAMES, order):
        parts.append(frame_html(pages, num, x, y))
        if num == 1:
            parts.append('<img class="cover" src="img/portada_crop.png">')
    parts.append("</div>")
    return "".join(parts)


def build(tag, pages, outdir):
    os.makedirs(outdir, exist_ok=True)
    # Rider-Waite: miniaturas como en el original (37 pt, pegadas al marco a 6,2 pt)
    imgp = dict(imgw=37, imggap=8.3, imgml=-6.3) if tag == "rw" else dict(imgw=38, imggap=8, imgml=0)
    # Portada: la imagen trae su propio borde negro (centros en px 24.3 / 599.3
    # horizontal y 34.5 / 850.5 vertical, de 624 x 890). Se escala para que ese
    # borde caiga exactamente donde iria el marco; el marco SVG no se dibuja.
    # portada_crop.png = portada.png recortada a ese borde (px 21..603 x 31..854),
    # asi nada de la imagen queda fuera de la rejilla de marcos.
    sx = FW / (599.3 - 24.3); sy = FH / (850.5 - 34.5)
    params = dict(pw=PW, ph=PH, fw=FW, fh=FH, coverx=X2 - (24.3 - 21) * sx, covery=Y1 - (34.5 - 31) * sy,
                  coverw=(603 - 21) * sx, coverh=(854 - 31) * sy, **imgp)
    outs = []
    for name, rows in IMPOSICION.items():
        html = ('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>%s</title><style>%s</style></head><body>%s</body></html>'
                % (name, CSS % params, "".join(sheet_html(pages, o) for o in rows)))
        hp = os.path.join(B, f"{tag}_{name}.html")
        open(hp, "w", encoding="utf-8").write(html)
        pdf = os.path.join(outdir, name + ".pdf")
        r = subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                            "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000",
                            f"--print-to-pdf={pdf}", "file://" + hp], capture_output=True, text=True, timeout=120)
        if not os.path.exists(pdf):
            print(r.stderr[-2000:]); raise SystemExit("chrome fallo")
        # MediaBox exacto A4 apaisado (Chromium recorta 0,36 pt de alto): se reparte arriba y abajo.
        from pypdf import PdfReader, PdfWriter
        rd = PdfReader(pdf); wr = PdfWriter()
        for pg in rd.pages:
            mb = pg.mediabox
            dh = PH - float(mb.height)
            pg.mediabox.lower_left = (float(mb.left), float(mb.bottom) - dh / 2)
            pg.mediabox.upper_right = (float(mb.right), float(mb.top) + dh / 2)
            pg.cropbox.lower_left = pg.mediabox.lower_left
            pg.cropbox.upper_right = pg.mediabox.upper_right
            wr.add_page(pg)
        wr.add_metadata({"/Title": "Guía práctica de lectura", "/Author": "Tarot Store Perú"})
        with open(pdf, "wb") as f:
            wr.write(f)
        outs.append((pdf, rows))
    return outs


def check(pdf, rows):
    """Texto que se sale del marco (pisa el número de página) y simetría real de los marcos."""
    import pdfplumber
    problems = []
    with pdfplumber.open(pdf) as doc:
        for p, order in zip(doc.pages, rows):
            rects = [r for r in p.rects if 150 < r["width"] < 200]
            for r in rects:  # cada marco debe tener su espejo exacto
                if not any(abs((r["x0"] + q["x0"] + FW) - PW) < 0.05 and abs(r["top"] - q["top"]) < 0.05 for q in rects):
                    if 1 not in order or abs((PW - r["x0"] - FW) - X2) > 0.05:
                        problems.append(("simetria", round(r["x0"], 2), round(r["top"], 2)))
            words = p.extract_words(extra_attrs=["size"])
            for (x, y), num in zip(FRAMES, order):
                if num in (1, 32):
                    continue
                ws = [wd for wd in words if x - 2 <= wd["x0"] and wd["x1"] <= x + FW + 2 and y - 2 <= wd["top"] and wd["bottom"] <= y + FH + 2]
                pn = [wd for wd in ws if abs(wd["size"] - 11.04) < 0.1 and wd["text"] == str(num)]
                body = [wd for wd in ws if wd not in pn]
                if not pn:
                    problems.append((num, "sin numero de pagina")); continue
                maxb = max(wd["bottom"] for wd in body) if body else 0
                free = pn[0]["top"] - 1 - maxb
                print(f"  pag {num:2d}: libre {free:6.2f}pt")
                if free < 0:
                    problems.append((num, f"desborde {-free:.1f}pt"))
    return problems


if __name__ == "__main__":
    which = sys.argv[1:] or ["rw", "es"]
    mods = {"rw": ("contenido_rw", "out_rw"), "es": ("contenido", "out_es")}
    for w in which:
        mod, outdir = mods[w]
        pages = importlib.import_module(mod).PAGES
        allp = []
        for pdf, rows in build(w, pages, os.path.join(B, outdir)):
            print("==", pdf)
            allp += check(pdf, rows)
        print(w, "PROBLEMAS:", allp)
