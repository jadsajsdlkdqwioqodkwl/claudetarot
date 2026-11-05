"""
Reporte unificado «Pedidos y ventas» (21:45 · 22:30 · 23:45 Lima; dueño, 2026-11-02). Una sola Routine, una sola
sesión, una sola memoria: el registro por fecha de despacho del Worker (`pedidos-estado/`) + la pestaña «Pedidos auto»
del libro «Pedidos Tarot Kit». La Routine solo corre estos subcomandos (nada de curl):

    ASESOR_CLAVE=... python3 scripts/asesor/reporte.py preparar [--max-img N] [--dir /tmp/reporte]
        -> Decide las fechas (ventas de HOY en Lima; despacho de MAÑANA), trae lo ya registrado para mañana y la agenda de la
           hoja, lee los chats (primera corrida: hoy y ayer completos; siguientes: solo los chats con movimiento desde el
           corte anterior), baja las capturas y trae el control del sistema (compras del CRM, pedidos web y de catálogo).
           Imprime un resumen JSON y deja todo en --dir: ctx.json, previo.json, control.json, chats_XX.txt, imagenes.md, img/.
    python3 scripts/asesor/reporte.py enviar [/tmp/reporte/salida.json]
        -> Completa el salida.json con lo de ctx.json (tipo_reporte, fechas, hora, origen) y manda el PDF (dueño + Danitza).
    python3 scripts/asesor/reporte.py ver [AAAA-MM-DD]      -> lo registrado para esa fecha de despacho + la agenda de la hoja.
    python3 scripts/asesor/reporte.py chat <whatsapp|id> [N] -> los últimos N mensajes de un chat (para verificar una duda).
    python3 scripts/asesor/reporte.py aviso "texto"           -> aviso corto al dueño (Telegram) cuando el reporte no pudo salir.
    python3 scripts/asesor/reporte.py enviado <whatsapp> ["sí 2026-11-02 Shalom"]
        -> marca «Enviado» en la fila abierta de ese cliente en «Pedidos auto» (deja de salir en la agenda). Lo usará la
           Routine de estados de envío (docs/estados-envio.md); una persona puede escribirlo a mano en la hoja.

Criterio LIBERAL (dueño): el reporte lo verifica una persona. Todo lo que huela a venta entra: CONFIRMADO solo con dirección
(Lima) o adelanto + datos (provincia); POR_VERIFICAR para lo demás que parezca venta; DESCARTADO con motivo para lo que se
revisó y no es (sale listado, nunca se esconde). Un pedido para otro día queda agendado y aparece en cada reporte hasta
que alguien escriba en la columna «Enviado» de la hoja.
"""
import datetime as dt, json, math, os, subprocess, sys, urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
API_BASE = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
LIMA = dt.timezone(dt.timedelta(hours=-5))
CORRIDAS = ("21:45", "22:30", "23:45")


def clave():
    return os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")


