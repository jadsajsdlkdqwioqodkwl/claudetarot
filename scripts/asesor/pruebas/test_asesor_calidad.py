"""
Calidad de las recomendaciones del asesor (dueño, 2026-11-07):
  1. preparar.py --sin-rechazos salta al cliente que dijo un no claro («no gracias», «no, muy caro»), pero no al que
     dijo «luego», «fin de mes» o preguntó algo.
  2. enviar.py rechaza el texto que pide permiso para mandar fotos («¿le mando fotos?», «si desea le paso fotos»):
     eso va en `adjuntar`; sí deja «Le dejo las fotos de los envíos de hoy».
    python3 scripts/asesor/pruebas/test_asesor_calidad.py
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import preparar, enviar

fallas = 0
def check(nombre, ok):
    global fallas
    fallas += not ok
    print(("✓ " if ok else "✗ ") + nombre)

for t in ["No gracias", "No, no quiero, muy caro", "Muy caro, no", "No me interesa", "Ya no quiero", "Nooo gracias 😊"]:
    check(f"rechazo claro: «{t}»", preparar.es_rechazo(t))
for t in ["No por ahora, luego le escribo", "Está caro", "No gracias, ¿tienen solo el mazo?", "Ok gracias", "No",
          "No tengo dinero ahora, fin de mes compro", "Me interesa pero no ahora"]:
    check(f"no es rechazo: «{t}»", not preparar.es_rechazo(t))
for t in ["Si desea le paso fotos de envíos de hoy, ¿le quedó alguna duda?", "¿Le envío unas fotos del kit?", "¿Desea que le mande fotos?"]:
    check(f"pide permiso para fotos: «{t}»", any("adjuntar" in p for p in enviar.problemas_de(t)))
for t in ["Le mando las fotos de los envíos de hoy ☺️", "Le dejo el video del kit. ¿Desde qué ciudad me escribe?"]:
    check(f"adjunto bien escrito: «{t}»", not any("adjuntar" in p for p in enviar.problemas_de(t)))

print("\nCalidad del asesor: todo en orden." if not fallas else f"\n{fallas} falla(s).")
sys.exit(1 if fallas else 0)
