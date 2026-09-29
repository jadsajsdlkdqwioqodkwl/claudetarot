"""
Baja lo que la Routine necesita saber del negocio en vivo y lo junta con
docs/negocio.md en un solo archivo para leer:

    ASESOR_CLAVE=... python3 scripts/asesor/contexto.py --salida /tmp/cro/negocio.md

Incluye las respuestas rápidas vigentes (el texto exacto que usan las
vendedoras) y las sugerencias que siguen pendientes (para no repetirlas).
"""
import argparse, json, os, sys, urllib.error, urllib.request

URL = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/contexto"
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", default="/tmp/asesor/negocio.md")
    a = ap.parse_args()
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    req = urllib.request.Request(URL, headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})  # sin UA propio, Cloudflare corta con 1010
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            datos = json.load(r)
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó la consulta ({err.code}): {err.read().decode()[:300]}")

    partes = [open(os.path.join(RAIZ, "docs", "negocio.md")).read().strip(), "",
              "## Respuestas rápidas vigentes (texto exacto)"]
    for q in datos.get("respuestas_rapidas", []):
        partes += ["", f"### {q['title']}", q["body"].strip()]
    pend = datos.get("sugerencias_pendientes", [])
    partes += ["", f"## Sugerencias que siguen pendientes de aprobar ({len(pend)})",
               "No las repitas; si una ya no sirve, dilo."]
    for s in pend:
        quien = s.get("titulo") if s["tipo"] == "respuesta_rapida" else f"{s.get('nombre') or ''} +{s.get('wa_id') or ''}"
        partes.append(f"- [{s['tipo']}] {quien} ({s.get('origen')}, {s.get('created_at')}): {s['texto'][:160]}")
    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    with open(a.salida, "w") as fh:
        fh.write("\n".join(partes) + "\n")
    print(f"{a.salida}: {len(datos.get('respuestas_rapidas', []))} respuestas rápidas, {len(pend)} sugerencias pendientes")


if __name__ == "__main__":
    main()
