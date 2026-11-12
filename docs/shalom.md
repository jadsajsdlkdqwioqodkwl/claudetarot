# Shalom (provincia) — envío masivo desde el sistema: cómo funciona HOY

> Estado ACTUAL. Se reescribe cuando cambia algo; la historia está en `docs/MAPA.md` y el prompt de la Routine en `docs/routines.md`.
> Creado el 2026-11-08, el día que Shalom Pro aceptó por primera vez un Excel armado por el sistema (2 envíos registrados).

## Qué reemplaza
Registrar cada envío de provincia a mano en Shalom Pro (Registro individual: DNI, teléfono, agencia por código, medida XXS, sin
protegido, sin comprobante, sin cobro seguro, clave de 4 dígitos) o pelearse con el Excel masivo, que rechazaba los archivos.

## Por qué fallaba el Excel masivo (y qué se hizo)
1. La plantilla oficial (`data/shalom-masivo-plantilla.xlsx`, «Formato Pro Masivo») la genera el servidor de Shalom: 14 columnas
   (A–N) más una columna O vacía con formato, dos hojas ocultas con las tablas de agencias («Medidas», «Hoja2»), 2 206 textos
   compartidos y propiedades del documento (título «Excel de Plataformas PRO», autor SHALOM EMPRESARIAL).
2. Cualquier programa que vuelva a guardar el libro cambia eso. Primer síntoma: la celda O1 vacía sale como número sin valor y Shalom
   dice «columnas adicionales no permitidas: 0». Segundo síntoma, al quitar la columna: «El archivo no corresponde a la plantilla
   oficial» (cambiaron propiedades, hojas y textos).
3. Solución: `scripts/asesor/shalom.py` → `llenar_plantilla()` copia la plantilla **byte a byte** y solo escribe las celdas con datos
   (A DNI, B teléfono, F origen, G destino, H mercadería, M cantidad) dentro de `xl/worksheets/sheet1.xml`, agregando los textos a
   `xl/sharedStrings.xml` como lo hace Shalom. Nada más cambia. **No tocar esa función sin volver a probar una subida real.**

## El flujo completo (Routine «Shalom — Excel de envío masivo», manual «Run now», `trig_013nuA3ZdCtxtkVNbJPvMxox`)
1. `shalom.py masivo` toma los pedidos de **PROVINCIA confirmados** del registro del reporte «Pedidos y ventas» para la fecha de
   despacho (mañana por defecto): nombre, WhatsApp, DNI, kits, lo que el cliente escribió de su agencia, adelanto y saldo.
2. Para cada uno elige la **agencia de Shalom** con `buscar` sobre las 566 agencias reales (`data/shalom-agencias.json`, API pública de
   shalom.com.pe; `agencias --actualizar` las refresca). «Seguro» solo si el texto nombra algo propio de la agencia (avenida, nombre) o
   es la única agencia del distrito nombrado. Lo dudoso queda listado; la Routine lee el chat (`dinsides.py chat <wa>`) y fija la
   agencia con `--agencias ajustes.json`; si ni así, se le pregunta al cliente y no entra al Excel.
3. **Clave de seguridad (sagrada):** nadie la asigna, ni el Worker ni la Routine. Solo con la clave del día que el dueño escribe en la
   sesión (`--clave NNNN`, o después `shalom.py clave NNNN /tmp/shalom/lote.json`) se crean o corrigen las ventas de la pestaña
   **Ventas** con esa clave, que es la que el CRM le mandará al cliente cuando pague el saldo. Sin clave no se toca la hoja Ventas y la
   referencia dice «PENDIENTE». La clave va SOLO en el archivo de referencia; nunca en Telegram, en prompts ni al cliente.
