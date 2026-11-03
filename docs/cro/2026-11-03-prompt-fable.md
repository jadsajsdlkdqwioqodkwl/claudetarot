# Prompt para Fable · Implementar los experimentos CRO de Tarot Store

> Para pegar tal cual en una sesión nueva de Claude Code (Fable) sobre el repo
> `claudetarot`. Lo armó la sesión de análisis CRO del 03/11/2026 con los datos
> del CRM y las decisiones del dueño. El informe completo con los números está en
> `docs/cro/2026-11-03-plan-cro.pdf` (fuente `.html` al lado).

---

## 0. Quién eres y cómo trabajas aquí

Eres el ingeniero que va a dejar funcionando, en el CRM de Tarot Store Perú,
la infraestructura para tres cosas:

- los **seguimientos de 7 días** por segmento (Lima, provincia y sin destino);
- un **modo "tester"** para probar flujos nuevos con una sola vendedora;
- el primer experimento: **"Yape en 2 tiempos"** para provincia.

El dueño quiere tocar lo menos posible: **tú dejas todo configurado** (planes,
textos, respuestas rápidas, experimento, tester) y el CRM le da una pantalla
simple para hacer cambios chicos él solo (editar un texto, apagar un paso,
pausar una prueba).

**Antes de tocar nada, lee:**

- `CLAUDE.md` (reglas del dueño, no se negocian).
- `docs/MAPA.md` (qué se conecta con qué; en el MAPA **solo se agrega**, nunca se borra).
- `docs/seguimientos.md` (cómo funcionan HOY los seguimientos; se reescribe con tu cambio).
- `docs/plan-seguimientos.md`, `docs/negocio.md` y `docs/whatsapp-ventanas-y-costos.md`.
- `docs/cro/2026-11-03-plan-cro.html`.
- La skill `voz-tarot-store`, para **todo** texto que vea un cliente.
- Usa `codegraph_explore` antes de grep o de leer archivos completos.

**Reglas que más te pueden morder en esta tarea** (están en `CLAUDE.md`):

- Sin emojis en la interfaz del CRM: solo iconos de `public/crm/icons.js` (`icon("nombre")`; si falta uno, lo agregas ahí). Los emojis solo van en el texto que se le manda al cliente.
- No borrar ni esconder funciones por tu cuenta. Lo que se reemplaza queda como alternativa o apagado, y se anota en el MAPA.
- Nada de opciones fijas que el dueño debería poder elegir (cuántos pasos, a qué hora, qué %): todo editable.
- Todo texto al cliente pasa por `pausaEnvio()` / `mandarTexto()` / `mandarConEscribiendo()` (1,5 s de "escribiendo…"). Nunca llames directo a `enviarTexto`/`enviarTemplate`. Usa el `env` que reciben los callbacks (`envDeConversacion`).
- Prohibida la API de Claude/Anthropic y Apps Script. Las hojas solo con el conector de Sheets o desde el Worker.
- Nunca hables de costos en dinero salvo que el dueño lo pida (lo de las plantillas pagadas sí se puede explicar: lo pidió él).
- `npm run check` y `npm run check:gs` antes de subir. Las migraciones de D1 se aplican a mano (`wrangler d1 execute claudetarot-crm --remote --file …`). Ojo: D1 se pone lento con muchas consultas seguidas (error 971, "espera 240 s").
- Despliegue: por ahora los cambios van a `main` (el deploy es automático) **y** a la rama de la sesión. **Cada respuesta que cambie código termina con el link de vista previa del Worker** (formato en `docs/MAPA.md`, "Regla: cada respuesta de código lleva el link de vista previa"). La vista previa usa la base de producción: lo que hagas ahí es real.
- Cada cambio actualiza `docs/MAPA.md` (agregando) y `docs/seguimientos.md` (estado actual) en el mismo commit.
- Si el dueño pide algo explícito, se hace. Si hay un riesgo real, se dice en una línea y se sigue.

---

## 1. Decisiones del dueño (03/11/2026)

**SÍ, ahora:**

