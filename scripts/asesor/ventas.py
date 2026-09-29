"""
Registra ventas de provincia y sus boletas de Shalom en la pestaña Ventas,
por el Worker (/api/asesor/ventas). Lo usan las Routines del asesor.

    ASESOR_CLAVE=... python3 scripts/asesor/ventas.py crear --dni 71573804 --celular 949480144 --adelanto 20 --saldo 69
        → imprime el link de seguimiento (si el DNI ya tenía venta abierta, devuelve la misma)
    ... boleta --imagen boleta.jpg --dni 71573804 [--orden 96236337] [--cod TT97] [--clave 3114]
        → cuelga la foto en la página del cliente y la pone "En camino"
    ... estado --dni 71573804 --estado "En destino"      (Pendiente, En camino, En destino, Pagado, Cancelado)
"""
import argparse, base64, json, os, sys, urllib.error, urllib.request

URL = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/ventas"


def llamar(cuerpo):
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    req = urllib.request.Request(URL, data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json", "x-asesor-clave": clave,
                                          # Cloudflare corta (error 1010) el User-Agent por defecto de Python.
                                          "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        return {"error": f"{err.code}: {err.read().decode()[:300]}"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("accion", choices=["crear", "boleta", "estado"])
    for campo in ("dni", "celular", "codigo", "adelanto", "saldo", "clave", "notas", "orden", "cod", "estado", "imagen"):
        ap.add_argument(f"--{campo}")
    ap.add_argument("--envio", default="Shalom")
    a = ap.parse_args()
    cuerpo = {"accion": a.accion, "dni": a.dni, "codigo": a.codigo}
    if a.accion == "crear":
        cuerpo.update(celular=a.celular, envio=a.envio, adelanto=a.adelanto, saldo=a.saldo, clave=a.clave, notas=a.notas)
    if a.accion == "boleta":
        if not a.imagen:
            sys.exit("Falta --imagen")
        ext = a.imagen.lower().rsplit(".", 1)[-1]
        cuerpo.update(imagen_base64=base64.b64encode(open(a.imagen, "rb").read()).decode(),
                      mime={"png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg"),
                      orden=a.orden, cod_shalom=a.cod, clave=a.clave, estado=a.estado)
    if a.accion == "estado":
        cuerpo.update(estado=a.estado, clave=a.clave)
    print(json.dumps(llamar({k: v for k, v in cuerpo.items() if v not in (None, "")}), ensure_ascii=False))


if __name__ == "__main__":
    main()
