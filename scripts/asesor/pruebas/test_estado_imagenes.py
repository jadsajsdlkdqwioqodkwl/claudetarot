"""Prueba: el estado del día se fusiona sin perder ventas y las imágenes se eligen bien.
    python3 scripts/asesor/pruebas/test_estado_imagenes.py"""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import ventas_estado as ve, imagenes

previo = {"fecha_objetivo": "2026-10-14", "corte": "2026-10-15T03:00:00+00:00",
          "pedidos": [{"whatsapp": "51900000001", "nombre": "Ana", "estado": "POR_CONFIRMAR", "vendedora": "Jennifer", "destino": "PROVINCIA"},
                      {"whatsapp": "51900000002", "nombre": "Beto", "estado": "CONFIRMADO", "vendedora": "Danitza", "destino": "LIMA"}],
          "incidencias": ["Cliente X pide cambio"], "no_cuentan": [{"whatsapp": "51900000009", "motivo": "compra del 12"}]}
nuevo = {"fecha_objetivo": "2026-10-14", "hora": "23:00",
         "pedidos": [{"whatsapp": "+51 900 000 001", "estado": "CONFIRMADO", "nota": "mandó captura S/20"},
                     {"whatsapp": "51900000003", "nombre": "Cami", "estado": "CONFIRMADO", "vendedora": "Fandio", "destino": "LIMA"}],
         "incidencias": ["Cliente X pide cambio", "Cliente Y reclama boleta"]}
m = ve.fusionar(previo, nuevo)
por = {ve.n9(p["whatsapp"]): p for p in m["pedidos"]}
assert len(m["pedidos"]) == 3, m["pedidos"]
assert por["900000001"]["estado"] == "CONFIRMADO" and por["900000001"]["vendedora"] == "Jennifer" and por["900000001"]["nombre"] == "Ana", "lo nuevo manda pero no borra lo viejo"
assert "900000002" in por and "900000003" in por, "ninguna venta se pierde"
assert m["incidencias"] == ["Cliente X pide cambio", "Cliente Y reclama boleta"] and m["no_cuentan"] == previo["no_cuentan"]
assert m["hora"] == "23:00"
assert ve.fusionar(None, nuevo) == nuevo

with tempfile.TemporaryDirectory() as d:
    open(os.path.join(d, "chats_01.txt"), "w", encoding="utf-8").write(
        "=== 51917324432 | Fredy | último: equipo\n"
        "10-13 06:10 V(Jennifer): Le envío algunas referencias. El yape para el adelanto sería a 927633099\n"
        "10-13 10:51 C: [imagen#4501]\n"
        "10-13 10:54 V(Jennifer): Muchas gracias, ahora sus datos\n"
        "10-13 10:55 C: [imagen#4502] mi dni\n\n"
        "=== 51999850974 | Monica | último: cliente\n"
        "10-13 09:00 V(auto: Seguimiento automático): hola ¿sigue interesado? mándame tu captura\n"
        "10-13 09:05 C: [imagen#4600]\n")
    c = imagenes.candidatas(d)
    assert sorted(x[2] for x in c) == [4501, 4502, 4600] and c[0][2] == 4501, c
    assert c[0][0] == 0 and c[1][0] == 1 and c[2][0] == 1, "solo la que sigue a un pedido de captura de una PERSONA es prioritaria"
print("OK: el estado se fusiona sin perder ventas y las imágenes se priorizan")