1. **Fotos sueltas en vez del mini catálogo en "Provincia msj. 2".** El dueño ya las dejó como opción en esa rápida y quedan así. No borres la versión de catálogo: retírala o déjala apagada.
2. **Prueba "Yape en 2 tiempos" solo con testers.** Arranca con Jennifer, que es la más activa. No se le puede imponer a todo el equipo.
3. **Seguimiento todos los días durante los 7 días gratis**, a horas distintas, con estructuras diferentes para Lima, provincia y sin destino. Todo encapsulado en **pocos planes con nombre** (unos 4) que se reutilizan, como hoy la "secuencia de interesados" o el "plan universal", en vez de 24 mensajes sueltos.
4. **Horario de envío automático: 06:30 a 23:30** (hoy está 06:00–23:30).
5. **Poder elegir el orden de las fotos en las respuestas rápidas**, como ya se puede en la bienvenida.
6. **Un banco de plantillas de seguimiento de 7 días** (Lima, provincia y general) para que el dueño elija y las mande a Meta.

**NO por ahora:** muestra gratis (PDF), adelanto de S/10 vs S/20, experimentos del bono digital (se verán mañana), cambio de precio.

**DESPUÉS (déjalo preparado y documentado, no lo actives):**

- **Precio S/99** con las clases grabadas incluidas, cuando terminen de subirse. El dueño ya eligió S/99 sobre S/95.
- **Bono digital** como regalo de seguimiento o venta extra cuando esté listo.
- **Imágenes de la bienvenida:** las reordena el dueño (la bienvenida ya permite ordenar fotos). "Fotos en vivo" para Lima pueden ir ahí.

---

## 2. Lo que ya existe (estado al 03/11, verificado en código y D1)

### Hoy conviven cinco fuentes de mensajes automáticos

1. **Secuencia de interesados**
   - Tablas `followup_sequences` / `followup_sequence_steps`; ajuste `ad_followup_sequence_id = 1` ("Seguimiento interesados").
   - Pasos: +4 h "registramos hasta las 12…" con catálogo `*`, y +15 h "…collar amuleto EXTRA" con producto `78mcjs3mw7`.
   - La programa `programarSeguimientoDeInteresados` (`src/lib/crm-interesados.js`) cada vez que sale la bienvenida, con `programarSecuenciaSeguimiento` (`src/lib/crm-db.js`).
   - **No admite plantillas:** solo texto, foto o catálogo, con `delay_minutes` acumulado.
2. **Cadena de una respuesta rápida**
   - Columnas `quick_replies.followup_pasos` y `followup_universal`.
   - Plan universal en `crm_settings.seguimiento_universal`.
   - Funciones: `normalizarPasosSeguimiento`, `pasosDeSeguimientoRapida` y `programarPasosEnChat` (`src/lib/crm-db.js`).
   - Hasta `MAX_PASOS_SEGUIMIENTO = 6` pasos, de texto o de plantilla, con `desde: "inicio"` ("día N del chat").
   - Hoy ninguna rápida usa el universal (`followup_universal = 0` en todas). Tienen pasos propios: Provincia Msj. 3 (id 38), Lima msj. 3 (9), Pedir captura (21), Si no dice dónde (27) y SEPARAR LIMA (100).
3. **Rescate del día 7**
   - `rescate7Dias` (`src/lib/rescate-lead.js`): plantilla al día 6 + 18 h del inicio del chat a quien no compró.
   - Ajuste `rescate7_auto = 1`; plantilla elegible con `rescate7_plantillas`; de fábrica `rescate_lead_catalogo_1` o `rescate_lead_1`.
4. **Toques**
   - `src/lib/toques.js`, lista `TOQUES` en `wrangler.jsonc` (d2, d7, d14, d30, post…). Grupo de control: 1 de cada 5 (`id % 5 = 0`). Tope diario `TOQUES_MAX_DIA = 40`.
   - **No sale si el chat tiene un seguimiento programado pendiente.**
   - Verifica si los de lead (d2/d7) están aprobados y saliendo: en los chats del 20/10 al 02/11 no apareció ninguno.
5. **Planes de recojo y aviso de envío:** `src/lib/planes-plantilla.js`. No se tocan.

**Reglas de la cadena** (`docs/seguimientos.md`):

- Solo el cliente corta la cadena (`cancelarSeguimientosPendientes` en el webhook).
- Una sola cadena automática por chat: mandar una rápida con seguimiento reemplaza la anterior.
- Un texto nunca sale pasadas 23 h del último mensaje del cliente; las plantillas no tienen ese tope.
- Red de seguridad: `MAX_AUTOMATICOS_SIN_RESPUESTA = 6` en `crm-cron.js`.
- A quien compró no se le manda nada.

