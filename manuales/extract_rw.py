# -*- coding: utf-8 -*-
"""Extrae del PDF original (Rider-Waite) el texto de cada mini-página como
bloques HTML (negrita/cursiva, tamaño) y las imágenes asociadas."""
import pdfplumber, json, os, subprocess, html
from PIL import Image

S = "/tmp/claude-0/-home-user-claudetarot/440f9efc-c53f-58bd-be90-7cce6ca4c45e/scratchpad"
OUT = f"{S}/build/rwcards"; os.makedirs(OUT, exist_ok=True)

SHEETS = [("src/booklet1.pdf", [[32, 1, 28, 5, 30, 3, 26, 7], [6, 27, 2, 31, 8, 25, 4, 29]]),
          ("src/booklet2.pdf", [[24, 9, 20, 13, 22, 11, 18, 15], [14, 19, 10, 23, 16, 17, 12, 21]])]
FR = [(12.5, 12), (215.9, 12), (432.7, 12), (636, 12), (12.5, 311), (215.9, 311), (432.7, 311), (636, 311)]
FW, FH = 193, 273.5

blocks = {}  # pagina -> lista de bloques
imgcount = [0]
for pdfname, order in SHEETS:
    # imágenes extraídas en orden de aparición
    tmp = f"{S}/build/rwtmp"; os.makedirs(tmp, exist_ok=True)
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    subprocess.run(["pdfimages", "-png", f"{S}/{pdfname}", f"{tmp}/i"], check=True)
    files = sorted(os.listdir(tmp))
    fi = 0
    with pdfplumber.open(f"{S}/{pdfname}") as pdf:
        for pno, page in enumerate(pdf.pages):
            # mapear imágenes de la página a archivos (mismo orden; smask ocupa archivo aparte)
            pimgs = []
            for im in page.images:
                w, h = im["srcsize"]
                # buscar el siguiente archivo con ese tamaño
                while fi < len(files):
                    f = files[fi]; fi += 1
                    iw, ih = Image.open(os.path.join(tmp, f)).size
                    if (iw, ih) == (w, h):
                        pimgs.append((im, os.path.join(tmp, f))); break
            chars = page.chars
            for fidx, pg in enumerate(order[pno]):
                fx, fy = FR[fidx]
                cs = [c for c in chars if fx - 3 <= c["x0"] <= fx + FW and fy - 3 <= c["top"] <= fy + FH]
                ims = [(im, f) for im, f in pimgs if fx - 3 <= im["x0"] <= fx + FW and fy - 3 <= im["top"] <= fy + FH]
                if pg in (1, 32):
                    continue
                # líneas
                cs.sort(key=lambda c: (round(c["top"] / 3), c["x0"]))
                lines = []
                for c in sorted(cs, key=lambda c: c["top"]):
                    if c["size"] < 5: continue
                    for ln in lines:
                        if abs(ln["top"] - c["top"]) < 0.45 * c["size"]:
                            ln["chars"].append(c); break
                    else:
                        lines.append({"top": c["top"], "chars": [c]})
                lines.sort(key=lambda l: l["top"])
                # párrafos
                paras = []
                prev = None
                for ln in lines:
                    ln["chars"].sort(key=lambda c: c["x0"])
                    size = max(set(round(c["size"], 2) for c in ln["chars"]), key=lambda s: sum(1 for c in ln["chars"] if round(c["size"], 2) == s))
                    if size > 10.5:  # número de página
                        continue
                    gap = ln["top"] - prev["top"] if prev else 0
                    newp = prev is None or gap > size * 1.32 * 1.25
                    if newp:
                        paras.append({"size": size, "top": ln["top"], "x0": ln["chars"][0]["x0"], "lines": []})
                    paras[-1]["lines"].append(ln)
                    prev = ln
                out = []
                for pa in paras:
                    runs = []  # (bold, italic, text)
                    for li, ln in enumerate(pa["lines"]):
                        prevc = None
                        for c in ln["chars"]:
                            b = "Bold" in c["fontname"]; it = "Italic" in c["fontname"]
                            t = c["text"]
                            if prevc is not None and c["x0"] - prevc["x1"] > 0.3 * c["size"] and t != " " and prevc["text"] != " ":
                                runs.append((b, it, " "))
                            runs.append((b, it, t))
                            prevc = c
                        if li < len(pa["lines"]) - 1:
                            runs.append((runs[-1][0], runs[-1][1], " "))
                    # fusionar runs
                    merged = []
                    for b, it, t in runs:
                        if t == " " and merged and merged[-1][2].endswith(" "):
                            continue
                        if merged and merged[-1][:2] == (b, it):
                            merged[-1] = (b, it, merged[-1][2] + t)
                        elif merged and t == " ":
                            merged[-1] = (merged[-1][0], merged[-1][1], merged[-1][2] + t)
                        else:
                            merged.append((b, it, t))
                    parts = []
                    for b, it, t in merged:
                        e = html.escape(t)
                        if b: e = f"<b>{e}</b>"
                        if it: e = f"<i>{e}</i>"
                        parts.append(e)
                    text = "".join(parts).strip()
                    text = text.replace("</b><b>", "").replace("</b> <b>", " ")
                    # imagen cuyo top está a la altura del párrafo
                    img = None
                    for im, f in ims:
                        if abs(im["top"] - pa["top"]) < 14 and f not in [o.get("imgfile") for o in out]:
                            img = f; break
                    blk = {"size": pa["size"], "html": text, "indent": round(pa["x0"] - fx, 1)}
                    if img:
                        imgcount[0] += 1
                        dest = f"{OUT}/p{pg:02d}_{imgcount[0]:03d}.png"
                        Image.open(img).save(dest)
                        blk["img"] = os.path.basename(dest)
                    out.append(blk)
                blocks[pg] = out
json.dump(blocks, open(f"{S}/build/rw_blocks.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for pg in sorted(blocks):
    print(f"=== pag {pg}")
    for b in blocks[pg]:
        print(f"  [{b['size']}|{b['indent']}|{b.get('img','')}] {b['html'][:110]}")
