"""
Cuenta del período en texto (para la Routine o para mirar). Lee del Worker; no calcula nada aparte.

    ASESOR_CLAVE=... python3 scripts/finanzas/reporte.py [--quincena 2026-10-A | --mes 2026-10] [--negocio tarot] [--json]
"""
import json, sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api


def s(n): return "—" if n is None else f"S/ {n:,.2f}"
def pc(n): return "—" if n is None else f"{n * 100:.1f} %"


def texto(d):
    p, k, a = d["pedidos"], d["kpis"], d["ads"]
    L = [f"FINANZAS · {d['nombre']} · {d['periodo']['etiqueta']}", "",
         f"Cobrado (pedidos entregados)      {s(d['ingresos'])}",
         f"  − costo del producto            {s(d['costo_producto'])}   (S/ {d['reglas']['costo_producto']} por kit)",
         f"  − envíos que paga el negocio    {s(d['envios'])}",
         f"= Margen bruto                    {s(d['margen_bruto'])}",
         f"  − comisiones de asesoras        {s(d['comisiones'])}",
         f"  − anuncios (Meta)               {s(d['anuncios'])}",
         f"  − otros gastos                  {s(d['otros_gastos'])}",
         f"= UTILIDAD                        {s(d['utilidad'])}   ({pc(k['margen_pct'])} de lo cobrado)", "",
         f"Pedidos: {p['completados']} entregados · {p['rechazados']} rechazados · {p['pendientes']} en camino ({s(p['por_cobrar'])} por cobrar) · {p['ventas_crm'] if p['ventas_crm'] is not None else '—'} ventas en el CRM",
         f"Ticket {s(k['ticket'])} · deja {s(k['contribucion_por_pedido'])} por pedido antes de anuncios · cuesta {s(k['costo_por_pedido_entregado'])} en anuncios por pedido entregado · ROAS real {k['roas_real'] if k['roas_real'] is not None else '—'}",
         f"Anuncios: {s(a['gasto'])} · {a['conversaciones']} chats ({s(k['costo_por_mensaje'])} c/u) · chat→venta {pc(k['mensaje_a_venta'])} · venta→entrega {pc(k['venta_a_entrega'])} · rechazo {pc(k['tasa_rechazo'])}", ""]
    if d["por_courier"]:
        L.append("Por courier:")
        L += [f"  {c['courier']:<9} {c['completados']} entregados · {c['rechazados']} rechazados · cobrado {s(c['ingresos'])} · envíos {s(c['envios'])} · margen {s(c['margen'])}" for c in d["por_courier"]]
        L.append("")
    L.append("Dónde enfocarse (utilidad que suma mejorar cada palanca un 10 %):")
    nombres = {"ads": "ADS (costo de la publicidad)", "cro": "CRO (convertir mejor el tráfico)", "producto": "PRODUCTO (ofertas, upsells)"}
    L += [f"  {i + 1}. {nombres[x['palanca']]}: +{s(x['utilidad_extra'])}  — {x['cambio']}" for i, x in enumerate(d["palancas"])]
    if d["alertas"]:
        L += ["", "Alertas:"] + [f"  [{x['nivel']}] ({x['palanca']}) {x['texto']}" for x in d["alertas"]]
    return "\n".join(L)


def main(argv):
    g = lambda f: argv[argv.index(f) + 1] if f in argv else None
    d = api.pedir(negocio=g("--negocio") or "tarot", quincena=g("--quincena"), mes=g("--mes"))
    print(json.dumps(d, ensure_ascii=False, indent=2) if "--json" in argv else texto(d))


if __name__ == "__main__":
    main(sys.argv)
