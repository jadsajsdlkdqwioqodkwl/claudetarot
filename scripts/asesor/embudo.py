"""
Embudo de ventas por WhatsApp, calculado sin IA, para el informe CRO diario.

    python3 scripts/asesor/embudo.py chats.xlsx --dias 7 --salida /tmp/cro
    ASESOR_CLAVE=... python3 scripts/asesor/embudo.py api --dias 7 --salida /tmp/cro

Escribe /tmp/cro/embudo.json (números), /tmp/cro/perdidos.txt (transcripciones
cortas de los chats que llegaron lejos y no cerraron: ahí están las objeciones)
y /tmp/cro/sin_respuesta.txt (clientes que escribieron algo más que el saludo y
a los que ninguna persona contestó: la fuga más barata de tapar).

Etapas, por chat (la más alta a la que llegó):
  1 escribió            el cliente escribió (aunque sea el saludo del anuncio)
  2 conversó            escribió algo más que el saludo
  3 dijo destino        dijo Lima/distrito o provincia/ciudad (o la vendedora ya le dio la opción de envío)
  4 le pidieron cierre  la vendedora pidió ubicación (Lima) o adelanto (provincia)
  5 cerró               dio dirección y quedó agendado, o mandó adelanto + datos / comprobante

Además: tiempo a la primera respuesta humana, conversión por anuncio, por
vendedora y por "apertura" (el primer mensaje humano, que es la plantilla o
respuesta rápida que usó), y objeciones frecuentes por palabras clave.
"""
import argparse, datetime as dt, json, os, re, sys
from collections import Counter, OrderedDict, defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from preparar import leer_filas, RE_AUTO, RE_SALUDO  # noqa: E402

RE_DESTINO = re.compile(r"lima|provincia|para (lima|provincia)|le podemos enviar mediante|para .{3,25} le podemos hacer envio", re.I)
RE_PIDE_CIERRE = re.compile(r"ubicaci[oó]n|qui[eé]n lo va a recibir|confirma(r)? (el|la) (pago|captura|adelanto)|adelanto", re.I)
RE_ARCHIVO = re.compile(r"^(WhatsApp (Image|Video)|IMG[-_]|VID[-_]).*\.(jpe?g|png|mp4|webp)$", re.I)
RE_CERRO = re.compile(r"queda(do)? (todo )?agendad|le estamos enviando el comprobante|le env[ií]o el comprobante|su clave es|mañana mismo le estamos enviando", re.I)
OBJECIONES = {
    "precio / caro": r"caro|descuento|rebaja|menos|79|precio real",
    "desconfianza / estafa": r"legal|estafa|confiable|seguro|investigar|perd[ií] (muchos )?adelantos|garant",
    "no quiere adelanto": r"contra ?entrega|sin adelanto|no tengo yape|cuenta (en el )?banco",
    "horario / no está en casa": r"no (estar[eé]|voy a estar)|no hay nadie|horario|trabajo|de \d+ a \d+",
    "lo piensa / otro día": r"lo pensar|te aviso|le aviso|m[aá]s adelante|pr[oó]xima semana|fin de mes|octubre|me pagan",
    "material / calidad": r"material|plastific|hilo|dura|calidad",
    "cómo se lee / manual": r"manual|instruc|c[oó]mo se lee|significad|video",
}


