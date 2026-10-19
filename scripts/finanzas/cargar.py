"""
Carga pedidos, anuncios y gastos al libro de finanzas. Idempotente: volver a cargar el mismo archivo no duplica.

    ASESOR_CLAVE=... python3 scripts/finanzas/cargar.py archivo.json [--negocio tarot] [--prueba]

archivo.json: {"pedidos": [...], "ads": [...], "gastos": [...]}  (cualquiera de las tres; formato en docs/finanzas.md)
--prueba solo valida el formato y cuenta, sin mandar nada.
"""
import json, re, sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api

FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validar(d):
    errores = []
    for i, p in enumerate(d.get("pedidos", [])):
        if p.get("courier", "").lower() not in ("dinsides", "shalom", "olva", "lima"): errores.append(f"pedidos[{i}]: courier")
        if p.get("estado", "pendiente") in ("completado", "rechazado") and not FECHA.match(str(p.get("fecha_cierre", ""))): errores.append(f"pedidos[{i}]: fecha_cierre AAAA-MM-DD")
        if not p.get("ref") and not (p.get("whatsapp") and p.get("fecha_venta")): errores.append(f"pedidos[{i}]: falta ref o whatsapp+fecha_venta")
    for i, a in enumerate(d.get("ads", [])):
        if not FECHA.match(str(a.get("fecha", ""))): errores.append(f"ads[{i}]: fecha AAAA-MM-DD")
    for i, g in enumerate(d.get("gastos", [])):
        if not FECHA.match(str(g.get("fecha", ""))) or "monto" not in g: errores.append(f"gastos[{i}]: fecha y monto")
    return errores


def main(argv):
    if len(argv) < 2:
        raise SystemExit(__doc__)
    negocio = argv[argv.index("--negocio") + 1] if "--negocio" in argv else "tarot"
    d = json.load(open(argv[1], encoding="utf-8"))
    errores = validar(d)
    if errores:
        raise SystemExit("Formato inválido:\n  " + "\n  ".join(errores[:20]))
    cuenta = {k: len(d.get(k, [])) for k in ("pedidos", "ads", "gastos")}
    if "--prueba" in argv:
        print("Formato correcto (no se mandó nada):", cuenta); return
    print("Cargado:", api.pedir({**d, "negocio": negocio})["cargado"])


if __name__ == "__main__":
    main(sys.argv)
