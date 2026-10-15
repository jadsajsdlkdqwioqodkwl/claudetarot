"""
Control de ventas: el cuadre que no depende de que la Routine lea bien.

El Worker (/api/asesor/control-ventas) dice qué ventas conoce el sistema ese día
(compras marcadas en el CRM, pedidos de la web y del catálogo, de TODAS las
líneas de WhatsApp). Un reporte de ventas no sale (enviar.py) mientras quede un
candidato sin explicar:

  - cada candidato va en `pedidos` (con su estado, aunque sea OTRO_DIA o
    POR_CONFIRMAR) o en `no_cuentan` [{whatsapp, motivo}] con el motivo;
  - una venta confirmada que el CRM NO conoce va en `sin_marcar_compra`.

    ASESOR_CLAVE=... python3 scripts/asesor/control_ventas.py 2026-10-14 --salida /tmp/ventas
"""
import json, os, sys, urllib.error, urllib.request

API = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/control-ventas"


def n9(wa):
    return "".join(c for c in str(wa or "") if c.isdigit())[-9:]


def traer(clave, fecha):
    req = urllib.request.Request(f"{API}?fecha={fecha}", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        raise RuntimeError(f"El Worker rechazó el control de ventas ({err.code}): {err.read().decode()[:200]}")
    except Exception as err:  # sin red: no se puede garantizar el cuadre
        raise RuntimeError(f"No se pudo consultar el control de ventas: {err}")


def candidatos(control):
    """{últimos 9 dígitos: [por qué es candidato]} (solo lo que el sistema conoce de ese día)."""
    c = {}
    for x in control.get("compras", []):
        c.setdefault(n9(x["wa_id"]), []).append(
            f"compra en el CRM {x['created_at'][11:16]} ({x.get('assigned_agent') or 'sin asesora'}, S/{x.get('value')}"
            + (", ENVÍO A META FALLIDO" if x.get("status") == "fallido" else "") + ")")
    for x in control.get("pedidos_web", []):
        c.setdefault(n9(x["wa_id"]), []).append(f"pedido de la web {x['created_at'][11:16]}")
    for x in control.get("pedidos_catalogo", []):
        c.setdefault(n9(x["wa_id"]), []).append(f"pedido del catálogo {x['created_at'][11:16]}")
    return c


def cuadrar(control, datos):
    """Lista de problemas (vacía = cuadra). No toca nada."""
    explicados = {n9(p.get("whatsapp")) for p in datos.get("pedidos", []) if p.get("whatsapp")}
    explicados |= {n9(p.get("whatsapp")) for p in datos.get("no_cuentan", []) if p.get("whatsapp") and str(p.get("motivo", "")).strip()}
    problemas = []
    cand = candidatos(control)
    for wa, razones in cand.items():
        if wa and wa not in explicados:
            problemas.append(f"- {wa}: el sistema lo conoce ({'; '.join(razones)}) y NO está en `pedidos` ni en `no_cuentan` con motivo.")
    conocidos = set(cand) | {n9(x["wa_id"]) for x in control.get("compra_otro_dia", [])}
    marcadas = {n9(p.get("whatsapp")) for p in datos.get("sin_marcar_compra", [])}
    for p in datos.get("pedidos", []):
        wa = n9(p.get("whatsapp"))
        if p.get("estado") == "CONFIRMADO" and wa and wa not in conocidos and wa not in marcadas:
            problemas.append(f"- {wa}: lo pones CONFIRMADO pero el CRM no tiene compra ni pedido suyo ese día; si es venta real, ponlo en `sin_marcar_compra`; si no, cámbialo de estado.")
    import datetime as dt
    limite = (dt.date.fromisoformat(control["fecha"]) - dt.timedelta(days=3)).isoformat() if control.get("fecha") else ""
    for x in control.get("compra_otro_dia", []):
        wa = n9(x["wa_id"])
        # Una compra de hace más de 3 días que solo escribe (posventa) es informativa; las recientes sí hay que explicarlas.
        if (x.get("ultima_compra") or "9999")[:10] < limite:
            continue
        if wa not in explicados:
            problemas.append(f"- {wa}: etiqueta purchase y escribió ese día, pero su compra es de {x.get('ultima_compra') or 'otro día'}; "
                             "ponlo en `pedidos` como OTRO_DIA (con esa fecha) o en `no_cuentan` con el motivo.")
    otras = [l for l in control.get("lineas", []) if l.get("linea") and l.get("chats_activos")]
    if otras and not datos.get("lineas_revisadas"):
        problemas.append("- Hay chats activos en otros números de WhatsApp (" + ", ".join(f"línea {l['linea']}: {l['chats_activos']}" for l in otras)
                         + "): léelos con `preparar.py api --linea N` y pon `lineas_revisadas` ([N, …]) en el salida.json.")
    return problemas


def main():
    fecha, carpeta = sys.argv[1], (sys.argv[sys.argv.index("--salida") + 1] if "--salida" in sys.argv else "/tmp/ventas")
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")
    control = traer(clave, fecha)
    os.makedirs(carpeta, exist_ok=True)
    with open(os.path.join(carpeta, "control.json"), "w") as fh:
        json.dump(control, fh, ensure_ascii=False, indent=1)
    cand = candidatos(control)
    print(json.dumps({"fecha": control["fecha"], "candidatos": len(cand), "compra_otro_dia": len(control["compra_otro_dia"]),
                      "lineas": control["lineas"], "archivo": os.path.join(carpeta, "control.json")}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
