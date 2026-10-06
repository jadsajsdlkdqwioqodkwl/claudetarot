# Rutina diaria: brief de anuncios → Google Doc (2 pm Lima)

Google Doc (link fijo, para el Project de Claude):
https://docs.google.com/document/d/1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0/edit

Configuración de la Routine (claude.ai → Routines → nueva):
- Nombre: `Brief de anuncios — actualizar Google Doc (2 pm)`
- Horario: `CRON_TZ=America/Lima 47 13 * * *` (13:47, queda listo a las 2 pm)
- Sesión nueva en cada corrida, repo `jadsajsdlkdqwioqodkwl/claudetarot`
- Conectores: **Google Drive** y **Google Docs** (sin Google Docs no puede
  reescribir el mismo documento; Drive solo crea archivos nuevos y el Project
  perdería el link).
- En el prompt, reemplazar `<CLAVE>` por la misma clave del asesor que usan las
  otras rutinas.

## Prompt

Eres quien mantiene al día el BRIEF DE ANUNCIOS de Tarot Store Perú (investigación, avatar y offer brief del Kit Tarot de Aprendizaje). El dueño lo usa como instrucción de un Project de Claude, así que tiene que quedar actualizado HOY antes de las 2 pm (Lima) y SIEMPRE en el mismo documento (mismo ID y link: si creas otro, el Project deja de verlo). Sé riguroso: no inventes datos, solo agrega lo que los chats y números prueban. Gasta pocos tokens. No hagas commits ni cambies código. CLAVE = `<CLAVE>`. DOC_ID = `1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0`.

1. Repo: si no estás dentro de un clon de `jadsajsdlkdqwioqodkwl/claudetarot`, pide acceso con `add_repo` (cárgala con ToolSearch) y clónalo. Usa `main` actualizado. Lee `docs/negocio.md` (precios y regalos vigentes: mandan sobre el brief). Lee también `docs/anuncios/brief-avatar-oferta.md` (si no está en main: `git fetch origin && git log --all --format=%H -1 -- docs/anuncios/brief-avatar-oferta.md` y `git show <hash>:docs/anuncios/brief-avatar-oferta.md`).

2. Lee el Google Doc con `read_file_content` (fileId = DOC_ID). ESA es la versión viva del brief. Si el archivo de GitHub tiene secciones o entradas de la Bitácora que el Doc no tiene, súmalas.

3. Lo nuevo de los clientes (últimas 24 h; la semana para tendencias):
- `ASESOR_CLAVE=CLAVE python3 scripts/asesor/contexto.py --salida /tmp/brief/negocio.md`
- `ASESOR_CLAVE=CLAVE python3 scripts/asesor/embudo.py api --dias 7 --salida /tmp/brief` → embudo.json, perdidos.txt, sin_respuesta.txt.
- `curl -s -A tarot-asesor/1.0 -H "x-asesor-clave: CLAVE" "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/anuncios?dias=7"`
- En Drive, la "Bitácora CRO Tarot" más reciente (entrada de hoy: experimentos y anuncios).
Busca: frases literales nuevas de clientes (sin nombres ni teléfonos), objeciones nuevas o que crecen, qué anuncio/ángulo trae chats que compran, cambios de precio u oferta, datos demográficos nuevos.

4. Actualiza el brief según su sección "Cómo mantener este documento": corrige la sección que toca sin duplicar, datos propios > externos, precios los de negocio.md, nada se borra (lo viejo: "(obsoleto desde AAAA-MM-DD: motivo)"), y arriba en la "Bitácora de aprendizajes" una línea por aprendizaje: `AAAA-MM-DD · fuente · aprendizaje (números)`. Cambia siempre la fecha de "Última actualización" del inicio (o "(sin cambios)"). Sin emojis nuevos.

5. Escribe EN EL MISMO DOCUMENTO con el conector de Google Docs (ToolSearch "google docs update_doc read_doc"): read_doc para el revisionId y el endIndex; en UN batch con writeControl.requiredRevisionId borra el cuerpo (deleteContentRange 1 a endIndex-1), inserta el texto nuevo y aplica HEADING_1/2/3 a los títulos y bullets a las listas. Vuelve a leerlo para verificar. PROHIBIDO crear otro documento, copiarlo o mandar el actual a la papelera. Si no tienes herramientas de Google Docs, no escribas en Drive: manda la alerta del paso 6 ("conecta Google Docs a esta rutina") con los aprendizajes de hoy en 5 viñetas.

6. Informe (máx. 120 palabras, texto plano): qué cambió hoy en el brief o "sin cambios", y alertas. `ASESOR_CLAVE=CLAVE python3 scripts/asesor/enviar.py --informe /tmp/brief/informe.txt`. Si falla, ponlo en tu respuesta final.
