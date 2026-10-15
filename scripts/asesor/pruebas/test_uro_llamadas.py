"""Pruebas de scripts/asesor/uro_llamadas.py con datos inventados (sin red).

    python3 scripts/asesor/pruebas/test_uro_llamadas.py
"""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import uro_llamadas as u


def m(t, quien, msg, vend="", tipo="text", nombre="Ana", asesora=""):
    return {"t": t, "quien": quien, "msg": msg, "vend": vend, "tipo": tipo,
            "nombre": nombre, "anuncio": "", "asesora": asesora, "wa": "51987654321"}


SALUDO = "¡Hola! Quiero más información"
AUTO = "Seguimiento automático"


class Filtro(unittest.TestCase):
    def test_solo_saludo_no_es_candidato(self):
        ms = [m("2026-10-11 09:00:00", "Cliente", SALUDO),
              m("2026-10-11 10:00:00", "Vendedor", "Hola", vend=AUTO)]
        self.assertEqual(u.elegible(ms)[0], "sin_respuesta")

    def test_sticker_solo_es_media_y_no_alta(self):
        ms = [m("2026-10-11 09:00:00", "Cliente", "", tipo="image")]
        clave, resp = u.elegible(ms)
        self.assertIsNone(clave)
        self.assertEqual(u.nivel_interes(resp), "Media")

    def test_pregunta_de_precio_es_alta(self):
        self.assertEqual(u.nivel_interes(["¡Hola! Quiero más información precio"]), "Alta")

    def test_zona_es_alta(self):
        self.assertEqual(u.nivel_interes(["PROVINCIA"]), "Alta")

    def test_pidio_que_no_lo_escriban(self):
        ms = [m("2026-10-11 09:00:00", "Cliente", "Por favor no me escriban más")]
        self.assertEqual(u.elegible(ms)[0], "no_llamar")

    def test_anuncio_pegado_no_cuenta(self):
        ms = [m("2026-10-11 09:00:00", "Cliente", "Hola.\nURO, tu aliada para una flora íntima saludable")]
        self.assertEqual(u.elegible(ms)[0], "sin_respuesta")

    def test_telefono_para_marcar(self):
        self.assertEqual(u.telefono("51987654321"), "+51 987 654 321")


class Preparar(unittest.TestCase):
    def test_omite_ya_procesado_sin_mensaje_nuevo(self):
        filas = [m("2026-10-11 09:00:00", "Cliente", "Cuánto cuesta?")]
        filas = [dict(f, wa="51987654321") for f in filas]
        ya = {"51987654321": {"version": 3, "ultimo_cliente": "2026-10-11 09:00:00"}}
        s = u.preparar(filas, ya)
        self.assertEqual(s["candidatos"], [])
        self.assertEqual(s["omitidos"]["ya_procesados"], 1)

    def test_mensaje_nuevo_del_cliente_vuelve_a_salir(self):
        filas = [dict(f, wa="51987654321") for f in [
            m("2026-10-11 09:00:00", "Cliente", "Cuánto cuesta?"),
            m("2026-10-11 12:00:00", "Cliente", "Y envían a Piura?")]]
        ya = {"51987654321": {"version": 3, "ultimo_cliente": "2026-10-11 09:00:00"}}
        s = u.preparar(filas, ya)
        self.assertEqual(len(s["candidatos"]), 1)
        self.assertEqual(s["candidatos"][0]["version"], 3)

    def test_pedido_mencionado_ignora_automaticos(self):
        filas = [dict(f, wa="51987654321") for f in [
            m("2026-10-11 09:00:00", "Cliente", "Precio"),
            m("2026-10-11 09:05:00", "Vendedor", "Le enviamos el pedido", vend=AUTO)]]
        self.assertFalse(u.preparar(filas, {})["candidatos"][0]["pedido_mencionado"])


class Armar(unittest.TestCase):
    cand = {"candidatos": [{"wa": "51987654321", "telefono": "+51 987 654 321", "nombre": "Ana",
                            "interes": "Alta", "primer_contacto": "a", "ultimo_cliente": "b",
                            "version": None, "anuncio": "", "asesora": "", "pedido_mencionado": False}]}

    def test_cliente_nuevo_es_set_con_check_en_falso(self):
        llam = [{"wa": "51987654321", "resumen": "Preguntó precio.", "speech": "Buenos días, le llamo de URO."}]
        problemas, writes = u.armar(self.cand, llam, {})
        self.assertEqual(problemas, [])
        self.assertEqual(writes[0]["op"], "set")
        self.assertFalse(writes[0]["data"]["llamada"])

    def test_existente_es_update_sin_tocar_el_check(self):
        cand = {"candidatos": [dict(self.cand["candidatos"][0], version=4)]}
        llam = [{"wa": "51987654321", "resumen": "Volvió a escribir.", "speech": "Buenos días, le llamo de URO."}]
        _, writes = u.armar(cand, llam, {"51987654321": {"version": 4}})
        self.assertEqual(writes[0]["op"], "update")
        self.assertEqual(writes[0]["if_version"], 4)
        self.assertNotIn("llamada", writes[0]["data"])

    def test_bloquea_promesa_de_salud(self):
        llam = [{"wa": "51987654321", "resumen": "Dudas.", "speech": "Le aseguro que URO cura la candidiasis."}]
        problemas, writes = u.armar(self.cand, llam, {})
        self.assertTrue(problemas)
        self.assertEqual(writes, [])

    def test_wa_fuera_de_candidatos_no_pasa(self):
        llam = [{"wa": "51900000000", "resumen": "x", "speech": "y"}]
        problemas, _ = u.armar(self.cand, llam, {})
        self.assertTrue(any("no está en los candidatos" in p for p in problemas))


class LeerYa(unittest.TestCase):
    def test_acepta_lista_de_artifactdata(self):
        import json, tempfile
        datos = {"documents": [{"doc_id": "51987654321", "version": 2,
                                "data": {"ultimo_cliente": "2026-10-11 09:00:00"}}]}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(datos, f)
        ya = u.leer_ya(f.name)
        os.unlink(f.name)
        self.assertEqual(ya["51987654321"]["version"], 2)


    def test_acepta_carpeta_de_out_dir(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "llamadas"))
            with open(os.path.join(d, "llamadas", "51987654321.json"), "w", encoding="utf-8") as f:
                json.dump({"id": "51987654321", "version": 5,
                           "data": {"ultimo_cliente": "2026-10-11 09:00:00"}}, f)
            ya = u.leer_ya(d)
        self.assertEqual(ya["51987654321"], {"version": 5, "ultimo_cliente": "2026-10-11 09:00:00"})


if __name__ == "__main__":
    unittest.main()
