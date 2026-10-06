# Manuales imprimibles (Rider-Waite y baraja española)

Folletos listos para imprimir, 2 hojas A4 apaisadas a doble cara (volteo por el
borde corto), 8 páginas por cara, 32 páginas. Marcos simétricos: la cara B cae
exactamente sobre la cara A.

- `rider-waite/`: el manual original reconstruido (texto e imágenes del PDF
  original), con el Caballero de Oros que faltaba, el teléfono nuevo y los
  arcanos menores corridos una carta para hacerle sitio.
- `baraja-espanola/`: el manual de la baraja española.

En cada carpeta:

- `booklet1.pdf`: hoja 1 (cara A: 32, 1, 28, 5 / 30, 3, 26, 7; cara B: 6, 27, 2, 31 / 8, 25, 4, 29)
- `booklet2.pdf`: hoja 2 (cara A: 24, 9, 20, 13 / 22, 11, 18, 15; cara B: 14, 19, 10, 23 / 16, 17, 12, 21)

## Regenerar

```
python3 build.py        # escribe out_rw/ y out_es/ (o `build.py rw` / `build.py es`)
```

Necesita Chromium (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`, ajusta
`CHROME` en `build.py`), `pypdf`, `pdfplumber` y las fuentes en `fonts/`
(no se suben al repo por licencia): `Aptos.ttf`, `Aptos-Bold.ttf`,
`Aptos-Italic.ttf`, `Aptos-Bold-Italic.ttf` (descarga oficial de Microsoft:
https://www.microsoft.com/en-us/download/details.aspx?id=106087) y
`Bahn-Light.ttf` (Bahnschrift Light, para el teléfono de la contraportada).

- `contenido.py`: texto de la baraja española; `contenido_rw.py`: texto del
  Rider-Waite (sacado del PDF original con `extract_rw.py`).
- `build.py`: geometría medida del PDF original (marcos, líneas de corte,
  portada, contraportada) y chequeo de que ningún texto pise el número de página.
- `cards/`: imágenes de las 48 cartas, de Guzmanillo en Wikimedia Commons
  (CC BY-SA 3.0), archivos `Aoros.png`, `2oros.png` … `Soros.png` (sota),
  `Coros.png` (caballo), `Roros.png` (rey), igual para copas, espadas y bastos.
- `rwcards/`: miniaturas del Rider-Waite extraídas del PDF original
  (`pNN_k.png` = página NN, k-ésima imagen) y `knight_pentacles.png`.
- `img/`: portada y logo tomados del PDF original.
