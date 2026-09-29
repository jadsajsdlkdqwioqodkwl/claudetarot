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
              "## Respuestas rápidas vigentes (texto exacto)"]
    for q in datos.get("respuestas_rapidas", []):
        partes += ["", f"### {q['title']}", q["body"].strip()]
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
