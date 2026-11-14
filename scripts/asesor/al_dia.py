"""
Siempre la última versión de main (dueño, 2026-11-14: «que Jennifer siempre trabaje en la última versión de main»).

La sesión de la operadora (Routine o Project de envíos) a veces se quedaba con un clon viejo: el arranque de su prompt sincroniza
una sola vez y, si la sesión sigue abierta días o el merge falla, `dinsides.py`, `shalom.py` y `etiquetas.py` corrían código e
instrucciones de antes (caso 2026-11-14: etiquetas con «1 kit normal» y sin los collares extra prometidos).

`asegurar()` se llama al empezar esos tres scripts. Si el repo está en la rama `main`:
  1. `git fetch origin main` (20 s como máximo).
  2. Si `origin/main` tiene commits nuevos y el avance es directo (fast-forward), hace `git merge --ff-only origin/main` y vuelve a
     ejecutar el mismo comando con el código nuevo (una sola vez: variable AL_DIA_HECHO).
  3. Si no se puede (cambios locales, commits propios, sin red), lo dice en grande en la primera línea y sigue.
En otra rama (sesiones de desarrollo) no toca nada. `AL_DIA_NO=1` lo apaga.
"""
import os, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _git(*args, timeout=20):
    return subprocess.run(["git", "-C", RAIZ, *args], capture_output=True, text=True, timeout=timeout)


def asegurar():
    if os.environ.get("AL_DIA_HECHO") or os.environ.get("AL_DIA_NO"):
        return
    try:
        if _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() != "main":
            return
        f = _git("fetch", "-q", "origin", "main")
        if f.returncode != 0:
            print(f"⚠️ NO PUDE COMPROBAR SI HAY UNA VERSIÓN NUEVA DE MAIN (git fetch falló: {f.stderr.strip()[:120]}). Sigo con la que hay.", flush=True)
            return
        local, remoto = _git("rev-parse", "HEAD").stdout.strip(), _git("rev-parse", "origin/main").stdout.strip()
        if not remoto or local == remoto:
            return
        if _git("merge-base", "--is-ancestor", "HEAD", "origin/main").returncode != 0:
            print("⚠️ ESTA COPIA DE MAIN TIENE COMMITS QUE NO ESTÁN EN GITHUB: no se actualizó sola. Avísale al dueño.", flush=True)
            return
        m = _git("merge", "-q", "--ff-only", "origin/main", timeout=60)
        if m.returncode != 0:
            s = _git("stash", "-q")
            m = _git("merge", "-q", "--ff-only", "origin/main", timeout=60) if s.returncode == 0 else m
        if m.returncode != 0:
            print(f"⚠️ HAY UNA VERSIÓN NUEVA DE MAIN Y NO SE PUDO ACTUALIZAR ({m.stderr.strip()[:160]}). Corre: "
                  f"cd {RAIZ} && git stash && git merge --ff-only origin/main", flush=True)
            return
        print(f"🔄 Actualizado a la última versión de main ({remoto[:7]}); vuelvo a correr el comando con el código nuevo.", flush=True)
        os.environ["AL_DIA_HECHO"] = "1"
        os.execv(sys.executable, [sys.executable, *sys.argv])
    except Exception as err:  # noqa: BLE001 — nunca frena el trabajo
        print(f"⚠️ No pude comprobar la versión de main: {err}", flush=True)
