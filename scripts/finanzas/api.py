"""Puerta común de los scripts de finanzas al Worker (x-asesor-clave, variable de entorno ASESOR_CLAVE)."""
import json, os, urllib.error, urllib.parse, urllib.request

BASE = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/finanzas"


def pedir(cuerpo=None, **consulta):
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        raise SystemExit("Falta ASESOR_CLAVE en el entorno.")
    url = BASE + ("?" + urllib.parse.urlencode({k: v for k, v in consulta.items() if v}) if consulta else "")
    req = urllib.request.Request(url, headers={"x-asesor-clave": clave, "User-Agent": "tarot-finanzas/1.0", "Content-Type": "application/json"},
                                 data=json.dumps(cuerpo).encode() if cuerpo is not None else None, method="POST" if cuerpo is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        raise SystemExit(f"El Worker rechazó la petición ({err.code}): {err.read().decode()[:400]}")
