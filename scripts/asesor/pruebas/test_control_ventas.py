"""Prueba: el reporte de ventas no cuadra si se pierde una venta que el sistema conoce.
    python3 scripts/asesor/pruebas/test_control_ventas.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import control_ventas as cv

ctl = {"fecha": "2026-10-14",
       "compras": [{"wa_id": "51900000001", "created_at": "2026-10-14 10:00:00", "assigned_agent": "Jennifer", "value": 99, "status": "enviado"},
                   {"wa_id": "51900000002", "created_at": "2026-10-14 12:00:00", "assigned_agent": "Bruce", "value": 99, "status": "fallido"}],
       "pedidos_web": [{"wa_id": "51900000003", "created_at": "2026-10-14 09:00:00"}],
       "pedidos_catalogo": [],
       "compra_otro_dia": [{"wa_id": "51900000004", "ultima_compra": "2026-10-12 11:00:00"}],
       "lineas": [{"linea": 0, "chats_activos": 80}, {"linea": 1, "chats_activos": 2}]}
ok = {"pedidos": [{"whatsapp": "900000001", "estado": "CONFIRMADO"}, {"whatsapp": "+51 900 000 002", "estado": "POR_CONFIRMAR"},
                  {"whatsapp": "51900000003", "estado": "CONFIRMADO"}, {"whatsapp": "51900000004", "estado": "OTRO_DIA"}],
      "lineas_revisadas": [1]}
assert cv.cuadrar(ctl, ok) == [], cv.cuadrar(ctl, ok)
# Se pierde una venta del CRM, una del pedido web y no se declara la otra línea.
p = cv.cuadrar(ctl, {"pedidos": [{"whatsapp": "51900000001", "estado": "CONFIRMADO"}]})
txt = "\n".join(p)
assert "900000002" in txt and "ENVÍO A META FALLIDO" in txt and "900000003" in txt and "900000004" in txt and "línea 1" in txt, txt
# Un motivo vacío en no_cuentan NO explica nada; con motivo sí.
vacio = {"pedidos": ok["pedidos"][:1] + ok["pedidos"][2:], "no_cuentan": [{"whatsapp": "51900000002", "motivo": " "}], "lineas_revisadas": [1]}
assert "900000002" in "\n".join(cv.cuadrar(ctl, vacio))
vacio["no_cuentan"][0]["motivo"] = "Canceló, devolvió el adelanto"
assert cv.cuadrar(ctl, vacio) == [], cv.cuadrar(ctl, vacio)
# Venta confirmada que el CRM no conoce: hay que declararla como sin marcar.
extra = dict(ok, pedidos=ok["pedidos"] + [{"whatsapp": "51900000009", "estado": "CONFIRMADO"}])
assert "900000009" in "\n".join(cv.cuadrar(ctl, extra))
extra["sin_marcar_compra"] = [{"whatsapp": "51900000009", "vendedora": "Bruce", "motivo": "dio dirección"}]
assert cv.cuadrar(ctl, extra) == []
print("OK: el cuadre con el CRM atrapa ventas perdidas, motivos vacíos, ventas sin marcar y otras líneas")