4. Genera dos archivos y, con `--subir`, los deja en **CRM → Reportes** (links que llegan por Telegram):
   - `masivo-FECHA.xlsx`: la plantilla oficial con los datos (es lo que se sube a Shalom Pro).
   - `masivo-FECHA-referencia.xlsx`: por fila, nombre, WhatsApp, DNI, texto del cliente, agencia elegida (código completo), otras
     candidatas, kits, nota, qué revisar, **CLAVE**, adelanto y saldo.
5. **Paso humano en Shalom Pro** (probado 2026-11-08): Registra → Registro de envíos masivos → Sube el archivo → Continuar → aparece
   «N envíos registrados» (Shalom autocompleta el nombre por DNI y **puede reemplazar el celular por el de su base**: mirar) →
   «Ingresar clave de seguridad» en cada envío con la clave del archivo de referencia (o «CLAVE MASIVA» si todas son iguales) →
   «Registrar envíos» → imprimir boletas → foto de boleta + caja al número de la empresa → Routine de boletas (como siempre).
6. Lo que no puede hacer el sistema: Shalom Pro bloquea cualquier acceso que no sea un navegador (403 desde la nube), así que subir el
   archivo, teclear las claves y confirmar lo hace una persona (o Cowork en la computadora del dueño).

## Columnas del Excel (el masivo no autocompleta por DNI: todo viene del chat)
| Columna | Valor | De dónde |
|---|---|---|
| DESTINATARIO (DOC) | DNI de 8 dígitos | lo que escribió el cliente (reporte, `dni`) |
| TELF. DESTINATARIO | celular de 9 dígitos | WhatsApp del cliente (o el que dio para recoger) |
| ORIGEN | CHORRILLOS CO | fijo: de donde salen los paquetes |
| DESTINO | nombre de la agencia tal como lo llama Shalom (último tramo del código) | `buscar` / ajuste |
| MERCADERIA | PAQUETE XXS | la medida más barata (S/8); alto, ancho, largo y peso los calcula la plantilla |
| CANTIDAD | kits del pedido | reporte |
| CONTACTO, TELF. CONTACTO, NRO GRR, COBRO SEGURO | vacíos | regla del dueño: sin cobro seguro |

## Comandos
- `python3 scripts/asesor/shalom.py masivo [FECHA …] [--solo N] [--agencias ajustes.json] [--sin-ventas] [--subir] [--salida x.xlsx]`
- `python3 scripts/asesor/shalom.py buscar "lo que escribió el cliente"` · `agencias [--actualizar]` · `telegram "texto"`
- Primera subida real: 2026-11-08, archivo de 2 filas (Dhajyana → AV PARRA 379, Luzgardo → GARATEA), «2 envíos registrados».

## 2026-11-09 · `montos()` corregido y referencia con «QUÉ LLEVA»

`kits` 0 ya se lee como 0 (antes caía en 1): precio del texto del empaque o aviso «MONTO». «Pagado / pago completo / sin saldo» →
saldo 0. Extra con precio o descuento → aviso «MONTO: … confirmar el saldo» (pendiente en la presentación). La referencia pone
«QUÉ LLEVA: <empaque>» delante de la nota. Flujo con presentación previa (B1 sin `--subir` → B2 tabla → OK → B3) en
`docs/envios-jennifer.md`.

## 2026-11-11 · 2 o más kits = UN paquete XS

Regla del dueño: con 2 o 3 kits (o más) el envío es **un solo PAQUETE XS, cantidad 1**, no N paquetes XXS. `cmd_masivo` pasa
`mercaderia: "PAQUETE XS", cantidad: 1` a `llenar_plantilla()` (la función no se tocó); 1 kit sigue como PAQUETE XXS × 1.
**Pendiente de comprobar en la primera subida real con un XS** que Shalom Pro acepta el texto «PAQUETE XS» en la columna
MERCADERIA (la plantilla solo trae de ejemplo «PAQUETE L»; «PAQUETE XXS» sí está probado). Si lo rechaza, el nombre exacto está en el
desplegable de la plantilla y se cambia en una línea de `cmd_masivo`.
