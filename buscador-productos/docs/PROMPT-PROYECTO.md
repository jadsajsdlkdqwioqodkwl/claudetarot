# Cambios al prompt del Project (claude.ai)

> **Actualización 2026-10-16: ya no hay nada obligatorio que pegar.** Todo lo que los chats necesitan está en Drive: el documento «MAPA del proyecto (índice vivo)» (ID `1VR4kTJhNzMZ-dYiCWPJHKMyjbMrO2yY6RvFsFcdWh8s`) y INSTR 00 v4.20, que cada chat abre primero por su ID y que lo enlaza. INSTR 00 trae la regla de no abrir la carpeta de versiones ni títulos «(v…)», de usar INSTR 08 aunque el prompt no lo liste, y de no avisar por eso. INSTR 08 sección 2 trae la autorización de subagentes y de validar sin esperar el ✅.
>
> Los cuatro cambios de abajo quedan como **opcionales** (refuerzan lo mismo desde el prompt). Si los pegas, el único que cambia algo visible es el 1: evita el aviso de «hay un INSTR que no está en Datos fijos» en cada arranque.

El prompt del Project vive en claude.ai (Project > Instructions), no en Drive ni en este repo: hay que pegarlo a mano. Son tres cambios.

## 1. Agregar INSTR 08 a «Datos fijos»

Sin esto, cada chat nuevo avisa «hay un INSTR que no está en Datos fijos» (paso 3 del arranque). Agrega esta línea a la lista de documentos vigentes:

```
  - INSTR 08 BUSCA AÉREO de punta a punta y Laboratorio: 1QCt6LLHP4mB9LCRaPNxO-1lP1LqhwNiPB4KAtjYBwbM
```

## 2. Ampliar la autorización de subagentes

Texto actual:

> Autorizo a Claude a usar subagentes (Agent) sin preguntarme siempre que un INSTR lo indique, en especial en ALIBABA, ALIBABA AÉREO, RANKEA y RANKEA AÉREO.

Texto nuevo (la autorización ya cubre «cuando un INSTR lo indique», pero nombra solo esos cuatro comandos; esto evita dudas con BUSCA AÉREO, FILTRA y el Juez):

```
Autorizo a Claude a usar subagentes (Agent) sin preguntarme siempre que un INSTR lo indique, en especial en BUSCA AÉREO (de punta a punta, INSTR 08), FILTRA, FILTRA AÉREO, ALIBABA, ALIBABA AÉREO, RANKEA y RANKEA AÉREO. En BUSCA AÉREO, FILTRA AÉREO y ALIBABA AÉREO valido y busco proveedor sin esperar mi ✅ en Revisión mientras Config!B106 sea «Sí»; la casilla de Revisión nunca se escribe.
```

## 3. Una línea sobre el comando

Agrega, debajo de «Arranque»:

```
BUSCA AÉREO corre todo el flujo aéreo en una sola orden (INSTR 08). BUSCA AÉREO SOLO hace únicamente las cargas.
```

## 4. Que no abra copias archivadas de los INSTR (agregado 2026-10-16)

El 2026-10-16 un chat de BUSCA AÉREO dijo usar «INSTR 00 v4.16 e INSTR 06 v3.26»: eran copias archivadas de la carpeta de versiones (ID `1HtyOttQaEvvfh07Jm-DF9altfXcuWZNM`), no los documentos vigentes (INSTR 00 v4.19, INSTR 06 v3.33). Con las copias viejas no existen `Config!B103` (fila libre del Log BUSCA), las bandas de ventas, la paginación ni RANKEA en tandas por defecto. Agrega al paso 3 del arranque:

```
Los INSTR vigentes están solo en la carpeta principal (ID 1pm8A0Zltc1CEGW4Exg3EuKDgoAUuLyR8) y se abren por su ID de «Datos fijos». Nunca abras un documento de la carpeta de versiones (ID 1HtyOttQaEvvfh07Jm-DF9altfXcuWZNM) ni uno cuyo título termine en «(v…)»: son copias archivadas. Si dudas, la versión vigente figura en la primera línea del documento (INSTR 00 v4.19 o posterior, INSTR 06 v3.33 o posterior, INSTR 08 v1.0 o posterior) y su título no termina en «(v…)».
```

## Qué no hace falta cambiar

- Los pasos 1, 2, 4 y 5 del arranque.
- La prioridad de los INSTR sobre este texto.
- Nada para que Claude Code «permita» subagentes: la herramienta ya está; lo que decide si los usa es esta autorización más lo que dice el INSTR.