### Pruebas A/B de mensajes

- Tabla `variantes` (`tipo` rapida/bienvenida, `ref_id`, `texto`, **un solo** `media_key`), usos en `variante_usos`.
- Pesos tipo Thompson y estadísticas (`respondieron` en 24 h, `avanzaron`, `cerraron`) en `src/lib/crm-variantes.js`.
- **El sorteo de una rápida ocurre en el navegador** (`sortearVersion` / `usarQuickReply` en `public/crm/app.js`). Con `orden_versiones` fijo sale siempre la predeterminada (la primera), sin sorteo.
- Estado actual:
  - Provincia msj. 1 (id 4): `orden_versiones = [97,0,80]`.
  - Provincia msj. 2 (id 5): `[74,0,81]`, con **7 fotos** en `quick_reply_media`; la #81 ya no está activa.
  - Provincia Msj. 3 (id 38): `[0,94,65]`.
- **Verifica primero** cómo quedó la prueba de "fotos sueltas" que montó el dueño en Provincia msj. 2:
  - si las dos versiones mandan de verdad cosas distintas (una versión solo guarda **un** `media_key` y no tiene catálogo propio);
  - y si el orden fijo hace que siempre salga la misma.
  - Repórtale al dueño qué se está midiendo realmente antes de declarar ganador.

### Otras piezas

- **Orden de fotos:** `quick_reply_media.sort_order` se fija en el orden en que se suben (`POST`/`PATCH /api/crm/quick-replies` con `media_keys`) y no hay forma de reordenar en la interfaz. La bienvenida sí la tiene: `PATCH /api/crm/welcome-sequence {id, orden_media:[ids]}` y su interfaz en `app.js` (~línea 1127). Copia ese patrón.
- **Horario:** `HORARIO_ENVIO: "06:00-23:30"` en `wrangler.jsonc`; lógica en `src/lib/horario.js` (`enSilencio`, `ajustarAlHorario`). Si un mensaje cae en el hueco, se corre a la apertura si la ventana sigue abierta, si no a las 23:29, y si tampoco se puede, se cancela. Las plantillas solo se corren a la apertura. Lo usan crm-cron, toques, sugerencias y pedidos web.
- **Plantillas para Meta:** `src/lib/plantillas-propuestas.js`; en el CRM, Herramientas → Plantillas para Meta, botón "Mandar a Meta" (`crearTemplate`). El admin puede editar el texto mientras está "Sin enviar" (`plantillas_textos`). `AUTOENVIAR` manda algunas solas. Una ya mandada no se cambia con el mismo nombre. El cron `vigilarPlantillas` avisa por Telegram cuando Meta aprueba o rechaza.
- **Roles:** `agents.role` (admin, lectura, …), `conAuth` / `conAdmin` en `src/lib/crm-auth.js`, Equipo en `src/api/crm/agents.js`. **No existe "tester".**
- **Destino del chat** (Lima o provincia): `src/lib/crm-destino.js` (`destinosDeChats`). Úsalo para segmentar.

### Ventana de WhatsApp y costos

Está verificado en el informe, sección 2:

- Un chat que llega de un anuncio de clic a WhatsApp tiene el "free entry point" de **7 días**: todo mensaje, plantillas de marketing incluidas, sale **gratis**.
- Texto libre solo dentro de las 24 h desde el último mensaje del cliente.
- Pasado el día 7, cada plantilla de marketing se paga.

**Conclusión de diseño:**

- Los pasos de los días 1 a 6 van como **plantillas con botones de respuesta rápida**. Si el cliente toca un botón, se abren 24 h para escribirle libre.
- El primer día pueden ir textos libres.
- Nada automático después del día 7, salvo los toques y rescates que ya existen.

### Ojo con el nombre en las plantillas

Las plantillas con `{{1}}` = primer nombre del perfil salieron como "Hola Dios 🩷", "Hola El 🩷", "Hola . 🩷". **Las nuevas van sin variable de nombre** ("Hola estimad@"), o con un nombre filtrado y respaldo "estimad@".

### Ojo con el precio en las plantillas

El precio va a pasar a S/99 y una plantilla aprobada no se puede editar. **Las plantillas nuevas no llevan precio ni saldo** (nada de S/89 ni S/69).

