"""Prueba: el reporte unificado «Pedidos y ventas» (2026-11-02) sale como PDF con ventas por vendedora, por verificar,
agenda pendiente de la hoja, descartados con motivo y lo que el CRM no explica; y nada se pierde por un estado raro.
    python3 scripts/asesor/pruebas/test_pdf_unificado.py"""
import json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import enviar

aqui = os.path.dirname(os.path.abspath(__file__))
base = json.load(open(os.path.join(aqui, "ventas_demo.json")))
datos = dict(base, tipo_reporte="unificado", hora="22:30", fecha_venta="2026-10-14", fecha_objetivo="2026-10-15",
             origen="pedidos y ventas 22:30 (MUESTRA)")
datos["pedidos"] = json.loads(json.dumps(base["pedidos"])) + [
    {"nombre": "Verificar Demo", "whatsapp": "51900000006", "estado": "POR_VERIFICAR", "destino": "PROVINCIA", "vendedora": "Jennifer",
     "nota": "dijo que yapeó pero no hay captura"},
    {"nombre": "Sin Destino Demo", "whatsapp": "51900000007", "estado": "CONFIRMADO", "nota": "mandó ubicación en imagen"},
    {"nombre": "Lunes Lima Demo", "whatsapp": "51900000008", "estado": "CONFIRMADO", "destino": "LIMA", "vendedora": "Danitza",
     "direccion_o_agencia": "Av. Demo 1", "fecha_entrega": "2026-10-20", "nota": "pide para el lunes"},
    {"nombre": "No Es Demo", "whatsapp": "51900000009", "estado": "DESCARTADO", "destino": "LIMA", "motivo": "preguntó precio y no siguió"},
]
# fecha_entrega del CONFIRMADO Lima de la muestra es la fecha objetivo (2026-10-15): se queda confirmado.
avisos = enviar.normalizar_unificado(datos)
est = {p["whatsapp"]: p for p in datos["pedidos"]}
assert est["51900000006"]["estado"] == "POR_CONFIRMAR", "POR_VERIFICAR es sinónimo de POR_CONFIRMAR"
assert est["51900000007"]["estado"] == "POR_CONFIRMAR" and est["51900000007"]["vendedora"] == "(sin vendedora)", "sin destino no se pierde: va a verificar"
assert est["51900000008"]["estado"] == "OTRO_DIA" and est["51900000008"]["fecha_entrega"] == "2026-10-20", "Lima con entrega otro día pasa a OTRO_DIA"
assert "51900000009" not in est and datos["descartados"][0]["motivo"] == "preguntó precio y no siguió", "DESCARTADO va a descartados con motivo"
assert est["51900000001"]["estado"] == "CONFIRMADO"
assert len(avisos) == 2, avisos

datos["agenda_pendiente"] = {"atrasados": [{"fila": 7, "fecha_entrega": "2026-10-12", "nombre": "Katia Demo", "whatsapp": "51942000000",
                                            "destino": "LIMA", "estado": "CONFIRMADO / AGENDADO", "kits": "1", "nota": "paga con tarjeta"}],
                             "hoy": [], "futuros": [{"fila": 9, "fecha_entrega": "2026-11-02", "nombre": "Futuro Demo", "whatsapp": "51943000000",
                                                     "destino": "PROVINCIA", "estado": "CONFIRMADO", "kits": "2", "nota": ""},
                                                    {"fila": 10, "fecha_entrega": "2026-10-16", "nombre": "Otro Dia Demo", "whatsapp": "51900000005",
                                                     "destino": "LIMA", "estado": "OTRO_DIA", "kits": "1", "nota": ""}], "sin_fecha": []}
datos["sin_explicar"] = ["- 51955555555: el sistema lo conoce (compra en el CRM 20:10 (Jennifer, S/89)) y NO está en `pedidos` ni en `no_cuentan` con motivo."]
with tempfile.TemporaryDirectory() as d:
    pdf, kits = enviar.armar_pdf(dict(datos), d)
    assert pdf.endswith("pedidos-y-ventas-2026-10-15-2230.pdf"), pdf
    html = open(os.path.join(d, "pedidos.html")).read()
    assert "Pedidos y ventas · 22:30 · ventas del 2026-10-14 · despacho del 2026-10-15" in html
    assert "Ventas por vendedora" in html and "✅ Lima — confirmados (2)" in html and "✅ Provincia — confirmados (1)" in html
    assert "POR VERIFICAR — huele a venta" in html and "Verificar Demo" in html and "Sin Destino Demo" in html
    assert "📅 Otros días (2)" in html, "el OTRO_DIA de la muestra + el Lima movido"
    assert "AGENDA PENDIENTE" in html and "Katia Demo" in html and "ATRASADO" in html and "Futuro Demo" in html
    assert html.count("Otro Dia Demo") == 1, "un pedido que ya está en el reporte no se repite en la agenda (salvo atrasado)"
    assert "Descartados con motivo" in html and "No Es Demo" in html and "preguntó precio y no siguió" in html
    assert "EL CRM TIENE COMO VENTA Y EL REPORTE NO LO EXPLICA" in html and "51955555555" in html
    assert html.index("NO LO EXPLICA") < html.index("Ventas por vendedora"), "lo que el CRM no explica va arriba del todo"
    assert kits == 4, kits
    # El PDF de ventas y el de pedidos siguen igual.
    p2, _ = enviar.armar_pdf(dict(base), d)
    assert p2.endswith("ventas-2026-10-14-2100.pdf")
    h2 = open(os.path.join(d, "pedidos.html")).read()
    assert "AGENDA PENDIENTE" not in h2 and "Por confirmar (1)" in h2 and "huele a venta" not in h2
print("OK: PDF unificado de pedidos y ventas; ventas y pedidos intactos")
