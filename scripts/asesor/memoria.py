"""
Memoria del asesor: lecciones que el bot anota con evidencia para la próxima
corrida (se leen en contexto.py). Así aprende sin que nadie edite negocio.md.

    ASESOR_CLAVE=... python3 scripts/asesor/memoria.py agregar --tema "objeción precio" \\
        --nota "Ofrecer el amuleto extra cerró 3 de 5 que dijeron 'caro' (22-28/09)" --fuente "director CRO"
    ASESOR_CLAVE=... python3 scripts/asesor/memoria.py retirar --id 4 --fuente "director CRO"
"""
import argparse, json, os, sys, urllib.error, urllib.request

URL = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/memoria"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("accion", choices=["agregar", "retirar"])
    ap.add_argument("--tema")
    ap.add_argument("--nota")
    ap.add_argument("--id", type=int, action="append")
    ap.add_argument("--fuente", default="asesor")
    a = ap.parse_args()
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    if a.accion == "agregar":
        if not a.tema or not a.nota:
            sys.exit("agregar necesita --tema y --nota")
        cuerpo = {"fuente": a.fuente, "agregar": [{"tema": a.tema, "nota": a.nota}]}
    else:
        if not a.id:
            sys.exit("retirar necesita --id")
        cuerpo = {"fuente": a.fuente, "retirar": a.id}
    req = urllib.request.Request(URL, data=json.dumps(cuerpo).encode(), headers={
        "Content-Type": "application/json", "x-asesor-clave": clave,
        "User-Agent": "tarot-asesor/1.0"})  # sin UA propio, Cloudflare corta con 1010
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            print(json.dumps(json.load(r), ensure_ascii=False))
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó la memoria ({err.code}): {err.read().decode()[:300]}")


if __name__ == "__main__":
    main()
