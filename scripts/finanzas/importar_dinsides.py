"""
Convierte el reporte quincenal de Dinsides (CSV o XLSX) al formato de cargar.py. Reconoce las columnas por su
nombre (sin tildes ni mayúsculas); lo que no reconozca lo lista, para ajustar SINONIMOS al primer reporte real.

    python3 scripts/finanzas/importar_dinsides.py reporte.xlsx --salida /tmp/dinsides.json [--ver]
    ASESOR_CLAVE=... python3 scripts/finanzas/cargar.py /tmp/dinsides.json

--ver imprime cómo entendió las columnas y los primeros pedidos, sin escribir nada.
Estados: entregado/completado/cobrado → completado · rechazado/no recibió/anulado/devuelto al remitente → rechazado ·
lo demás (en ruta, programado…) → pendiente. Las fechas se aceptan AAAA-MM-DD, DD/MM/AAAA y serie de Excel.
"""
import csv, datetime as dt, json, re, sys, unicodedata

SINONIMOS = {
    "ref": ["guia", "n guia", "nro guia", "numero de guia", "orden", "n orden", "codigo", "id", "pedido", "tracking"],
    "cliente": ["cliente", "destinatario", "nombre", "nombre del cliente"],
    "whatsapp": ["telefono", "celular", "whatsapp", "contacto", "telefono del cliente"],
    "valor": ["monto a cobrar", "monto", "importe", "total", "recaudo", "valor", "cobro", "precio", "monto cobrado"],
    "envio_costo": ["costo de envio", "costo envio", "flete", "tarifa", "envio", "delivery", "costo delivery", "costo de entrega"],
    "estado": ["estado", "status", "situacion", "estado del pedido"],
    "fecha_venta": ["fecha de registro", "fecha registro", "fecha de creacion", "fecha de pedido", "fecha pedido", "fecha"],
    "fecha_cierre": ["fecha de entrega", "fecha entrega", "fecha de cierre", "fecha de liquidacion", "fecha liquidacion", "fecha de gestion", "fecha gestion"],
    "unidades": ["cantidad", "unidades", "cant"],
    "nota": ["observacion", "observaciones", "motivo", "motivo de rechazo", "detalle"],
}


def norm(t):
    t = unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def leer(ruta):
    if ruta.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        hoja = openpyxl.load_workbook(ruta, data_only=True).active
        filas = [list(r) for r in hoja.iter_rows(values_only=True)]
    else:
        with open(ruta, newline="", encoding="utf-8-sig") as f:
            muestra = f.read(4096); f.seek(0)
            filas = list(csv.reader(f, dialect=csv.Sniffer().sniff(muestra, delimiters=",;\t")))
    filas = [r for r in filas if any(c not in (None, "") for c in r)]
    if not filas: raise SystemExit("El archivo está vacío.")
    # La fila de encabezados es la primera que reconoce al menos 3 columnas.
    for i, r in enumerate(filas[:15]):
        if sum(1 for c in r if any(norm(c) in v for v in SINONIMOS.values())) >= 3:
            return [norm(c) for c in r], filas[i + 1:]
    raise SystemExit("No encontré la fila de encabezados (necesito al menos 3 columnas conocidas). Revisa SINONIMOS.")


def mapa(enc):
    m = {}
    for campo, nombres in SINONIMOS.items():
        for n in nombres:                      # orden de preferencia
            if n in enc and campo not in m: m[campo] = enc.index(n)
    return m


def fecha(v):
    if v in (None, ""): return None
    if isinstance(v, (dt.datetime, dt.date)): return v.strftime("%Y-%m-%d")
    if isinstance(v, (int, float)): return (dt.date(1899, 12, 30) + dt.timedelta(days=int(v))).isoformat()
    s = str(v).strip()[:10]
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s): return s
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", s)
    return f"{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}" if m else None


def numero(v):
    if v in (None, ""): return 0.0
    if isinstance(v, (int, float)): return float(v)
    s = re.sub(r"[^\d,.\-]", "", str(v))
    if "," in s and "." in s: s = s.replace(",", "")
    elif "," in s: s = s.replace(",", ".")
    try: return float(s)
    except ValueError: return 0.0


def estado(v):
    e = norm(v)
    if any(x in e for x in ("rechaz", "no recib", "anulad", "devuelt", "no contest", "cancelad", "sin contacto")): return "rechazado"
    if any(x in e for x in ("entregad", "complet", "cobrad", "liquidad", "exitos")): return "completado"
    return "pendiente"


def convertir(ruta):
    enc, filas = leer(ruta)
    m = mapa(enc)
    faltan = [c for c in ("valor", "estado") if c not in m]
    if faltan: raise SystemExit(f"No reconocí las columnas {faltan}. Encabezados del archivo: {enc}")
    sin_reconocer = [c for i, c in enumerate(enc) if i not in m.values() and c]
    pedidos, dudas = [], []
    g = lambda r, c: r[m[c]] if c in m and m[c] < len(r) else None
    for r in filas:
        est = estado(g(r, "estado"))
        cierre = fecha(g(r, "fecha_cierre")) or (fecha(g(r, "fecha_venta")) if est != "pendiente" else None)
        p = {"courier": "dinsides", "estado": est, "ref": str(g(r, "ref") or "").strip() or None,
             "cliente": str(g(r, "cliente") or "").strip() or None, "whatsapp": re.sub(r"\D", "", str(g(r, "whatsapp") or "")) or None,
             "valor": numero(g(r, "valor")), "envio_costo": numero(g(r, "envio_costo")), "unidades": int(numero(g(r, "unidades")) or 1),
             "fecha_venta": fecha(g(r, "fecha_venta")), "fecha_cierre": cierre, "nota": str(g(r, "nota") or "").strip() or None, "fuente": "reporte Dinsides"}
        if est != "pendiente" and not cierre: dudas.append(f"{p['ref'] or p['cliente']}: sin fecha de cierre")
        if not p["ref"] and not (p["whatsapp"] and p["fecha_venta"]): dudas.append(f"{p['cliente']}: sin guía ni teléfono+fecha")
        pedidos.append(p)
    return pedidos, m, sin_reconocer, dudas


def main(argv):
    if len(argv) < 2: raise SystemExit(__doc__)
    pedidos, m, sobran, dudas = convertir(argv[1])
    cuenta = {e: sum(1 for p in pedidos if p["estado"] == e) for e in ("completado", "rechazado", "pendiente")}
    print(f"{len(pedidos)} filas · {cuenta}\nColumnas entendidas: { {c: i for c, i in m.items()} }\nColumnas sin usar: {sobran}")
    if dudas: print("REVISAR:\n  " + "\n  ".join(dudas[:20]))
    if "--ver" in argv:
        print(json.dumps(pedidos[:5], ensure_ascii=False, indent=2)); return
    if dudas: raise SystemExit("Hay filas con datos faltantes; corrígelas en el reporte (o ajusta SINONIMOS) antes de cargar.")
    salida = argv[argv.index("--salida") + 1] if "--salida" in argv else "/tmp/dinsides.json"
    json.dump({"pedidos": pedidos}, open(salida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("Escrito:", salida)


if __name__ == "__main__":
    main(sys.argv)
