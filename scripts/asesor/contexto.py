"""
Baja lo que la Routine necesita saber del negocio en vivo y lo junta con
docs/negocio.md en un solo archivo para leer:

    ASESOR_CLAVE=... python3 scripts/asesor/contexto.py --salida /tmp/cro/negocio.md

Incluye las respuestas rápidas vigentes (el texto exacto que usan las
vendedoras), las sugerencias que siguen pendientes (para no repetirlas) y lo
aprendido: la memoria del asesor (memoria.py), qué se aprobó o descartó, cómo
corrigió el equipo los textos y si el cliente respondió o compró.
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
              "## Respuestas rápidas vigentes (texto exacto, en el orden en que el equipo las acomodó)"]
    for q in datos.get("respuestas_rapidas", []):
        media = f" · con {q['media']}" if q.get("media") else ""
        partes += ["", f"#### {q['title']} (rapida #{q['id']}, n.º {q.get('sort_order') or 0} en la lista{media})", (q.get("body") or "(solo foto/video)").strip()]
    bienv = datos.get("bienvenida", [])
    if bienv:
        partes += ["", "## Bienvenida automática (a quien llega de un anuncio), en orden — ids para proponer variantes"]
        for b in bienv:
            media = f" · con {b['media']}" if b.get("media") else ""
            partes += ["", f"### bienvenida #{b['id']} · {b['title']}{media}", (b.get("body") or "(solo foto/video)").strip()]
    pr = datos.get("pruebas") or {}
    if pr and not pr.get("error"):
        titulos = {("rapida", q["id"]): q["title"] for q in datos.get("respuestas_rapidas", [])}
        titulos.update({("bienvenida", b["id"]): f"Bienvenida · {b['title']}" for b in bienv})
        partes += ["", "## Pruebas de mensajes en curso (el CRM reparte y mide; decide el admin)",
                   "avanzó = el chat subió de etapa del embudo después de ese mensaje. Con menos de 20 usos por versión todavía no hay ganador."]
        hay = False
        for tipo, refs in (pr.get("en_curso") or {}).items():
            for ref, vs in refs.items():
                hay = True
                nombre_ref = titulos.get((tipo, int(ref))) or f"{tipo} #{ref}"
                partes.append(f"- {nombre_ref} ({tipo} #{ref}):")
                for v in vs:
                    nombre = "original" if v["id"] == 0 else f"versión #{v['id']}"
                    partes.append(f"    · {nombre}: {v['usos']} usos, {v['avanzaron']} avanzaron, {v['respondieron']} respondieron en 24 h, "
                                  f"{v['cerraron']} cerraron, {v['editadas']} editadas, sale {round(v['peso'] * 100)}%"
                                  + (f" — {v['texto'][:160]}" if v.get("texto") else ""))
        if not hay:
            partes.append("- (ninguna en curso)")
        uso = pr.get("uso_por_mensaje") or []
        if uso:
            partes += ["", "### Cómo le va a cada mensaje (45 días)"]
            for u in uso[:25]:
                nombre = titulos.get((u["tipo"], u["ref_id"])) or f"{u['tipo']} #{u['ref_id']}"
                partes.append(f"- {nombre}: {u['usos']} usos, {u['avanzaron'] or 0} avanzaron, "
                              f"{u['cerraron'] or 0} cerraron, {u['editadas'] or 0} editadas por la vendedora")
        ed = pr.get("ediciones") or []
        if ed:
            partes += ["", "### Cómo editaron las vendedoras los textos antes de mandarlos (30 días) — la fuente para nuevas versiones",
                       "Si varias cambian lo mismo, esa es la próxima versión a probar. avanzó = el chat subió de etapa después."]
            for e in ed[:25]:
                nombre = titulos.get((e["tipo"], e["ref_id"])) or f"{e['tipo']} #{e['ref_id']}"
                partes.append(f"- {nombre} · {e.get('agente') or '?'} · {'avanzó' if e.get('avanzo') else 'no avanzó'}: {e['texto_enviado'][:300]}")
        cand = pr.get("candidatas_a_opciones") or []
        if cand:
            partes += ["", "### Dónde proponer opciones 2 y 3 (variantes) — las más usadas sin prueba, primero las que menos avanzan",
                       "Propón 1 o 2 versiones para las primeras (en `variantes` de salida.json), basadas en las ediciones de las vendedoras y en las frases que más cierran."]
            for c in cand:
                nombre = titulos.get(("rapida", c["ref_id"])) or f"rapida #{c['ref_id']}"
                partes.append(f"- {nombre} (rapida #{c['ref_id']}): {c['usos']} usos, {c['avanza_pct']}% avanzó, {c['editadas']} editadas")
        fr = pr.get("frases") or {}
        if fr.get("mejores"):
            partes += ["", f"### Frases del equipo y cierre (30 días, antes de pedir el cierre; promedio {fr['promedio']}% en {fr['chats']} chats)",
                       "Correlación, no causa: úsalo para decidir qué probar."]
            partes += [f"- ▲ \"{f['frase']}\": {f['cierre']}% cerró ({f['chats']} chats)" for f in fr["mejores"]]
            partes += [f"- ▼ \"{f['frase']}\": {f['cierre']}% cerró ({f['chats']} chats)" for f in fr.get("peores", [])]
    nc = datos.get("no_cierran") or {}
    if nc and not nc.get("error"):
        partes += ["", "## Por qué no cierran (antes de proponer un seguimiento, diagnostica la objeción)"]
        e = nc.get("estancados") or {}
        if e.get("pidieron_cierre"):
            partes.append(f"- 14 días: a {e['pidieron_cierre']} chats se les pidió el cierre (ubicación o adelanto) y no cerraron; "
                          f"{e.get('contestaron_despues') or 0} contestaron algo después, {e['pidieron_cierre'] - (e.get('contestaron_despues') or 0)} "
                          f"se quedaron callados, {e.get('ventana_cerrada') or 0} ya sin ventana de 24 h.")
        for o in nc.get("objeciones") or []:
            partes.append(f"- Objeción \"{o['objecion']}\": {o['chats']} chats ({o.get('perdidos') or 0} perdidos). Ej.: {(o.get('ejemplos') or '')[:220]}")
        po = nc.get("por_objecion") or []
        if po:
            partes += ["", "### Cómo les fue a los seguimientos según la objeción que atacaban (45 días)"]
            partes += [f"- {o['objecion']}: {o['aprobadas']} aprobados, {o.get('respondieron') or 0} respondieron en 24 h, {o.get('compraron') or 0} compraron" for o in po]
        pr_ = nc.get("preguntas_respondidas") or []
        if pr_:
            partes += ["", "### Lo que el dueño ya respondió (no lo vuelvas a preguntar; úsalo)"]
            partes += [f"- {q['pregunta'][:200]} → {q['respuesta'][:300]}" for q in pr_]
    pend = datos.get("sugerencias_pendientes", [])
    partes += ["", f"## Sugerencias que siguen pendientes de aprobar ({len(pend)})",
               "No las repitas; si una ya no sirve, dilo."]
    for s in pend:
        quien = s.get("titulo") if s["tipo"] == "respuesta_rapida" else f"{s.get('nombre') or ''} +{s.get('wa_id') or ''}"
        partes.append(f"- [{s['tipo']}] {quien} ({s.get('origen')}, {s.get('created_at')}): {s['texto'][:160]}")
    ap_ = datos.get("aprendizaje") or {}
    partes += ["", "## Lo aprendido (se actualiza solo con cada corrida y cada decisión del equipo)"]
    mem = ap_.get("memoria", [])
    partes += ["", f"### Memoria del asesor ({len(mem)} lecciones activas)",
               "Anotadas por corridas anteriores. Úsalas; si los datos de hoy contradicen una, retírala con memoria.py."]
    partes += [f"- #{m['id']} [{m['tema']}] {m['nota']} ({m.get('fuente') or ''}, {m['created_at'][:10]})" for m in mem] or ["- (vacía)"]
    partes += ["", "### Qué pasó con lo que propusiste (21 días)"]
    partes += [f"- {r['origen']} · {r['tipo']} · {r['estado']}: {r['n']}" for r in ap_.get("sugerencias_por_origen", [])] or ["- (sin datos todavía)"]
    res = ap_.get("resultado_de_lo_enviado", [])
    if res:
        partes += ["", "### Resultado de lo que se envió (respondió en 24 h / compró)"]
        partes += [f"- {r['origen']} · {r['tipo']}: {r['aprobadas']} enviados → {r['respondieron'] or 0} respondieron, {r['compraron'] or 0} compraron" for r in res]
    ed = ap_.get("correcciones_humanas", [])
    if ed:
        partes += ["", "### Cómo corrigió el equipo tus textos antes de aprobarlos (imita el DESPUÉS)"]
        for e in ed:
            partes += [f"- ANTES: {e['antes'][:300]}", f"  DESPUÉS ({e.get('quien') or ''}): {e['despues'][:300]}"]
    desc = ap_.get("descartadas_recientes", [])
    if desc:
        partes += ["", "### Propuestas que el equipo descartó (no repitas ese tipo de mensaje sin una razón nueva)"]
        partes += [f"- [{d['tipo']}] {d['texto']} — motivo que diste: {d.get('motivo') or '-'}" for d in desc]
    os.makedirs(os.path.dirname(os.path.abspath(a.salida)), exist_ok=True)
    with open(a.salida, "w") as fh:
        fh.write("\n".join(partes) + "\n")
    print(f"{a.salida}: {len(datos.get('respuestas_rapidas', []))} respuestas rápidas, {len(pend)} sugerencias pendientes")


if __name__ == "__main__":
    main()
