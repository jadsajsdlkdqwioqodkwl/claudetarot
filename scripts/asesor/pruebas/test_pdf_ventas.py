"""Prueba: el reporte de ventas sale como PDF con tablas (mismo formato que el de pedidos).
    python3 scripts/asesor/pruebas/test_pdf_ventas.py"""
import json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import enviar, pdfplumber

aqui = os.path.dirname(os.path.abspath(__file__))
datos = json.load(open(os.path.join(aqui, "ventas_demo.json")))
with tempfile.TemporaryDirectory() as d:
    pdf, kits = enviar.armar_pdf(dict(datos), d)
    assert pdf.endswith("ventas-2026-10-14-2100.pdf"), pdf
    html = open(os.path.join(d, "pedidos.html")).read()
    assert html.count("<table>") >= 3, "faltan tablas"
    assert "Ventas por vendedora" in html and "Reporte de ventas · 21:00 2026-10-14" in html
    assert "✅ Lima — confirmados (2)" in html and "✅ Provincia — confirmados (1)" in html
    assert "Por confirmar" in html and "cajas" in html
    with pdfplumber.open(pdf) as doc:
        assert doc.pages[0].width > doc.pages[0].height, "debe ser A4 horizontal"
        assert sum(len(p.find_tables()) for p in doc.pages) >= 3, "el PDF no tiene tablas"
        txt = "\n".join(p.extract_text() or "" for p in doc.pages)
    assert "Jennifer" in txt and "despachar" in txt and kits == 4, kits
    assert "Agendadas otro día" in html and "TOTAL" in html, "falta la fila TOTAL o la columna de otros días"
    # Venta sin marcar como compra: sale arriba, en rojo, con el asesor que la olvidó.
    con = dict(datos, sin_marcar_compra=[{"whatsapp": "51999111222", "vendedora": "Bruce", "motivo": "Mandó su dirección en Lima"}])
    enviar.armar_pdf(con, d)
    h2 = open(os.path.join(d, "pedidos.html")).read()
    assert "META NO SE ENTERÓ" in h2 and "Bruce" in h2 and h2.index("META NO SE ENTERÓ") < h2.index("Ventas por vendedora")
    enviar.armar_pdf(dict(datos), d)
    assert "META NO SE ENTERÓ" not in open(os.path.join(d, "pedidos.html")).read()
    # Un pedido sin vendedora NO sale a medias.
    malo = json.loads(json.dumps(datos)); malo["pedidos"][0].pop("vendedora")
    try:
        enviar.armar_pdf(malo, d); raise AssertionError("debió rechazar el pedido sin vendedora")
    except SystemExit as err:
        assert "vendedora" in str(err)
    # El formato de pedidos (10:30) sigue igual.
    p2, _ = enviar.armar_pdf({k: v for k, v in datos.items() if k not in ("tipo_reporte", "hora")}, d)
    assert p2.endswith("pedidos-2026-10-14.pdf")
    assert "despacho del 2026-10-14" in open(os.path.join(d, "pedidos.html")).read()
print("OK: PDF de ventas con tablas y PDF de pedidos intactos")
