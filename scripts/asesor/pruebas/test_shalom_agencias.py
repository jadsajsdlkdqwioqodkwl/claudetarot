"""Agencias de Shalom: una sola función decide (`elegir_agencia`), el Excel solo lleva destinos de la plantilla que reciben
envíos, y la revisión y el masivo dicen lo mismo. Sin red: usa `data/shalom-agencias.json` y un caché de OSM de ejemplo.
    python3 scripts/asesor/pruebas/test_shalom_agencias.py
"""
import os, sys, tempfile

os.environ["SHALOM_SIN_RED"] = "1"
os.environ.pop("ASESOR_CLAVE", None)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import shalom as sh

ag = sh.cargar()["agencias"]
destinos = sh.plantilla_destinos()
assert len(destinos) == 489 and len(set(destinos)) == 489 and all(x == x.strip() for x in destinos), "Hoja2!C: 489 nombres únicos, sin espacios al borde"

# 1. Los nombres de la API con espacios de más se escriben EXACTAMENTE como en la plantilla.
for crudo in ("HUANCARO ", "OVALO PUENTE PIEDRA ", "AV  BOLIVAR ", "PUNTA HERMOSA ", "URB SANTA ELVIRA ", "HUAYCAN AV HORACIO ZEVALLOS  ", "AV MALECON  CHECA CDRA. 1 ", "AV  NICOLAS DUEÑAS CDRA. 5 "):
    assert sh.nombre_plantilla(crudo) in destinos, crudo
assert sh.nombre_plantilla("AGENCIA QUE NO EXISTE") is None

# 2. Solo agencias que reciben (destino = 1): AV. HUAYRUROPATA (Wanchaq) no recibe y nunca se elige.
assert not any(str(a.get("destino")) != "1" for a in sh.buscar("Av Huayruropata Wanchaq Cusco", 20)), "buscar no devuelve agencias que no reciben"
e = sh.elegir_agencia("Av Huayruropata Wanchaq Cusco")
assert e["confianza"] == "dudosa" and "NO recibe" in e["porque"], e
for t in ("Shalom Cusco", "Shalom Arequipa", "Shalom Trujillo centro", "Juliaca", "Shalom Piura"):
    x = sh.elegir_agencia(t)
    assert not x["agencia"] or any(sh.nombre_plantilla(a["agencia"]) == x["agencia"] and sh.recibe(a) for a in ag), t

# 3. Casos reales.
def caso(texto, agencia, confianza, **kw):
    x = sh.elegir_agencia({"direccion_o_agencia": texto, **{k: v for k, v in kw.items() if k == "whatsapp"}}, confirmadas=kw.get("confirmadas", {}), osm_cache=kw.get("osm"))
    assert (x["agencia"], x["confianza"]) == (agencia, confianza), (texto, x["agencia"], x["confianza"], x["porque"])
    assert not x["segura"] or x["agencia"] in destinos
    return x

caso("Shalom Av. Pachacutec 429, Wanchaq, Cusco", "AV PACHACUTEC", "segura")                       # Wanchaq del 12/11 (Nadia)
x = caso("Shalom Wanchaq, Av. Pachacútec, Cusco (eligió esa sede entre 3; confirmar la sede exacta)", "AV PACHACUTEC", "dudosa")  # Daniela: «confirmar»
assert len(x["candidatas"]) == 2, "Wanchaq: 3 agencias que reciben (la elegida + 2 candidatas)"
caso("Av. Mariscal Castilla, Mollendo", "MOLLENDO CO", "segura")                                       # no la de Huancayo
caso("Sachaca, Arequipa", "VARIANTE UCHUMAYO CO", "segura")
caso("Shalom Huancaro Cusco", "HUANCARO", "segura")                                                    # una de las 8 con espacios; agencia de barrio
caso("Shalom Las Mercedes, Juliaca", "LAS MERCEDES", "segura")                                         # agencia de barrio, no la central
caso("Shalom Talara, agencia Parque 22", "TALARA BAJA PARQUE 22", "segura")
caso("Shalom Ilo, Jr. Callao", "ILO PUERTO", "segura")                                                 # no una del Callao
x = sh.elegir_agencia("Shalom Arequipa")
assert x["confianza"] == "dudosa" and len(x["candidatas"]) >= 3, "ciudad con varias agencias y sin referencia: dudosa"
x = sh.elegir_agencia("Shalom Av. Sáenz Peña, Pucallpa (Callería, Coronel Portillo, Ucayali)")
assert x.get("sin_servicio") and not x["segura"] and not x["agencia"] and x.get("lugar") == "Pucallpa", x

# 4. Triangulación con OpenStreetMap (caché de ejemplo, sin red): «al lado del mercado» en Tumbes.
tumbes = [a for a in ag if a["provincia"] == "TUMBES" and sh.recibe(a) and a.get("lat")]
assert len(tumbes) >= 3
cerca = tumbes[0]
osm = {"al lado del mercado, tumbes, tumbes, perú": {"hits": [{"lat": float(cerca["lat"]) + 0.0005, "lng": float(cerca["lng"]), "nombre": "Mercado Modelo, Tumbes"}]}}
x = sh.elegir_agencia("Shalom de Tumbes, al lado del mercado", confirmadas={}, osm_cache=osm)
otros = sorted(sh.metros(float(cerca["lat"]) + 0.0005, cerca["lng"], a["lat"], a["lng"]) for a in tumbes if a is not cerca)
if otros[0] >= 300:  # la siguiente queda a más del doble: segura por distancia
    assert x["confianza"] == "segura" and x["agencia"] == sh.nombre_plantilla(cerca["agencia"]) and "OpenStreetMap" in x["porque"], x
