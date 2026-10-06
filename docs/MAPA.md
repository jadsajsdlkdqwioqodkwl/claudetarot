# Mapa: qué hay, cómo se conecta y qué NO se mueve

Este es el documento del workflow. Léelo antes de mover, renombrar o borrar
cualquier archivo, documento, hoja, pestaña, columna o Routine. **Todo cambio
al workflow actualiza este mapa en el mismo commit** y suma una línea al
"Registro de cambios" del final.

## 🔒 No mover, no renombrar, no recrear

| Cosa | Dónde | Quién depende de ella |
|---|---|---|
| **Brief de anuncios (versión viva)** | Google Doc `1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0` | Projects de claude.ai (por su link), `creativos/instrucciones.md`, `creativos/copy-meta.md`, Routine de voz del cliente. Se edita siempre el mismo Doc (conector Google Docs); nunca crear otro |
| Brief (copia en repo) | `docs/anuncios/brief-avatar-oferta.md` | Respaldo y fuente inicial de la Routine del brief |
| **Bitácora CRO Tarot** | Google Doc en Drive (el Director CRO lo recrea cada día y manda el viejo a la papelera; se busca por título) | Director CRO, Routine del brief |
| **Hoja de creativos** | Sheet `19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY` | Project de conceptos, skill `creativos`, Routine de voz del cliente. Pestañas y columnas en `.claude/skills/creativos/SKILL.md`; no reordenar columnas (las nuevas van al final) |
| Pestaña **Avatares** | en la hoja de creativos | Project de conceptos (reparto de cada lote), Routine de voz del cliente (suma chats y avatares nuevos), REVISA COMENTARIOS (Estado). Las fórmulas de Cobertura leen Prompts col. D, J y L |
| Hoja de chats del CRM (TAROT CHATS - VENTAS CRM) | la escribe el Worker cada 10 min | `apps-script/ASESOR.gs`, `preparar.py` (modo xlsx) |
| Reglas del negocio | `docs/negocio.md` | Todo lo que escribe a clientes o anuncios (precios y regalos mandan aquí) |
| Scripts del asesor | `scripts/asesor/*.py` | Todas las Routines del asesor y del director (rutas fijas en sus prompts) |
| API del asesor | `https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/*` + clave `ASESOR_CLAVE` | Scripts del asesor |
| Skills | `.claude/skills/*` (ver su README) | Routines y sesiones de Claude Code |
| Pausa "escribiendo…" | `src/lib/crm-send.js` | Regla del dueño, ver `CLAUDE.md` |

## Routines (claude.ai → Routines), hora de Lima

| Routine | Hora | Qué hace | Dónde deja el resultado |
|---|---|---|---|
| Director de marketing y CRO | 7:52 | Embudo 7 días, chats perdidos y sin respuesta, fatiga de anuncios en Meta, experimentos | Telegram al dueño + CRM → Reportes; propuestas en CRM → ✨ Sugerencias; Doc "Bitácora CRO Tarot"; memoria (`memoria.py`) |
| Asesor — reporte de pedidos | 10:30 | PDF de pedidos a despachar, links de seguimiento, boletas | Telegram (dueño y Danitza) + CRM → Reportes |
| Asesor — mensajes y cierre | 11:30, 16:30, 22:30 | Seguimientos para las vendedoras; a las 22:30 cierra el reporte | Telegram a cada vendedora; CRM |
| **Voz del cliente → brief y ángulos** | 11:56 | Chats del día → brief (Google Doc) + pestañas Voz del cliente y Avatares | Doc del brief, hoja de creativos, Telegram al dueño. Pasos: `docs/anuncios/voz-del-cliente.md` (usa `docs/anuncios/rutina-brief-drive.md`) |
| Asesor — reporte de ventas | 21:00 | Ventas del día, mensajes de seguimiento | Telegram + Drive |
| Asesor — reporte A PEDIDO | a mano | Igual que el de 10:30, cuando el dueño lo pide | Telegram |

Conectores que necesitan (se agregan en claude.ai → Routines → Editar):
Director CRO → Google Drive y Meta. Voz del cliente → Google Docs, Google
Drive y Google Sheets. Las del asesor → Google Drive.

## Cómo fluye todo

    Chats de WhatsApp (CRM / Worker)
      ├─ Asesor (11:30·16:30·21:00·22:30) → seguimientos y pedidos → vendedoras / PDF
      ├─ Director CRO (7:52) → informe + experimentos → Sugerencias del CRM
      └─ Voz del cliente (11:56) → Brief (Google Doc) + Voz del cliente + Avatares
                                          │
              Project de conceptos (claude.ai) lee Instrucciones, Reglas,
              Avatares (Cobertura), Voz del cliente, Ángulos y el brief
              → escribe en Prompts (col. L = avatar)
                                          │
              Claude Code (skill creativos, prompt maestro) → imágenes
              Flash 1080×1350 → Creativos + Copy Meta + Ángulos
                                          │
              Dueño califica (Creativos y Copy Meta) → "REVISA COMENTARIOS"
              → Reglas, Instrucciones, Copy reglas, Avatares (Estado), creativos/brief.md

## Dónde ver cada cosa

- Informe CRO del día: Telegram (te llega a ti) y CRM → Reportes.
- Experimentos y su historia: Drive → "Bitácora CRO Tarot".
- Brief al día: el Google Doc del brief.
- Anuncios para calificar: hoja de creativos → Creativos y Copy Meta.
- Qué avatares faltan probar: hoja de creativos → Avatares → Cobertura (rojo = 0).

## Registro de cambios (lo más nuevo arriba)

- 2026-10-06 · Creativos: columna M "Titular (novedoso)" al final de Prompts y
  Ángulos (20 % de titulares evocadores por lote); filas de Creativos, Copy
  Meta y Ángulos ordenadas por avatar; reglas de CTA de compra y de formatos
  que esconden el producto (`desde-hoja.mjs` avisa); REGLAS_RENDER: cartas
  sin dibujo, números legibles, flechas con destino.

- 2026-10-06 · Avatares: pestaña Avatares (8 razones de compra × 5 niveles,
  Cobertura por fórmulas), columna Avatar al final de Prompts (L), Creativos
  (M), Ángulos (L) y Voz del cliente (I); `creativos/avatares.md`;
  Instrucciones, skill creativos, `desde-hoja.mjs`/`filas.mjs` y Routine de
  voz del cliente al tanto. Los 60 anuncios de L001–L006 etiquetados (49 = A1).
- 2026-10-06 · Creativos: dos flujos (CREA y REVISA COMENTARIOS); sin Pro ni
  Drive; REGLAS_RENDER fijas en `render.mjs`.
- 2026-10-06 · Brief: el Google Doc vuelve a ser la versión viva; se crea este mapa.