---

## 3. Qué construir (diseño recomendado, en fases)

La idea es **pocas piezas genéricas** que el dueño pueda reutilizar, no casos especiales. Cada fase se sube por separado, con su prueba en `npm run check`, su entrada en el MAPA y el link de vista previa.

### Fase 1 · Planes de seguimiento con nombre (reemplaza al único "plan universal")

**Modelo**
- Tabla nueva `planes_seguimiento`:
  - `id`, `nombre`, `segmento` ('general' | 'lima' | 'provincia');
  - `pasos` (JSON, misma forma que hoy: `{horas | dia+hora, body, botones, media, plantilla, desde, activo}`);
  - `activo`, `version_b` (JSON o null), `reparto_b` (0–1), `created_at`, `updated_at`.
- Migración nueva en `migrations/`, aplicada a mano.
- Copia `seguimiento_universal` como plan "Universal" (id 1). **No borres el ajuste**: déjalo como respaldo de lectura.

**Pasos nuevos**
- Agrega **"día N a las HH:MM"** (`dia`, `hora` en hora de Lima, contado desde el primer mensaje del cliente, como `desde:"inicio"`). Es lo que pide el dueño: "todos los días a diferentes horas".
- Mantén `horas` (relativo al paso anterior) para los pasos del mismo día.
- Respeta el horario 06:30–23:30, el tope de 23 h para textos y el día 7 para plantillas: en el editor, un paso que caería después del día 7 se marca "se paga".
- Sube `MAX_PASOS_SEGUIMIENTO` a **10** y `MAX_AUTOMATICOS_SIN_RESPUESTA` en concordancia. Un plan diario de 7 días tiene 8 a 9 pasos.
- Actualiza `docs/negocio.md`: hoy dice "como mucho 2 mensajes automáticos seguidos".

**Quién usa los planes**
- Columna `quick_replies.followup_plan_id`. El selector del editor de rápidas pasa a ser "Plan: [lista de planes] · Pasos propios · Sin seguimiento". `followup_universal = 1` se lee como plan 1, por compatibilidad.
- Ajuste nuevo `plan_interesados_id`. Si está puesto, al salir la bienvenida se programa ese plan con `programarPasosEnChat` en vez de `followup_sequences`. Si no, sigue el camino viejo. **No borres `followup_sequences`** ni la secuencia 1: el dueño decide cuándo cambiar.

**Convivencia, sin mensajes dobles** (decídela, documéntala y pruébala)
- Un plan activo bloquea los toques d2/d7 (ya pasa: los toques no salen si hay seguimiento pendiente). Confírmalo con un test.
- El rescate del día 6 + 18 h (`rescate7Dias`) queda como último paso común a todos los planes. Ningún plan manda una plantilla ese mismo día después de las 12:00.
- Si cambia el destino del chat (pasa de sin destino a Lima o provincia), el plan nuevo reemplaza al anterior. Ya pasa al mandar una rápida con plan.

**Interfaz** (admin; sin emojis, con iconos)
- Pantalla "Planes de seguimiento" (en Herramientas o dentro de Respuestas rápidas), con:
  - lista de planes;
  - línea de tiempo del día 0 al 7 con cada paso (texto, foto, plantilla; hora; etiqueta gratis/se paga);
  - editar texto, botones y hora; apagar y prender pasos; duplicar un plan.
  - Para plantillas, solo se eligen las aprobadas (si un paso usa una no aprobada, se ve "esperando a Meta" y se salta).
- La barra "Seguimiento" del chat y "Reactivar" (`src/api/crm/seguimiento.js`) muestran el nombre del plan.

**A/B de planes**
- Cada plan puede tener una versión B con su % de reparto.
- Asignación determinista por `conversation_id` (hash), guardada en una tabla de asignaciones (ver Fase 2: usa la misma).
- Métricas por brazo, visibles en la pantalla de Pruebas:
  - respondió en 24 h tras cada paso;
  - tocó un botón;
  - compró en 7 días (etapa 5 o evento Purchase en `capi_events`);
  - pidió que no le escriban o bloqueó.
- Exponlas también en `/api/asesor/contexto` para que las Routines (director CRO) las lean.

**Planes iniciales que dejas creados y activos para el dueño** (textos en la sección 4):

