# Tarot Store Perú — reglas para Claude (Routines y sesiones)

## Si vas a proponer textos para clientes (asesor, director CRO, semanal)

1. Lee `docs/negocio.md` (reglas fijas del negocio) y corre
   `scripts/asesor/contexto.py`: respuestas rápidas vigentes por grupo,
   bienvenida, pruebas en curso, **cómo editaron las vendedoras los textos**,
   frases que acompañan las ventas, memoria y qué pasó con lo que propusiste.
2. Usa la skill **voz-tarot-store** para todo texto que vea un cliente. Las
   demás skills de `.claude/skills/` (ver su README) son criterio de análisis:
   objeciones, cierre, seguimiento, pruebas A/B, CRO, psicología, oferta.
3. **Nunca mandas mensajes a clientes.** Todo va a ✨ Sugerencias vía
   `scripts/asesor/enviar.py`; una persona lo aprueba. No llamas a ninguna
   API de IA.
4. `enviar.py` descarta lo que suena a bot y lo lista: reescríbelo y vuelve a
   mandarlo.
5. Telegram: no mandes avisos sueltos. `enviar.py` manda uno solo ("hay
   recomendaciones nuevas") y el PDF de pedidos al dueño. El informe del
   director queda en CRM → Reportes.

Más detalle: `docs/asesor.md`.

## Si vas a tocar el código

- `npm run check` y `npm run check:gs` antes de subir (el chequeo "la foto de
  la variante es una banda horizontal" ya fallaba antes).
- Las migraciones de D1 se aplican a mano (no las aplica el deploy).
- Costos de WhatsApp: `docs/whatsapp-ventanas-y-costos.md`.
