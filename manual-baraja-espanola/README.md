# Manual de la baraja española (folleto imprimible)

PDFs listos para imprimir, con la misma imposición que el manual Rider-Waite
(4 hojas A4 apaisadas, 8 páginas por cara, 32 páginas):

- `booklet1.pdf`: hoja 1 (cara A: 32, 1, 28, 5 / 30, 3, 26, 7; cara B: 6, 27, 2, 31 / 8, 25, 4, 29)
- `booklet2.pdf`: hoja 2 (cara A: 24, 9, 20, 13 / 22, 11, 18, 15; cara B: 14, 19, 10, 23 / 16, 17, 12, 21)

## Regenerar

```
python3 build.py        # escribe out/booklet1.pdf y out/booklet2.pdf
```

Necesita Chromium (`/opt/pw-browsers/chromium-*/chrome-linux/chrome`, ajusta
`CHROME` en `build.py`), `pypdf`, `pdfplumber` y las fuentes en `fonts/`
(no se suben al repo por licencia): `Aptos.ttf`, `Aptos-Bold.ttf`,
`Aptos-Italic.ttf`, `Aptos-Bold-Italic.ttf` (descarga oficial de Microsoft:
https://www.microsoft.com/en-us/download/details.aspx?id=106087) y
`Bahn-Light.ttf` (Bahnschrift Light, para el teléfono de la contraportada).

- `contenido.py`: todo el texto de las 32 páginas (tamaño de letra por página).
- `build.py`: geometría medida del PDF original (marcos, líneas de corte,
  portada, contraportada) y chequeo de que ningún texto pise el número de página.
- `cards/`: imágenes de las 48 cartas, de Guzmanillo en Wikimedia Commons
  (CC BY-SA 3.0), archivos `Aoros.png`, `2oros.png` … `Soros.png` (sota),
  `Coros.png` (caballo), `Roros.png` (rey), igual para copas, espadas y bastos.
- `img/`: portada y logo tomados del PDF original.