| Plan | Cuándo arranca | Segmento |
|---|---|---|
| **INT · Interesado sin destino** | al salir la bienvenida (con `plan_interesados_id`, cuando el dueño lo apruebe) | general |
| **LIMA · Sin ubicación** | al mandar "Lima msj. 3" | lima |
| **PROV · Sin adelanto** | al mandar "Provincia Msj. 3" y, en la prueba, "Provincia 2T · 2" | provincia |
| **PROV-2T · Sin ciudad** | al mandar "Provincia 2T · 1" (solo brazo B de la prueba) | provincia |

### Fase 2 · Testers y experimentos de flujo ("Yape en 2 tiempos")

**Recomendación: no inventes un rol nuevo.** El rol cambia permisos y es fuente de bugs. Agrega una marca **`agents.tester` (0/1)**, con un interruptor en CRM → Equipo (solo admin), y una pieza genérica **"Experimento de flujo"** que sirva para esta prueba y las que vengan.

**Modelo**
- `experimentos`:
  - `id`, `nombre`, `estado` (activo | pausado | terminado), `segmento` ('provincia');
  - `solo_testers` (1), `reparto` (0.5);
  - `brazo_a` (JSON: ids de rápidas del flujo de control), `brazo_b` (JSON: ids del flujo nuevo);
  - `created_at`, `cerrado_at`.
- `experimento_chats`: `experimento_id`, `conversation_id`, `brazo` ('A' | 'B'), `agente`, `asignado_at`, con UNIQUE(experimento_id, conversation_id).

**Asignación**
- Cuando una **tester** está en un chat del segmento (provincia según `crm-destino.js`, o cuando toca la primera rápida de cualquiera de los dos brazos) y el chat no tiene brazo, se le asigna uno por hash de `conversation_id` (50/50) y queda guardado.
- Los chats de vendedoras que no son tester **nunca entran**: flujo normal y fuera de las estadísticas.
- Si otra vendedora toma después un chat ya asignado, el brazo se respeta.

**Interfaz para la tester**
- En el panel de respuestas rápidas de ese chat, las rápidas del **otro** brazo se ocultan y las del brazo propio suben arriba con la etiqueta "Prueba · 2 tiempos" o "Prueba · control".
- La cabecera del chat muestra el brazo con un icono.
- El admin puede cambiar el brazo de un chat a mano. Queda anotado y ese chat sale de las estadísticas.

**Brazo A (control):** la cadena de hoy, Provincia msj. 1 → msj. 2 (fotos) → Msj. 3 (Yape) seguidos.

**Brazo B "2 tiempos":** dos respuestas rápidas nuevas que creas tú. Copia las fotos de "Provincia msj. 2" (mismas claves de R2, en el orden que elija el dueño).
- **"Provincia 2T · 1"** (texto + fotos de Yapes y envíos), con el plan **PROV-2T · Sin ciudad**:
  > Claro estimad@ 🩷 para provincia le enviamos por Shalom u Olva y el envío es gratis ✨ Le comparto fotos de envíos y pagos de otras clientas. ¿Para qué ciudad y agencia lo desea? Si tiene alguna duda también me cuenta ☺️
- **"Provincia 2T · 2"** (se manda **solo cuando el cliente responde**), con el plan **PROV · Sin adelanto**:
  > Perfecto estimad@ ☺️ para separarlo es solo un adelanto de S/20 que se descuenta del total, y el resto lo paga al recoger en su agencia ✨ El Yape es al 927633099 (Moisés O.), nos confirma la captura y le pedimos sus datos 🫶

  Pásalos por `voz-tarot-store` y muéstraselos al dueño antes de activar. Él los puede editar en el CRM.

**Métricas** (pantalla de Pruebas y `/api/asesor/contexto`), por brazo:
- chats;
- respondió después del primer mensaje de provincia;
- **mandó el adelanto en 72 h y en 7 días** (la principal: compra o etapa 5);
- tiempo hasta la compra.

**Volumen realista:** Jennifer atiende unos 16 chats nuevos por día, el ~60 % de provincia, o sea ~10 por día.
- Para ver una diferencia de 15 % → 25 % hacen falta ~150 a 200 chats por brazo: **4 a 6 semanas**.
- Recomiéndale al dueño sumar una segunda tester (Mayra tiene el mejor índice ajustado) para acortarlo.
- Que la pantalla diga "faltan N chats para leer el resultado" en vez de declarar ganador antes.

