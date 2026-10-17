# Doblaje de creativos a español neutro (ElevenLabs Dubbing)

1. `cd dubbing && npm install`
2. Copia `.env.example` a `.env` y pega tu clave (`ELEVENLABS_API_KEY`). `.env` no se sube al repo.
3. Pon tus creativos (mp4, mov, mp3, wav...) en `entrada/` (con subcarpetas si quieres).
4. `npm run doblar` — deja en `salida/` el archivo `.es.mp4`, el `.srt` y un `.reporte.json`.

Opciones: `--idioma-origen en` (por defecto detecta), `--hablantes 2` (por defecto detecta), `--sin-fondo` (quita música/fondo).
Lo ya doblado se salta; borra el archivo de `salida/` para rehacerlo.

## Español neutro
Se pide el idioma `es` con acento "neutral Latin American Spanish" (opción experimental de ElevenLabs; cambia con `ACENTO_DESTINO`).
`glosario.json` lista palabras prohibidas (cel, celular, ostias, tío, che, vale...): el script revisa el guion traducido
y las lista en `.reporte.json` y en consola. Si aparece alguna, se corrige el texto y se vuelve a generar.

## Similitud de voz
Siempre se clona la voz original de cada hablante (`disableVoiceCloning: false`). La API de Dubbing no tiene un
control de similitud 1 a 10: la clonación es automática. Si una voz no sale parecida, sube un audio más limpio.

## Costo
Se cobra por minuto de video según tu plan de ElevenLabs. Prueba primero con un creativo corto.