else:
    assert x["confianza"] == "dudosa", x
x = sh.elegir_agencia("Shalom de Tumbes, al lado del mercado", confirmadas={}, osm_cache={})
assert x["confianza"] == "dudosa" and "OpenStreetMap no encontró" in x["porque"], "sin punto de OSM no se inventa"
assert sh.metros(-12.0, -77.0, -12.0, -77.001) in range(100, 115)

# 5. Lo que una persona confirmó manda, y las notas de la revisión se entienden.
x = sh.elegir_agencia({"whatsapp": "51999000111", "direccion_o_agencia": "Shalom Arequipa"}, confirmadas={"999000111": {"agencia": "AV PARRA 379", "quien": "Jennifer"}})
assert (x["agencia"], x["confianza"], x["segura"]) == ("AV PARRA 379", "confirmada", True)
f, _ = sh.agencia_de_nota("agencia Av Parra 379", {"codigo": "AREQUIPA / AREQUIPA / AREQUIPA / AEROPUERTO AREQUIPA"})
assert f and f["agencia"] == "AV PARRA 379"
f, porque = sh.agencia_de_nota("agencia la del centro", {"codigo": "AREQUIPA / AREQUIPA / AREQUIPA / AV PARRA 379"})
assert f is None and porque, "una nota que no calza con UNA agencia no se adivina"

# 6. El Excel: ninguna fila con destino fuera de Hoja2!C ni de una agencia que no recibe; la referencia coincide celda por celda.
import openpyxl
with tempfile.TemporaryDirectory() as d:
    pedidos = [{"nombre": "Uno", "whatsapp": "51911111111", "dni": "12345678", "direccion_o_agencia": "Shalom Huancaro Cusco"},
               {"nombre": "Dos", "whatsapp": "51922222222", "dni": "007652553", "direccion_o_agencia": "Shalom Av. Pachacutec 429, Wanchaq, Cusco", "kits": 3}]
    filas, ref_filas = [], []
    for p in pedidos:
        e = sh.elegir_agencia(p, confirmadas={})
        assert e["segura"]
        merc = "PAQUETE XS" if int(p.get("kits") or 1) >= 2 else "PAQUETE XXS"
        filas.append({"dni": p["dni"], "tel": p["whatsapp"][-9:], "origen": sh.ORIGEN, "destino": e["agencia"], "mercaderia": merc, "cantidad": 1})
        ref_filas.append((len(filas) + 1, p["dni"], e["agencia"], merc, p["whatsapp"][-9:]))
    excel, ref = os.path.join(d, "m.xlsx"), os.path.join(d, "m-referencia.xlsx")
    sh.llenar_plantilla(filas, excel)
    wb = openpyxl.Workbook(); h = wb.active
    h.append(["Fila Excel", "Despacho", "Nombre", "WhatsApp", "DNI", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "DESTINO en el Excel (columna G, texto exacto)", "Dirección de la agencia", "Por qué esa agencia", "Mercadería", "Celular en el Excel"])
    for n, dni, g, merc, tel in ref_filas:
        h.append([n, "", "", "", dni, "", "", "", "", "", "", "", "", "", "", g, "", "", merc, tel])
    wb.save(ref)
    assert sh.verificar_excel(excel, ref) == [], sh.verificar_excel(excel, ref)
    g = [r[6] for r in openpyxl.load_workbook(excel)["Hoja1"].iter_rows(min_row=2, max_row=3, values_only=True)]
    assert g == ["HUANCARO", "AV PACHACUTEC"] and all(x in destinos for x in g), g
    # Un destino con el espacio de más de la API (lo que pasaba antes) se detecta.
    sh.llenar_plantilla([dict(filas[0], destino="HUANCARO ")], excel)
    assert any("no está en Hoja2" in x for x in sh.verificar_excel(excel, ref))

# 7. La revisión de envíos y el masivo usan la MISMA función: mismo pedido, misma agencia.
import importlib
dn = importlib.import_module("dinsides")
p = {"nombre": "Nadia", "whatsapp": "51989699751", "dni": "23992196", "direccion_o_agencia": "Shalom Av. Pachacutec 429, Wanchaq, Cusco", "_origen": "prueba"}
bloque = dn._bloque_shalom(1, p, [], {}, corto=True)
assert "Destino: AV PACHACUTEC · SEGURA" in bloque and "AV. PACHACUTEC 429" in bloque and p["_agencia"]["agencia"] == sh.elegir_agencia(p)["agencia"], bloque

# 8. La recomendación a la asesora: motivo con lo que dijo el cliente, candidatas y el paso de la captura; texto de usted, una pregunta.
e = sh.elegir_agencia("Shalom Arequipa")
r = sh.recomendacion_de({"direccion_o_agencia": "Shalom Arequipa"}, e)
assert "Shalom Arequipa" in r["motivo"] and "shalom.com.pe/agencias" in r["motivo"] and "provincia AREQUIPA" in r["motivo"] and r["texto"].count("?") == 1 and "Arequipa" in r["texto"]
assert not [w for w in r["texto"].split() if len(w) >= 5 and w.isupper()], "el texto para el cliente no lleva palabras en mayúsculas"
print("OK: agencias de Shalom (plantilla, destino=1, elegir_agencia, triangulación, confirmadas, Excel, revisión = masivo, recomendación)")