**Setup que haces tú:** Jennifer con `tester = 1`, el experimento creado y activo, las rápidas 2T creadas, y los planes conectados.

### Fase 3 · Orden de fotos en respuestas rápidas

- En el editor de rápidas: flechas o arrastre para ordenar las fotos y videos, igual que en la bienvenida.
- `PATCH /api/crm/quick-replies {id, orden_media:[ids]}`, que actualiza `quick_reply_media.sort_order` sin volver a subir nada.
- Revisa que el envío respete `sort_order`: `GET` ya ordena por `sort_order, id`.
- Si para la prueba de fotos hace falta que **una versión** lleve varias fotos propias (hoy `variantes` tiene un solo `media_key`), propón la tabla `variante_media` y **pregúntale al dueño antes** de construirla.

### Fase 4 · Horario 06:30–23:30

- `HORARIO_ENVIO: "06:30-23:30"` en `wrangler.jsonc`.
- Revisa que `ajustarAlHorario` corra (y no cancele) los pasos de plantilla, y que los de texto respeten la regla de 23 h.
- Actualiza el comentario de `src/lib/horario.js`, `docs/seguimientos.md` y el MAPA.
- Prueba con fechas límite: 23:29, 23:31, 06:29, 06:31.

### Fase 5 · Banco de plantillas de 7 días ("Mandar a Meta" con un toque)

- Agrégalas a `plantillas-propuestas.js` como el grupo **"Seguimiento 7 días"** (solo Tarot; categoría Marketing, `es_PE`; botones de respuesta rápida de 20 caracteres como máximo; sin `{{1}}`; sin precio).
- **No las mandes solas** (nada de `AUTOENVIAR`): el dueño elige cuáles y toca "Mandar a Meta". El cron ya le avisa por Telegram cuando se aprueban.
- Los textos están en la sección 4.

### Fase 6 · Preparar, no activar: precio S/99 y bono digital

**Inventario del precio.** Haz la lista de todo lo que tiene S/89, S/69 (saldo), S/79 (descuento) o S/149 (2 kits):
- pasos de la bienvenida, respuestas rápidas y sus versiones, pasos de seguimiento, planes;
- plantillas aprobadas (no se editan: hay que crear otras);
- `public/index.html` (web) y precio del catálogo de Meta;
- `docs/negocio.md`, la skill `voz-tarot-store`;
- `src/lib/toques.js`, scripts del asesor (`scripts/asesor/…`: saldos, PDF, control de ventas);
- y textos de anuncios.

Propón cómo se cambia en un solo paso, por ejemplo un ajuste `precio_kit` y `{precio}` / `{saldo}` donde tenga sentido. **No lo ejecutes:** el dueño lo activa cuando las clases estén cargadas. Con S/99 el saldo de provincia pasa a S/79, y el descuento de cierre y el precio de 2 kits los decide él.

**Bono digital:** deja anotado en el MAPA dónde se enchufaría:
- un paso del plan del día 5 ("si lo separa esta semana le regalamos las clases grabadas"), como versión B frente al collar extra;
- una rápida de venta extra post-compra.

El dueño lo define mañana.

---

## 4. Textos (voz de las vendedoras; revísalos con `voz-tarot-store`)

### Plantillas de marketing para el banco (sin nombre, sin precio)

**General (sin destino)**
- **G1** · "Hola estimad@ 🩷 le cuento que cada carta del kit trae su significado impreso, así puede leer desde el primer día sin memorizar nada ✨ ¿Para qué distrito o ciudad sería?" · [Lima] [Provincia]
- **G2** · "Hola estimad@ ☺️ el kit llega con su mazo de 78 cartas, manual en español, tapete y collar amuleto de regalo, con envío gratis a todo el Perú 📦 ¿Le gustaría separar el suyo?" · [Quiero el mío] [Tengo una duda]
- **G3** · "Hola estimad@ 🩷 muchas clientas empiezan sin saber nada de tarot: el manual le enseña paso a paso desde cómo barajar hasta su primera tirada ✨ ¿Desea que le cuente cómo le llega?" · [Sí, cuénteme] [Ahora no]
- **G4** · "Hola estimad@ ☺️ hoy salieron kits para Lima y provincia. En Lima se paga recién al recibir y a provincia va por Shalom u Olva 📦 ¿Desea que le separemos uno?" · [Lima] [Provincia]
- **G5** (oferta aprobada: collar extra) · "Hola estimad@ 🩷 si separa su kit esta semana le regalamos un collar amuleto extra, además del que ya trae ✨ ¿Se lo separamos?" · [Sí, quiero] [Ahora no]
- **G6** (cierre de la semana) · "Hola estimad@ ☺️ para no incomodarle, este es nuestro último mensaje de la semana. Si quiere su kit con el collar extra de regalo, solo toque el botón 🫶" · [Quiero mi kit] [No, gracias]

