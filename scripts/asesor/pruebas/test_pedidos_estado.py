"""Prueba: el registro de pedidos suma corridas, no pierde pedidos, explica la diferencia y agenda otros días.
    python3 scripts/asesor/pruebas/test_pedidos_estado.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import pedidos_estado as pe

def ped(wa, estado="CONFIRMADO", destino="LIMA", **kw):
    return dict(whatsapp=wa, nombre="C" + wa[-2:], estado=estado, destino=destino, **kw)

assert pe.fecha_iso("domingo 19/10", "2026-10-17") == "2026-10-19"
assert pe.fecha_iso("2026-10-19", "2026-10-17") == "2026-10-19"
assert pe.fecha_iso("el domingo", "2026-10-17") is None
# 10:30 lee 3 días: 2 Lima + 1 para el domingo. 11:30 solo ve los chats activos (otro Lima nuevo) y no menciona nada más.
r1 = {"fecha_objetivo": "2026-10-17", "origen": "asesor 10:30", "pedidos": [
    ped("51900000001"), ped("51900000002"), ped("51900000003", "OTRO_DIA", fecha_entrega="2026-10-19")]}
c1, d1 = pe.combinar(None, r1)
assert len(c1["pedidos"]) == 3 and len(d1["nuevos"]) == 3
fut, sin = pe.agenda(c1)
assert list(fut) == ["2026-10-19"] and fut["2026-10-19"][0]["tipo"] == "AGENDADO" and not sin
r2 = {"fecha_objetivo": "2026-10-17", "origen": "asesor 11:30", "pedidos": [ped("51900000004"), ped("51900000001", kits=2)]}
c2, d2 = pe.combinar(c1, r2)
assert len(c2["pedidos"]) == 4, "el 11:30 no puede perder los pedidos del 10:30"
assert len(d2["nuevos"]) == 1 and len(d2["cambiados"]) == 1 and len(d2["no_mencionados"]) == 2, d2
# Quitar exige motivo y queda escrito.
c3, d3 = pe.combinar(c2, {"fecha_objetivo": "2026-10-17", "pedidos": [], "quitar": [{"whatsapp": "51900000002", "motivo": "canceló"}]})
assert len(c3["pedidos"]) == 3 and d3["quitados"][0]["motivo"] == "canceló"
# Las incidencias (sin WhatsApp) no se duplican entre corridas.
inc = {"nombre": "INCIDENCIA", "nota": "🚨 falta una carta"}
c4, _ = pe.combinar({"pedidos": [inc]}, {"fecha_objetivo": "x", "pedidos": [dict(inc)]})
assert len(c4["pedidos"]) == 1
# Caso real 17/10: Lima confirmado con entrega el lunes 19 en el reporte de ventas del sábado 17 no puede salir como confirmado.
ma = ped("51986218890", fecha_entrega="2026-10-19")
assert pe.revisar_fechas({"fecha_objetivo": "2026-10-17", "tipo_reporte": "ventas", "pedidos": [ma, ped("51947683281", fecha_entrega="2026-10-18")]}) \
    and len(pe.revisar_fechas({"fecha_objetivo": "2026-10-17", "tipo_reporte": "ventas", "pedidos": [ma, ped("51947683281", fecha_entrega="2026-10-18")]})) == 1
assert pe.revisar_fechas({"fecha_objetivo": "2026-10-18", "pedidos": [ped("51947683281", fecha_entrega="2026-10-19")]})
assert not pe.revisar_fechas({"fecha_objetivo": "2026-10-18", "pedidos": [dict(ma, estado="OTRO_DIA"), ped("51947683281", fecha_entrega="2026-10-18")]})
print("OK: registro de pedidos")