def minutos(t):
    return dt.datetime.strptime(t[:16], "%Y-%m-%d %H:%M").timestamp() / 60


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", help='el .xlsx de la hoja de chats, o "api" para leer directo de la base')
    ap.add_argument("--dias", type=int, default=7)
    ap.add_argument("--hoy", default=(dt.datetime.utcnow() - dt.timedelta(hours=5)).strftime("%Y-%m-%d"))
    ap.add_argument("--salida", default="/tmp/cro")
    a = ap.parse_args()
    hoy = dt.date.fromisoformat(a.hoy)
    filas = leer_filas(a.xlsx, hoy - dt.timedelta(days=a.dias - 1), hoy)

    chats = OrderedDict()
    for f in filas:
        chats.setdefault(f["wa"], []).append(f)

    def linea(m):
        cuerpo = re.sub(r"\s+", " ", m["msg"]).strip()
        if not cuerpo or RE_ARCHIVO.match(cuerpo):
            cuerpo = f"[{m['tipo']}]"
        return f"{m['t'][5:16]} {'C' if m['quien'] == 'Cliente' else 'V'}: {cuerpo[:200]}"

    def resumir(lineas):
        """Junta las líneas iguales seguidas (5 fotos de referencias = una línea ×5)."""
        out = []
        for l in lineas:
            base = l[12:]
            if out and out[-1][0] == base:
                out[-1][1] += 1
            else:
                out.append([base, 1, l])
        return [l if n == 1 else f"{l} ×{n}" for _, n, l in out]

    etapas = Counter()
    sin_respuesta = []
    por = {k: defaultdict(Counter) for k in ("anuncio", "vendedora", "apertura", "dia")}
    tiempos, objeciones, perdidos = [], Counter(), []
    for wa, ms in chats.items():
        cli = [m for m in ms if m["quien"] == "Cliente"]
        if not cli:
            continue
        humanos = [m for m in ms if m["quien"] != "Cliente" and not RE_AUTO.search(m["vend"])]
        texto_v = "\n".join(m["msg"] for m in humanos)
        texto_c = "\n".join(m["msg"] for m in cli)
        etapa = 1
        if not all(RE_SALUDO.match(m["msg"].strip()) for m in cli):
            etapa = 2
        if etapa >= 2 and (RE_DESTINO.search(texto_c) or RE_DESTINO.search(texto_v)):
            etapa = 3
        if etapa >= 2 and RE_PIDE_CIERRE.search(texto_v):
            etapa = 4
        if RE_CERRO.search(texto_v) or "purchase" in " ".join(m["embudo"] for m in ms):
            etapa = 5
        for e in range(1, etapa + 1):
            etapas[e] += 1

        vendedora = next((m["vend"] for m in humanos if m["vend"]), "(sin respuesta humana)")
        apertura = re.sub(r"\s+", " ", humanos[0]["msg"])[:70] if humanos else "(sin respuesta humana)"
        claves = {"anuncio": next((m["anuncio"] for m in ms if m["anuncio"]), "(orgánico)"),
                  "vendedora": vendedora, "apertura": apertura, "dia": cli[0]["t"][:10]}
        for k, v in claves.items():
            por[k][v]["chats"] += 1
            por[k][v]["conversaron"] += etapa >= 2
            por[k][v]["cerraron"] += etapa >= 5

        # Tiempo de respuesta medido desde la primera pregunta REAL del cliente
        # (no el saludo automático del anuncio, que llega a cualquier hora).
        real = next((m for m in cli if not RE_SALUDO.match(m["msg"].strip())), None)
        if humanos and real:
            primero_cli = minutos(real["t"])
            resp = next((minutos(m["t"]) for m in humanos if minutos(m["t"]) >= primero_cli), None)
            if resp is not None:
                tiempos.append((resp - primero_cli, etapa >= 5))
        # Escribió algo más que el saludo y NINGUNA persona le contestó: venta regalada.
        if etapa >= 2 and not humanos:
            lineas = [linea(m) for m in ms if m["quien"] == "Cliente" or not RE_AUTO.search(m["vend"])]
            sin_respuesta.append(f"=== {wa} | {claves['anuncio']}\n" + "\n".join(resumir(lineas)[-8:]))
        for nombre, patron in OBJECIONES.items():
            if re.search(patron, texto_c, re.I):
                objeciones[nombre] += 1
        if etapa in (3, 4):
            lineas = [linea(m) for m in ms if m["quien"] == "Cliente" or not RE_AUTO.search(m["vend"])]
            perdidos.append(f"=== {wa} etapa {etapa} | {claves['anuncio']}\n" + "\n".join(resumir(lineas)[-12:]))

    def tabla(d, minimo=3):
        filas_t = [{"clave": k, **v, "cierre_%": round(100 * v["cerraron"] / v["chats"], 1)} for k, v in d.items() if v["chats"] >= minimo]
        return sorted(filas_t, key=lambda x: -x["chats"])

    rapidos = [c for t, c in tiempos if t <= 10]
    lentos = [c for t, c in tiempos if t > 30]
    salida = {
        "rango": [str(hoy - dt.timedelta(days=a.dias - 1)), str(hoy)],
        "embudo": {"1_escribio": etapas[1], "2_converso": etapas[2], "3_dijo_destino": etapas[3],
                   "4_le_pidieron_cierre": etapas[4], "5_cerro": etapas[5]},
        "cierre_si_respuesta_<=10min_%": round(100 * sum(rapidos) / len(rapidos), 1) if rapidos else None,
        "cierre_si_respuesta_>30min_%": round(100 * sum(lentos) / len(lentos), 1) if lentos else None,
        "respuestas_medidas": len(tiempos),
        "minutos_primera_respuesta_mediana": sorted(t for t, _ in tiempos)[len(tiempos) // 2] if tiempos else None,
        "escribieron_y_nadie_respondio": len(sin_respuesta),
        "objeciones": objeciones.most_common(),
        "por_anuncio": tabla(por["anuncio"]),
        "por_vendedora": tabla(por["vendedora"]),
        "por_apertura": tabla(por["apertura"], 5),
        "por_dia": sorted(tabla(por["dia"], 1), key=lambda x: x["clave"]),
    }
    os.makedirs(a.salida, exist_ok=True)
    with open(os.path.join(a.salida, "embudo.json"), "w") as fh:
        json.dump(salida, fh, ensure_ascii=False, indent=1)
    with open(os.path.join(a.salida, "perdidos.txt"), "w") as fh:
        fh.write("\n\n".join(perdidos[-60:]))
    with open(os.path.join(a.salida, "sin_respuesta.txt"), "w") as fh:
        fh.write("\n\n".join(sin_respuesta[-60:]))
    print(json.dumps({k: salida[k] for k in ("rango", "embudo", "objeciones")}, ensure_ascii=False, indent=1))
    print(f"perdidos.txt: {min(len(perdidos), 60)} chats que llegaron a etapa 3-4 y no cerraron")
    print(f"sin_respuesta.txt: {len(sin_respuesta)} clientes escribieron algo más que el saludo y ninguna persona les contestó")


if __name__ == "__main__":
    main()