**Lima**
- **L1** · "Hola estimad@ 🩷 para Lima el envío es gratis y paga recién al recibir, con Yape, efectivo o tarjeta ✨ ¿Me indica su distrito para agendarlo?" · [Agendar mi kit] [Tengo una duda]
- **L2** · "Hola estimad@ ☺️ el motorizado le llama antes de llegar y, si usted no está, puede recibirlo un familiar 📦 ¿Para qué día le acomoda?" · [Mañana] [Otro día]
- **L3** · "Hola estimad@ 🩷 si esta semana se le complica, se lo dejamos agendado para el día que prefiera ✨ ¿Qué día le viene mejor?" · [Esta semana] [La próxima]
- **L4** · "Hola estimad@ ☺️ cada carta trae su significado impreso, así puede hacer su primera lectura el mismo día que le llega ✨ ¿Se lo enviamos mañana?" · [Sí, mañana] [Otro día]
- **L5** · "Hola estimad@ 🩷 agendándolo esta semana le regalamos un collar amuleto extra, además del que ya trae el kit ✨ ¿Se lo agendamos?" · [Sí, agendar] [Ahora no]

**Provincia**
- **R1** · "Hola estimad@ 🩷 a provincia lo enviamos por Shalom u Olva y el envío es gratis ✨ ¿Me indica su ciudad y la agencia más cercana?" · [Shalom] [Olva]
- **R2** · "Hola estimad@ ☺️ los S/20 del adelanto se descuentan del total, y el resto lo paga al recoger en su agencia 📦 ¿Le quedó alguna duda con el pago?" · [Ya entendí] [Tengo una duda]
- **R3** · "Hola estimad@ 🩷 todos los días enviamos kits a provincia y le mandamos la boleta de Shalom con su clave para recoger ✨ ¿Desea ver fotos de los envíos de hoy?" · [Sí, quiero ver] [Ya quiero el mío]
- **R4** · "Hola estimad@ ☺️ en nuestro Instagram puede ver envíos y comentarios de clientas de todo el Perú 🫶 ¿Le separamos el suyo para que salga mañana?" · [Separar mi kit] [Tengo una duda] (pregunta si quiere un botón de URL al Instagram)
- **R5** · la G5 sirve igual. **R6** · la G6 sirve igual.

> Revisa la regla 10 de la voz (cada toque aporta algo nuevo) y que ningún plan repita el mismo dato dos días seguidos. Las de Lima solo van a chats de Lima y las de provincia solo a provincia (`crm-destino.js`).

### Planes iniciales (textos del primer día + plantillas por día; horas de Lima)

**INT · Interesado sin destino**

| Cuándo | Paso |
|---|---|
| +40 min | Texto con botones [Lima] [Provincia] [Tengo una duda]: "Estimad@, le cuento que el envío es gratis a todo el Perú y en Lima paga recién al recibir ☺️ ¿Para qué distrito o ciudad sería?" |
| +3 h | Texto + foto de envíos del día: "Así salieron hoy los kits para Lima y provincia 📦 ¿Desea que le separemos el suyo?" |
| +20 h | Texto: "Una consulta estimad@, ¿lo quiere para usted o es para regalo? ☺️ Así le cuento lo que más le sirve" |
| Día 2 · 19:30 | G1 |
| Día 3 · 12:30 | G3 |
| Día 4 · 20:30 | G4 |
| Día 5 · 09:30 | G5 |
| Día 6 + 18 h | El rescate que ya existe |

**LIMA · Sin ubicación** (después de Lima msj. 3)

