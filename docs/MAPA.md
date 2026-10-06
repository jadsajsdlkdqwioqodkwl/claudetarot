# Mapa: qué hay, cómo se conecta y qué NO se mueve

Léelo antes de mover, renombrar o borrar cualquier archivo, documento, hoja o
Routine. Si cambias algo de esta lista, actualiza este mapa en el mismo commit.

## 🔒 No mover, no renombrar, no recrear

| Cosa | Dónde | Quién depende de ella |
|---|---|---|
| **Brief de anuncios (versión viva)** | Google Doc `1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0` | Projects de claude.ai (por su link), `creativos/instrucciones.md`, `creativos/copy-meta.md`, Routine de voz del cliente. Se edita siempre el mismo Doc (conector Google Docs); nunca crear otro |
| Brief (copia en repo) | `docs/anuncios/brief-avatar-oferta.md` | Respaldo y fuente inicial de la Routine del brief |
| **Bitácora CRO Tarot** | Google Doc en Drive (el Director CRO lo recrea cada día y manda el viejo a la papelera; se busca por título) **+ copia en `docs/cro/bitacora.md`** | Director CRO, Routine del brief, sesiones de Claude Code (leen la copia del repo) |
| Informes del director CRO | `docs/cro/informes/AAAA-MM-DD.md` (los escribe `enviar.py --informe`; la Routine los commitea) y D1 `asesor_informes` → CRM → Reportes | Sesiones de Claude Code, resumen semanal |
| Revisiones CRO de las sesiones | `docs/cro/revision-AAAA-MM-DD.md` | El director las lee antes de proponer |
| **Hoja de creativos** | Sheet `19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY` | Project de conceptos, skill `creativos`, Routine de voz del cliente. Pestañas y columnas en `.claude/skills/creativos/SKILL.md`; no reordenar columnas |
| Hoja de chats del CRM (TAROT CHATS - VENTAS CRM) | la escribe el Worker cada 10 min | `apps-script/ASESOR.gs`, `preparar.py` (modo xlsx) |
| Reglas del negocio | `docs/negocio.md` | Todo lo que escribe a clientes o anuncios (precios y regalos mandan aquí) |
| Scripts del asesor | `scripts/asesor/*.py` | Todas las Routines del asesor y del director (rutas fijas en sus prompts) |
| API del asesor | `https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/*` + clave `ASESOR_CLAVE` | Scripts del asesor |
| Skills | `.claude/skills/*` (ver su README) | Routines y sesiones de Claude Code |
| Pausa "escribiendo…" | `src/lib/crm-send.js` | Regla del dueño, ver `CLAUDE.md` |

## Routines (claude.ai → Routines), hora de Lima

| Routine | Hora | Qué hace | Dónde deja el resultado |
|---|---|---|---|
| Director de marketing y CRO | 7:52 | Embudo 7 días, chats perdidos y sin respuesta, fatiga de anuncios en Meta, experimentos (solo `variantes`), cómo van los toques | CRM → Reportes; propuestas en CRM → ✨ Sugerencias; Doc "Bitácora CRO Tarot"; memoria (`memoria.py`); **commit a `main` de `docs/cro/`** (la única Routine que commitea) |
| Asesor — reporte de pedidos | 10:30 | PDF de pedidos a despachar, links de seguimiento, boletas | Telegram (dueño y Danitza) + CRM → Reportes |
| Asesor — mensajes y cierre | 11:30, 16:30, 22:30 | Seguimientos para las vendedoras; a las 22:30 cierra el reporte | Telegram a cada vendedora; CRM |
| **Voz del cliente → brief y ángulos** | 11:56 | Chats del día → brief (Google Doc) + pestaña Voz del cliente | Doc del brief, hoja de creativos, Telegram al dueño. Pasos: `docs/anuncios/voz-del-cliente.md` (usa `docs/anuncios/rutina-brief-drive.md`) |
| Asesor — reporte de ventas | 21:00 | Ventas del día, mensajes de seguimiento | Telegram + Drive |
| Asesor — reporte A PEDIDO | a mano | Igual que el de 10:30, cuando el dueño lo pide | Telegram |

Conectores que necesitan (se agregan en claude.ai → Routines → Editar):
Director CRO → Google Drive y Meta (**al 06/10 solo tiene Drive: sin Meta no
hay gasto ni costo por venta**). Voz del cliente → Google Docs, Google Drive y
Google Sheets. Las del asesor → Google Drive.

La Routine semanal de coaching (lunes 7:37) que describe `docs/asesor.md`
**no existe** en claude.ai al 06/10: hay que crearla con ese prompt.

## Cómo fluye todo

    Chats de WhatsApp (CRM / Worker)
      ├─ Worker, cron de cada 5 min (minuto % 5 === 2): toques automáticos
      │    (src/lib/toques.js; apagado mientras TOQUES esté vacío) → plantillas
      │    gratis en los 7 días del anuncio, pagadas después → el cliente toca
      │    un botón → el chat sube en el CRM → vendedora
      ├─ Asesor (11:30·16:30·21:00·22:30) → seguimientos y pedidos → vendedoras / PDF
      ├─ Director CRO (7:52) → informe + experimentos → Sugerencias del CRM
      │    └─ docs/cro/bitacora.md + docs/cro/informes/ → commit a main
      └─ Voz del cliente (11:56) → Brief (Google Doc) + pestaña Voz del cliente
                                          │
              Project de conceptos (claude.ai) lee Instrucciones, Reglas,
              Voz del cliente, Ángulos y el brief → escribe en Prompts
                                          │
              Claude Code (skill creativos, prompt maestro) → imágenes
              Flash 1080×1350 → Creativos + Copy Meta + Ángulos
                                          │
              Dueño califica (Creativos y Copy Meta) → "lee el feedback"
              → Reglas, Instrucciones, Copy reglas, creativos/brief.md

## Dónde ver cada cosa

- Informe CRO del día: CRM → Reportes y `docs/cro/informes/`.
- Experimentos y su historia: Drive → "Bitácora CRO Tarot" y `docs/cro/bitacora.md`.
- Cómo van los toques: `GET /api/asesor/toques?dias=30` (enviados vs. control).

## Cambios del 06/10/2026 (ecosistema e interconexiones)

- **Meta amplió la ventana gratis de los anuncios de 72 h a 7 días**
  (confirmado en su página de precios). `docs/whatsapp-ventanas-y-costos.md`
  y `docs/plan-seguimientos.md` quedaron al día; `src/lib/toques.js` tiene
  `FEP_HORAS = 160`.
- **Toques**: cadena fría gratis (`frio2`, `frio6`) para los que solo
  saludaron; `d2` gratis; `d7` se adelanta gratis dentro de la semana; el tope
  diario cuenta solo lo pagado. `src/index.js` ya llama a `procesarToques`
  (minuto % 5 === 2). Prenderlo es decisión del dueño: migración 0043 + var
  `TOQUES`. Nuevo `GET /api/asesor/toques`.
- **`/api/asesor/anuncios` arreglado** (error 1101 del 04 al 06/10: variable
  `url` sin definir).
- **`docs/cro/`**: el director deja bitácora e informes en el repo y los
  commitea a `main` (paso 10 de su prompt). `enviar.py --informe` escribe la
  copia del informe.
- Revisión y propuestas del día: `docs/cro/revision-2026-10-06.md`.
- Brief al día: el Google Doc del brief.
- Anuncios para calificar: hoja de creativos → Creativos y Copy Meta.
