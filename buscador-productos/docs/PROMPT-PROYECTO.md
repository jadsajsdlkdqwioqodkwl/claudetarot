# Cambios al prompt del Project (claude.ai)

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

## Qué no hace falta cambiar

- Los pasos 1, 2, 4 y 5 del arranque.
- La prioridad de los INSTR sobre este texto.
- Nada para que Claude Code «permita» subagentes: la herramienta ya está; lo que decide si los usa es esta autorización más lo que dice el INSTR.
