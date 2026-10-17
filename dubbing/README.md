# Doblaje Tarot (panel con ElevenLabs)

Página para arrastrar creativos (mp4, mov, mp3, wav), traducirlos a español, previsualizar y descargar
(uno por uno o todo en un zip). Corre en Cloudflare Workers; la clave de ElevenLabs vive como secreto
del Worker, nunca en el repo ni en el navegador.

- **Dubbing v1** (0,33 USD/min con marca de agua, 0,50 sin marca): entrega el video doblado. No tiene control de similitud ni dialectos.
- **Dubbing v2** (2,20 USD/min): control de similitud de voz 0 a 10 (cloning strength) y dialecto es-MX; entrega solo el audio WAV.
- `public/glosario.json`: palabras que no deben salir (cel, celular, ostias, tío, che...). En v1 el panel lee el guion traducido y avisa si aparece alguna.

## Poner en línea / actualizar
```
cd dubbing && npm install
export CLOUDFLARE_API_TOKEN=...
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put APP_PASSWORD     # la clave que pide el panel
npx wrangler deploy
```