| Cuándo | Paso |
|---|---|
| +1 h | "Estimad@, con su ubicación 📍 y el teléfono de quien recibe se lo dejamos agendado para mañana de 12 a 5 pm ✨ ¿Desea que lo agendemos?" |
| +20 h | "Si mañana no puede, se lo agendamos para el día que usted prefiera ☺️ ¿Qué día le acomoda?" |
| Día 2 · 19:00 | L4 |
| Día 3 · 12:30 | L2 |
| Día 4 · 20:30 | L3 |
| Día 5 · 10:00 | L5 |
| Día 6 + 18 h | Rescate |

**PROV · Sin adelanto** (después de Msj. 3 o de 2T · 2)

| Cuándo | Paso |
|---|---|
| +45 min | "Estimad@, a veces da un poco de desconfianza mandar el adelanto a alguien que no conoce ☺️ Si quiere le paso fotos de los envíos de hoy por Shalom, ¿le quedó alguna duda?" |
| +4 h | Texto + foto de boleta Shalom real (datos tapados): "Así le llega la boleta de Shalom con su clave para recoger 📦 Los S/20 se descuentan del total ✨ ¿Para qué agencia sería?" |
| +20 h | "Si prefiere, puede ver nuestros envíos y comentarios en Instagram antes de separar ☺️ ¿Le separamos el suyo para que salga mañana?" |
| Día 2 · 20:00 | R3 |
| Día 3 · 13:00 | R2 |
| Día 4 · 19:30 | R4 |
| Día 5 · 10:30 | G5 |
| Día 6 + 18 h | Rescate |

**PROV-2T · Sin ciudad** (después de 2T · 1, solo brazo B)

| Cuándo | Paso |
|---|---|
| +1 h | "Estimad@, ¿para qué ciudad sería? Así le confirmo la agencia de Shalom u Olva más cercana ☺️" |
| +20 h | "Si tiene alguna duda del envío o del pago me cuenta con confianza 🫶 ¿Le quedó alguna?" |
| Día 2 · 20:00 | R1 |
| Día 3 · 13:00 | R3 |
| Día 4 · 19:30 | R4 |
| Día 5 · 10:30 | G5 |
| Día 6 + 18 h | Rescate |

Las horas de los días 2 a 5 son deliberadamente distintas (mañana, mediodía y noche) para ver a qué hora responden más. Deja la hora editable por paso y mide la respuesta por hora en las estadísticas del plan.

---

## 5. Lo que el dueño hace (lo mínimo)

1. Aprobar los textos (rápidas 2T, planes, plantillas) cuando se los muestres. Puede editarlos en el CRM.
2. Elegir qué plantillas del banco van a Meta y tocar "Mandar a Meta".
3. Decir cuándo la bienvenida pasa de la secuencia de interesados vieja al plan INT (`plan_interesados_id`).
4. Avisarle a Jennifer que es tester.
5. Más adelante: activar el precio S/99 y el bono.

## 6. Cómo verificar antes de decir "listo"

- `npm run check` y `npm run check:gs` en verde (el chequeo "la foto de la variante es una banda horizontal" ya fallaba antes; dilo si sigue).
- Tests nuevos en `scripts/`, sumados a `npm run check`:
  - un plan diario no programa nada entre las 23:30 y las 06:30;
  - un texto no pasa de 23 h desde el último mensaje del cliente;
  - las plantillas después del día 7 se marcan como "se pagan";
  - no hay dos cadenas en el mismo chat;
  - un toque no sale con un plan activo;
  - la asignación A/B es estable para el mismo chat;
  - una no-tester nunca entra al experimento;
  - el orden de fotos se respeta.
- Pruébalo en la vista previa con un chat de prueba (es producción: usa el número del dueño o el sandbox de bienvenida). Muestra la línea de tiempo de cada plan.
- Al final de cada respuesta: qué hiciste, qué quedó pendiente de decisión del dueño, y el link de vista previa.

## 7. Lo que NO debes hacer

- No mandar mensajes a clientes ni aprobar sugerencias.
- No activar el precio ni el bono.
- No borrar la secuencia de interesados vieja, ni el plan universal, ni la versión de catálogo de Provincia msj. 2.
- No mandar plantillas a Meta solas.
- No cambiar los planes de recojo de Shalom ni el despacho automático de boletas.
- No tocar la pausa de 1,5 s de "escribiendo…".
