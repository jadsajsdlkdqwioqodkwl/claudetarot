#!/usr/bin/env python3
"""
Baja el mapa de cobertura de Dinsides (Google My Maps) y lo pasa a src/lib/dinsides-cobertura.js.

    python3 scripts/dinsides-cobertura.py            # baja el KML y reescribe src/lib/dinsides-cobertura.js
    python3 scripts/dinsides-cobertura.py archivo.kml # usa un KML ya bajado

El mapa lo mantiene Dinsides («MAPA ZONA DE COBERTURA GENERAL»): polígonos con el nombre del distrito (zona de
entrega), zonas rojas / sin entregas / «no llegamos» (sin reparto: hay que coordinar punto de encuentro) y
puntos de encuentro. `zonaDe(lat, lng)` en src/lib/dinsides.js usa este archivo para decir en qué zona cae el
pin que mandó un cliente. Se vuelve a correr cuando Dinsides cambie el mapa (no hace falta tocar nada más).
"""
import json, os, re, sys, unicodedata, urllib.request

MID = "1ybY_sWYIA0Am6u-NvSg55xPo91dSVHY"
URL = f"https://www.google.com/maps/d/kml?mid={MID}&forcekml=1"
SALIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "lib", "dinsides-cobertura.js")

# Nombres del mapa que no coinciden con la clave del desplegable de Dinsides (src/lib/dinsides.js → DISTRITOS).
MAPA = {
    "bellavista - callao": "bellavista", "carmen de la legua - callao": "carmen de la legua reynoso",
    "la perla - callao": "la perla", "el marquez": "el marquez - callao", "marquez con punto de encuentro": "el marquez - callao",
    "cieneguilla hasta los toros del escultor": "cieneguilla", "magdalena": "magdalena del mar",
    "jicamarca": "jicamarca - anexo 22", "jicamarca anexo 8": "jicamarca - anexo 8",
    "zona de entrega callao": "callao", "zona de entregas callao": "callao", "zona de entregas": None,
}
NO_ENTREGA = ("zona roja", "zona de no entrega", "zona sin entrega", "no llegamos", "zonaq roja", "zona cerro", "poligono 20")
PUNTO = ("punto de encuentro", "puntos de encuentro", "zona de punto de encuentro")


def norm(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\s*-\s*", " - ", s)
    return re.sub(r"\s+", " ", s).strip()


def main():
    if len(sys.argv) > 1:
        kml = open(sys.argv[1], encoding="utf-8").read()
    else:
        kml = urllib.request.urlopen(URL, timeout=60).read().decode("utf-8")
    poligonos, puntos = [], []
    for p in re.findall(r"<Placemark>(.*?)</Placemark>", kml, re.S):
        nombre = re.search(r"<name>([^<]*)</name>", p).group(1).strip()
        d = re.search(r"<description><!\[CDATA\[(.*?)\]\]></description>", p, re.S)
        nota = re.sub("<[^>]+>", " ", d.group(1)).replace("\xa0", " ").strip() if d else ""
        nota = re.sub(r"\s+", " ", nota) or None
        if "<Polygon>" in p:
            coords = re.search(r"<outerBoundaryIs>.*?<coordinates>(.*?)</coordinates>", p, re.S).group(1).split()
            anillo = [[round(float(c.split(",")[1]), 4), round(float(c.split(",")[0]), 4)] for c in coords]
            n = norm(nombre)
            if any(n.startswith(x) for x in NO_ENTREGA) or n == "gamarra":
                clase, distrito = "no_entrega", ("gamarra" if n == "gamarra" else None)
            elif any(n.startswith(x) for x in PUNTO):
                clase, distrito = "punto_encuentro", None
            else:
                clase, distrito = "entrega", MAPA.get(n, n)
            poligonos.append({"nombre": nombre, "clase": clase, "distrito": distrito, "nota": nota, "anillo": anillo})
        elif "<Point>" in p:
            c = re.search(r"<coordinates>(.*?)</coordinates>", p, re.S).group(1).strip().split(",")
            puntos.append({"nombre": nombre, "nota": nota, "lat": round(float(c[1]), 5), "lng": round(float(c[0]), 5)})
    datos = {"fuente": f"Google My Maps «MAPA ZONA DE COBERTURA GENERAL» (mid={MID})", "poligonos": poligonos, "puntos": puntos}
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write("// Mapa de cobertura de Dinsides (Google My Maps «MAPA ZONA DE COBERTURA GENERAL», mid=" + MID + "),\n")
        f.write("// pasado a JSON por scripts/dinsides-cobertura.py. Anillos en [lat, lng] con 4 decimales.\n")
        f.write("// clase: entrega (polígono con nombre de distrito) · no_entrega (zona roja / sin entregas / no llegamos) · punto_encuentro.\n")
        f.write("export default " + json.dumps(datos, ensure_ascii=False, separators=(",", ":")) + ";\n")
    clases = {}
    for p in poligonos:
        clases[p["clase"]] = clases.get(p["clase"], 0) + 1
    print(json.dumps({"poligonos": len(poligonos), "puntos": len(puntos), "clases": clases, "salida": os.path.relpath(SALIDA)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
