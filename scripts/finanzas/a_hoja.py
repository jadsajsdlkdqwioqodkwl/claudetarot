"""
Convierte lo cargado (JSON de importar_dinsides.py o armado por la Routine) en filas para la hoja PRIVADA
«Finanzas Tarot Store (privado)» y evita duplicar lo que ya está. No toca la red: la Routine/sesión escribe
en la hoja con el conector de Google Sheets.

    python3 scripts/finanzas/a_hoja.py entrada.json --existente pedidos_hoja.json --salida /tmp/fin/filas.json

entrada.json: {"pedidos": [...], "ads": [...], "gastos": [...]}   (formato en docs/finanzas.md)
pedidos_hoja.json: el resultado de leer la pestaña Pedidos!A2:H5000 con get_values (lista `values`); puede faltar si está vacía.
salida: {"pedidos_nuevos": [[...12 columnas]], "pedidos_actualizar": [{"fila": N, "valores": [...12 columnas]}],
         "ads": [[...]], "gastos": [[...]], "resumen": {...}}
  · pedidos_nuevos → agregar al final de Pedidos (append_values, A:L)
  · pedidos_actualizar → reescribir esa fila (update_values, Pedidos!A{fila}:L{fila}) (pasó de pendiente a completado, etc.)
  · ads → Anuncios!A:I: la fila de un (fecha, campaña) que ya existe se actualiza, no se repite
"""
import json, re, sys

PEDIDOS_COLS = ["courier", "ref", "whatsapp", "cliente", "asesora", "fecha_venta", "fecha_cierre", "estado", "unidades", "valor", "envio_costo", "nota"]
ESTADOS = ("completado", "rechazado", "pendiente", "devuelto")
COURIERS = ("dinsides", "shalom", "olva", "lima")
FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def d9(t): return re.sub(r"\D", "", str(t or ""))[-9:]


def clave(courier, ref, wa, fv):
    ref = str(ref or "").strip().lower()
    return f"{courier}|{ref}" if ref else f"{courier}|{d9(wa)}|{fv}"


def fila_pedido(p):
    c = str(p.get("courier", "")).lower().strip()
    e = str(p.get("estado", "pendiente")).lower().strip()
    if c not in COURIERS: raise SystemExit(f"Courier «{p.get('courier')}» inválido ({', '.join(COURIERS)}).")
    if e not in ESTADOS: raise SystemExit(f"Estado «{p.get('estado')}» inválido ({', '.join(ESTADOS)}).")
    if e in ("completado", "rechazado") and not FECHA.match(str(p.get("fecha_cierre") or "")): raise SystemExit(f"{p.get('ref') or p.get('cliente')}: falta fecha_cierre AAAA-MM-DD.")
    if not p.get("ref") and not (p.get("whatsapp") and p.get("fecha_venta")): raise SystemExit(f"{p.get('cliente')}: falta guía o whatsapp + fecha_venta.")
    return [c, p.get("ref") or "", d9(p.get("whatsapp")) or "", p.get("cliente") or "", p.get("asesora") or "", p.get("fecha_venta") or "", p.get("fecha_cierre") or "",
            e, int(p.get("unidades") or 1), float(p.get("valor") or 0), float(p.get("envio_costo") or 0), p.get("nota") or ""]


def main(argv):
    if len(argv) < 2: raise SystemExit(__doc__)
    g = lambda f: argv[argv.index(f) + 1] if f in argv else None
    ent = json.load(open(argv[1], encoding="utf-8"))
    existente = json.load(open(g("--existente"), encoding="utf-8")) if g("--existente") else []
    if isinstance(existente, dict): existente = existente.get("values", [])
    filas_hoja = {}
    for i, r in enumerate(existente):
        r = list(r) + [""] * (12 - len(r))
        if not r[0]: continue
        filas_hoja[clave(str(r[0]).lower(), r[1], r[2], str(r[5]))] = (i + 2, r)

    nuevos, actualizar = [], []
    for p in ent.get("pedidos", []):
        f = fila_pedido(p)
        k = clave(f[0], f[1], f[2], f[5])
        if k in filas_hoja:
            fila, viejo = filas_hoja[k]
            # lo que la hoja ya tiene y el reporte no trae (asesora, nota) se conserva
            for j in (3, 4, 11):
                if not f[j] and viejo[j]: f[j] = viejo[j]
            if [str(x) for x in f[:11]] != [str(x) for x in viejo[:11]]: actualizar.append({"fila": fila, "valores": f})
        else:
            nuevos.append(f)
    ads = [[a["fecha"], str(a.get("campana_id") or a.get("campana") or "total"), a.get("campana") or "", float(a.get("gasto") or 0), int(a.get("impresiones") or 0),
            int(a.get("clics") or 0), int(a.get("conversaciones") or 0), int(a.get("compras") or 0), float(a.get("valor_compras") or 0)] for a in ent.get("ads", [])]
    gastos = [[x["fecha"], x["categoria"], x.get("concepto") or "", float(x["monto"])] for x in ent.get("gastos", [])]
    salida = {"pedidos_nuevos": nuevos, "pedidos_actualizar": actualizar, "ads": ads, "gastos": gastos,
              "resumen": {"pedidos_nuevos": len(nuevos), "pedidos_actualizar": len(actualizar), "ads": len(ads), "gastos": len(gastos)}}
    json.dump(salida, open(g("--salida") or "/tmp/fin_filas.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(salida["resumen"])


if __name__ == "__main__":
    main(sys.argv)