def pedir(ruta, method="GET", body=None, timeout=90):
    datos = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(f"{API_BASE}{ruta}", data=datos, method=method,
                                 headers={"x-asesor-clave": clave(), "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        cuerpo = e.read()
        try:
            return e.code, json.loads(cuerpo)
        except ValueError:
            return e.code, {"error": cuerpo.decode(errors="replace")[:300]}


def ahora_lima():
    return dt.datetime.now(LIMA)


def fechas():
    """(fecha_venta, fecha_objetivo, hora, corrida). Después de medianoche y antes de las 3:00 sigue siendo «la noche de ayer»."""
    t = ahora_lima()
    hoy = t.date() - dt.timedelta(days=1) if t.hour < 3 else t.date()
    hora = t.strftime("%H:%M")
    minutos = t.hour * 60 + t.minute if t.hour >= 3 else (t.hour + 24) * 60 + t.minute
    corrida = min(CORRIDAS, key=lambda c: abs(int(c[:2]) * 60 + int(c[3:]) - minutos))
    return hoy.isoformat(), (hoy + dt.timedelta(days=1)).isoformat(), hora, corrida


def resumen_pedido(p):
    return f"{p.get('nombre') or p.get('whatsapp')} ({p.get('estado')}{'/' + p['tipo'] if p.get('tipo') else ''}, {p.get('destino') or '?'}, {p.get('vendedora') or 'sin vendedora'})"


def cmd_preparar(args):
    import control_ventas as cv
    import pedidos_estado as pe
    carpeta = args[args.index("--dir") + 1] if "--dir" in args else "/tmp/reporte"
    max_img = int(args[args.index("--max-img") + 1]) if "--max-img" in args else 60  # 25 → 60 (5/11): una noche con muchas capturas dejaba pagos sin mirar
    os.makedirs(carpeta, exist_ok=True)
    fecha_venta, fecha_objetivo, hora, corrida = fechas()
    out = {"fecha_venta": fecha_venta, "fecha_objetivo": fecha_objetivo, "hora": hora, "corrida": corrida, "dir": carpeta}

    # 1. Lo ya registrado para el despacho de mañana (corridas anteriores de esta noche + agendados de otros días).
    previo = pe.traer(clave(), fecha_objetivo)
    json.dump(previo or {}, open(os.path.join(carpeta, "previo.json"), "w"), ensure_ascii=False, indent=1)
    ahora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    horas = 0
    if previo and previo.get("corte"):
        horas = max(2, math.ceil((ahora - dt.datetime.fromisoformat(previo["corte"])).total_seconds() / 3600) + 1)
    out["ya_registrado"] = {"pedidos": [resumen_pedido(p) for p in (previo or {}).get("pedidos", [])],
                            "corte_anterior": (previo or {}).get("corte"), "corridas": len((previo or {}).get("corridas") or [])}
    json.dump({"fecha_venta": fecha_venta, "fecha_objetivo": fecha_objetivo, "hora": hora, "corrida": corrida,
               "corte_nuevo": ahora.isoformat(), "corte_anterior": (previo or {}).get("corte")},
              open(os.path.join(carpeta, "ctx.json"), "w"))

    # 2. Agenda pendiente de la hoja «Pedidos auto» (todo lo que no está marcado «Enviado»).
    st, ag = pedir(f"/pedidos-sheet?hoy={fecha_venta}")
    if st == 200:
        out["agenda_hoja"] = {k: [f"{r.get('fecha_entrega')} · {r.get('nombre')} · {r.get('whatsapp')} · {r.get('estado')} · fila {r.get('fila')}"
                                  for r in ag.get(k) or []] for k in ("atrasados", "hoy", "futuros", "sin_fecha")}
    else:
        out["agenda_hoja"] = {"error": ag.get("error") or st}

    # 3. Chats: primera corrida de la noche = hoy y ayer completos; las siguientes, solo lo que se movió desde el corte.
    # Hoy y ayer (3 días si la corrida se pasó de medianoche, para no perder la noche de ayer).
    dias = 2 if fecha_venta == ahora_lima().date().isoformat() else 3
    # --completo 80 (dueño, 2026-11-05): a los chats con señal de venta se les suma su historial anterior entero (hasta 80 mensajes).
    cmd = [sys.executable, os.path.join(AQUI, "preparar.py"), "api", "--dias", str(dias), "--salida", carpeta, "--completo", "80"]
    if horas:
        cmd += ["--activos-horas", str(horas)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        out["chats"] = json.loads(r.stdout[r.stdout.index("{"):])
    except (ValueError, json.JSONDecodeError):
        out["chats"] = {"error": (r.stderr or r.stdout)[-400:]}
    out["chats"]["modo"] = f"solo chats con movimiento en las últimas {horas} h (desde el corte anterior)" if horas else "hoy y ayer completos (primera corrida de la noche)"

    # 4. Capturas (Yape/Plin, DNI, ubicación) para mirarlas con Read.
    r = subprocess.run([sys.executable, os.path.join(AQUI, "imagenes.py"), carpeta, "--max", str(max_img)], capture_output=True, text=True)
    try:
        out["imagenes"] = json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        out["imagenes"] = {"error": (r.stderr or r.stdout)[-300:]}

    # 5. Control del sistema: lo que el CRM ya sabe de HOY (compras marcadas, pedidos web, de catálogo, compras de otro día que escribieron).
    try:
        control = cv.traer(clave(), fecha_venta)
        json.dump(control, open(os.path.join(carpeta, "control.json"), "w"), ensure_ascii=False, indent=1)
        cand = cv.candidatos(control)
        out["control"] = {"candidatos": [f"{wa}: {'; '.join(r)}" for wa, r in cand.items()],
                          "compra_otro_dia": [f"{cv.n9(x['wa_id'])}: compró el {x.get('ultima_compra') or '?'}" for x in control.get("compra_otro_dia", [])],
                          "otras_lineas": [l for l in control.get("lineas", []) if l.get("linea") and l.get("chats_activos")]}
    except RuntimeError as err:
        out["control"] = {"error": str(err)}
    out["siguiente"] = (f"Lee {carpeta}/chats_XX.txt y {carpeta}/imagenes.md (mira cada imagen con Read), escribe {carpeta}/salida.json "
                        f"y corre: python3 scripts/asesor/reporte.py enviar {carpeta}/salida.json")
    print(json.dumps(out, ensure_ascii=False, indent=1))


def cmd_enviar(args):
    ruta = next((a for a in args if a.endswith(".json")), "/tmp/reporte/salida.json")
    carpeta = os.path.dirname(os.path.abspath(ruta))
    try:
        datos = json.load(open(ruta))
    except (OSError, ValueError) as err:
        sys.exit(f"No se pudo leer {ruta}: {err}")
    ctx = json.load(open(os.path.join(carpeta, "ctx.json"))) if os.path.exists(os.path.join(carpeta, "ctx.json")) else {}
    fecha_venta, fecha_objetivo, hora, corrida = fechas()
    datos["tipo_reporte"] = "unificado"
    datos.setdefault("fecha_venta", ctx.get("fecha_venta") or fecha_venta)
    datos.setdefault("fecha_objetivo", ctx.get("fecha_objetivo") or fecha_objetivo)
    datos.setdefault("hora", ctx.get("corrida") or corrida)
    datos.setdefault("origen", f"pedidos y ventas {datos['hora']}")
    datos.setdefault("pedidos", [])
    json.dump(datos, open(ruta, "w"), ensure_ascii=False, indent=1)
    extra = [a for a in args if a.startswith("--")]
    r = subprocess.run([sys.executable, os.path.join(AQUI, "enviar.py"), ruta, *extra], text=True)
    sys.exit(r.returncode)


def cmd_ver(args):
    import pedidos_estado as pe
    fecha = next((a for a in args if len(a) == 10 and a[4] == "-"), fechas()[1])
    est = pe.traer(clave(), fecha)
    print(f"Registrado para el despacho del {fecha}: {len((est or {}).get('pedidos', []))} pedidos · corte {(est or {}).get('corte') or '-'}")
    for p in (est or {}).get("pedidos", []):
        print(f"  - {resumen_pedido(p)} {p.get('whatsapp') or ''} {p.get('fecha_entrega') or ''} {p.get('nota') or ''}")
    for c in (est or {}).get("corridas", []):
        print(f"  corrida {c['cuando']} · {c['origen']}: total {c['total']}")
    st, ag = pedir(f"/pedidos-sheet?hoy={fechas()[0]}")
    if st != 200:
        print(f"Hoja «Pedidos auto»: error {ag.get('error') or st}")
        return
    for k in ("atrasados", "hoy", "futuros", "sin_fecha"):
        print(f"Agenda de la hoja · {k}: {len(ag.get(k) or [])}")
        for r in ag.get(k) or []:
            print(f"  - {r.get('fecha_entrega')} · {r.get('nombre')} · {r.get('whatsapp')} · {r.get('estado')} · {r.get('destino')} · fila {r.get('fila')}")


def cmd_chat(ref, n="40"):
    q = f"conversation_id={ref}" if str(ref).isdigit() and len(str(ref)) < 9 else f"wa_id={''.join(c for c in str(ref) if c.isdigit())}"
    st, c = pedir(f"/chat?{q}&mensajes={min(int(n), 100)}")
    if st != 200 or not c.get("encontrado", True):
        sys.exit(f"Error {st}: {c.get('error') or 'chat no encontrado'}")
    print(f"{c.get('nombre') or '?'} · {c.get('wa_id') or ''} · chat {c.get('conversation_id')} · etiquetas: {c.get('etiquetas')} · "
          f"ventana {c.get('ventana')} · saldo CRM: {c.get('saldo_crm')}")
    for m in c.get("mensajes") or []:
        print(f"{str(m.get('created_at') or '')[:16]} {'C' if m.get('direction') == 'in' else 'V(' + str(m.get('sent_by') or '') + ')'}: "
              f"{(m.get('body') or '[' + str(m.get('type') or 'media') + ']')[:300]}")


def cmd_enviado(args):
    """reporte.py enviado <whatsapp> ["sí 2026-11-02 Shalom"]: marca la columna «Enviado» de la fila abierta de ese cliente."""
    wa = "".join(c for c in str(args[0]) if c.isdigit())
    st, r = pedir("/pedidos-sheet", "POST", {"marcar": [{"whatsapp": wa, "enviado": " ".join(args[1:]) or ""}]})
    print(json.dumps(r, ensure_ascii=False))
    if st != 200 or r.get("sin_fila"):
        sys.exit(1)


def cmd_aviso(texto):
    st, r = pedir("/avisos", "POST", {"informe": f"Ventas — aviso del reporte de pedidos y ventas\n\n{texto}", "origen": "reporte de ventas (aviso)"})
    print(json.dumps(r, ensure_ascii=False))


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "preparar":
        cmd_preparar(resto)
    elif cmd == "enviar":
        cmd_enviar(resto)
    elif cmd == "ver":
        cmd_ver(resto)
    elif cmd == "chat" and resto:
        cmd_chat(*resto[:2])
    elif cmd == "enviado" and resto:
        cmd_enviado(resto)
    elif cmd == "aviso" and resto:
        cmd_aviso(" ".join(resto))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
