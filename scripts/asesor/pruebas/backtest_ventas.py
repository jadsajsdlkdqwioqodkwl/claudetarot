"""Backtest: ¿el cuadre con el CRM habría atrapado lo que los reportes ya enviados no explicaban?
Baja el PDF de un reporte ya enviado (/r/<id>.pdf), saca los WhatsApp de sus tablas de pedidos y los
cuadra contra el control del Worker de ese día.

    ASESOR_CLAVE=... python3 -I scripts/asesor/pruebas/backtest_ventas.py AAAA-MM-DD ventas-....pdf [otro.pdf ...]
"""
import io, json, os, re, sys, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import control_ventas as cv
import pdfplumber

BASE = "https://kit-tarot-para-principiantes.tarotperu.store/r/"


def telefonos(pdf_bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as d:
        txt = "\n".join(p.extract_text() or "" for p in d.pages)
    # Solo las tablas de pedidos (las incidencias vienen antes y no son ventas).
    corte = min([i for i in (txt.find("confirmados (") , txt.find("Por confirmar")) if i >= 0] or [0])
    return sorted(set(re.findall(r"\b51\d{9}\b", txt[corte:])))


def main():
    fecha, pdfs = sys.argv[1], sys.argv[2:]
    clave = os.environ["ASESOR_CLAVE"]
    control = cv.traer(clave, fecha)
    cand = cv.candidatos(control)
    print(f"== {fecha}: el sistema conoce {len(cand)} ventas/pedidos ({len(control['compras'])} compras CRM, "
          f"{len(control['pedidos_web'])} web, {len(control['pedidos_catalogo'])} catálogo)")
    for f in pdfs:
        req = urllib.request.Request(BASE + f, headers={"User-Agent": "tarot-asesor/1.0"})
        tels = telefonos(urllib.request.urlopen(req, timeout=60).read())
        datos = {"pedidos": [{"whatsapp": t, "estado": "POR_CONFIRMAR"} for t in tels], "lineas_revisadas": [l["linea"] for l in control["lineas"]]}
        falta = [p for p in cv.cuadrar(control, datos) if "NO está en `pedidos`" in p]
        print(f"-- {f[:60]}: el reporte trae {len(tels)} WhatsApp; el control marcaría {len(falta)} sin explicar")
        for p in falta:
            print("   ", p[:150])


if __name__ == "__main__":
    main()
