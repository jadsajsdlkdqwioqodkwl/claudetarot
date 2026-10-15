# Buscador de Productos Ganadores — Perú

Sistema para encontrar productos ganadores (probados afuera, casi vírgenes en Perú, rentables) que un agente de Claude opera solo, sin preguntas, y que cada sesión deja listo para la siguiente.

> Esta carpeta es **independiente** del resto de `claudetarot` (que es Tarot Store). Sus reglas son las de `CLAUDE.md` de esta carpeta, no las del `CLAUDE.md` de la raíz. Está pensada para moverse tal cual a su propio repo (`git subtree split --prefix=buscador-productos`).

## Fuente de verdad

Las reglas **viven en Google Drive** y mandan sobre cualquier copia de aquí.
La carpeta de Drive, el Sheet y los IDs de los INSTR están en `docs/MAPA.md`.
Aquí se guarda: el espejo de lo que cambia, el manual corto de operación, la auditoría y el registro de decisiones.

## El sistema en una mirada: 2 flujos x 2 modos

| | Modo general (registro sanitario) | Modo aéreo (sin registro, liviano) |
|---|---|---|
| **Flujo 1: Descubrir** | BUSCA, luego RANKEA | BUSCA AÉREO, luego RANKEA AÉREO |
| **Flujo 2: Validar** | FILTRA, luego ALIBABA | FILTRA AÉREO, luego ALIBABA AÉREO |

```
PiPiAds --BUSCA--> Crudo (TODO se guarda, con su motivo) --RANKEA--> Productos (puntaje, estrellas)
                                                                         |
                                       usuario aprueba en la pestaña Revisión
                                                                         v
 Top / Oportunidades / Aéreo  <--ALIBABA-- proveedor, foto, peso  <--FILTRA-- Meta Perú (anunciantes)
```

- Modo general: Productos con Registro (P) distinto de Ninguno. Modo aéreo: P = Ninguno (Cola: Carril A).
- Cada modo tiene su lista de trabajo ya calculada en `Config!B95:B100`; un modo nunca toca las filas del otro.
- Nada se descarta: lo que no pasa un filtro queda en Crudo con su motivo y sirve de memoria.

## Qué hay aquí

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Reglas del agente: autonomía, ahorro de tokens, qué nunca tocar |
| `docs/OPERAR.md` | Manual corto por comando: qué leer, qué escribir, cómo cerrar |
| `docs/MAPA.md` | IDs de Drive, pestañas, columnas con fórmula, versiones vigentes |
| `docs/AUDITORIA-2026-10-15.md` | Hallazgos de la primera auditoría y su estado |
| `docs/BUSCA-AEREO-2026-10-15.md` | Intento de BUSCA AÉREO desde la nube, lectura del Log BUSCA y plan de cargas |
| `docs/DECISIONES.md` | Qué se decidió, por qué y el texto anterior (para poder revertir) |
| `docs/espejo/INSTR-06.md` | Copia de INSTR 06 v3.30 (comandos BUSCA, RANKEA, FILTRA, ALIBABA) |

## Cómo empezar una sesión

1. Abre un chat nuevo con esta carpeta y escribe el comando: `BUSCA`, `BUSCA AÉREO`, `RANKEA`, `FILTRA`, `ALIBABA` (cada uno con o sin `AÉREO`), `EXPLORA` o `MEJORA`.
2. Un comando por chat. Si el chat se corta, escribe `sigue`.
3. Si no escribes comando, el agente elige solo con la regla de `docs/OPERAR.md`.
