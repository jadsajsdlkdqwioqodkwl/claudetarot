# Routine diaria: voz del cliente → brief (Google Doc) y ángulos

La corre la Routine "Voz del cliente → brief y ángulos" a mediodía (Lima).
Es la rutina del brief de `docs/anuncios/rutina-brief-drive.md` más la pestaña
Voz del cliente. Gasta pocos tokens; no inventes: todo sale de un chat real.

**El brief vivo es el Google Doc `1nYC6QcslGKQYjVBrO3arQnr6wqMWhC7v8n7OEXGwKh0`.
Se edita SIEMPRE ese mismo documento (lo leen el Project de conceptos y otras
skills por ese link). Prohibido crear otro, copiarlo o mandarlo a la papelera.**

## 1. Brief

Haz los pasos 1 a 5 de `docs/anuncios/rutina-brief-drive.md` (leer negocio.md
y el Doc, juntar lo nuevo de los clientes, actualizar el brief según "Cómo
mantener este documento" y reescribir el MISMO Doc con el conector de Google
Docs). Además de lo que ese paso 3 lista, lee las transcripciones de las
últimas 24 h:

    ASESOR_CLAVE=$CLAVE python3 scripts/asesor/preparar.py api --dias 1 --salida /tmp/voz

## 2. Pestaña Voz del cliente

En la hoja 19bzd_a3zPY5st_VDzrFNpzW0RNi1feuAGYYZEjfn_NY, pestaña **Voz del
cliente** (lee antes sus últimas 40 filas para no repetir), una fila por
hallazgo nuevo de los chats, debajo de la última:
A Fecha · B Tipo (frase | objeción | avatar | ángulo | por qué compró) ·
C Hallazgo (1–2 líneas) · D Cita textual del cliente (sin nombres ni
teléfonos) · E Cuántos chats · F Consciencia (solo ángulos) · G Gancho estilo
Gary Halbert (solo ángulos) · H Usado en lote (vacío). Máximo 15 filas por
día; avatares solo si se repiten en 2+ chats. Esta pestaña la lee el Project
de conceptos para los anuncios.

## 3. Informe

Paso 6 de `rutina-brief-drive.md` (Telegram al dueño con `enviar.py
--informe`), sumando cuántas filas agregaste a Voz del cliente. Si te falta el
conector de Google Docs o de Google Sheets, dilo en la primera línea del
informe ("conecta Google Docs / Google Sheets a esta rutina") y no escribas en
Drive por otro camino.

No hagas commits ni cambies código.
