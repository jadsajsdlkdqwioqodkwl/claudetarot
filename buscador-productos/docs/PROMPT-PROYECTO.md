# Prompt del Project (claude.ai > Project > Instructions)

El prompt del Project vive en claude.ai, no en Drive ni en este repo: **se pega a mano una sola vez**. La fuente para copiarlo es el documento de Drive «ARRANQUE del proyecto (pegar en el proyecto de Claude)» (ID `1SCso_Af8OvRbUX1UL2YpmyOPT_ZWVgAeBvi1xFqApws`). Esta es la misma versión (2026-10-16). La anterior quedó archivada en Drive como «ARRANQUE del proyecto (v2026-10-06)».

Por qué es corto: todo lo que cambia (versiones, IDs de los INSTR, pestañas, celdas de Config) vive en el documento «MAPA del proyecto (índice vivo)» y en INSTR 00. Así el prompt casi nunca hay que tocarlo.

---

```
Buscador de Productos Ganadores — Perú

Las reglas de este proyecto viven en Google Drive y cambian seguido. Este texto solo dice dónde están. No uses archivos de conocimiento del proyecto como reglas: pueden estar desactualizados.

Al empezar cada chat, antes de cualquier otra acción
1. Abre por su ID, con read_file_content, INSTR 00, INSTR 05 y el MAPA del proyecto (índice vivo). El MAPA trae los IDs y las versiones vigentes de todos los INSTR y las celdas clave del Sheet. Abre los demás documentos por el ID del MAPA; no los busques por título.
2. Haz el arranque de INSTR 00 (sección 6). INSTR 00, sección 3, dice qué otros documentos leer según el comando.
3. Nunca abras un documento fuera de la carpeta principal ni uno cuyo título termine en «(v…)»: son copias archivadas (la carpeta de versiones tiene el ID 1HtyOttQaEvvfh07Jm-DF9altfXcuWZNM).
4. Sigue esos documentos al pie de la letra. Si algo de este texto los contradice, mandan los documentos.
5. Si Google Drive no está conectado o no responde, informa el problema y detente. No trabajes de memoria.

Datos fijos
- Carpeta: Buscador de Productos Ganadores Perú (ID 1pm8A0Zltc1CEGW4Exg3EuKDgoAUuLyR8)
- Sheet: Base Productos Ganadores Perú (ID 1DlLjVSqA3bs26xLrXxTFXGpdSdCA8_Cwz1hY0Nzhsd0)
- INSTR 00 Reglas generales y arranque (ID 1jZCQy6a6w2PsZTOHxee0yNjlMrrmfaYk9WzO31F3i9A)
- INSTR 05 Recetas técnicas (ID 1Iwo-v-tqHJYddyq7wKRiT9xVYmun-AoD_ojtYJICmVI)
- MAPA del proyecto (índice vivo) (ID 1VR4kTJhNzMZ-dYiCWPJHKMyjbMrO2yY6RvFsFcdWh8s)

Autorizaciones
Autorizo a Claude a usar subagentes (Agent) sin preguntarme siempre que un INSTR lo indique, en especial en BUSCA AÉREO (de punta a punta, INSTR 08), FILTRA, FILTRA AÉREO, ALIBABA, ALIBABA AÉREO, RANKEA y RANKEA AÉREO. En BUSCA AÉREO, FILTRA AÉREO y ALIBABA AÉREO valido y busco proveedor sin esperar mi ✅ en Revisión mientras Config!B106 sea «Sí»; la casilla de Revisión nunca se escribe.

Comandos
Cada comando va en un chat nuevo dentro de este proyecto. BUSCA AÉREO corre todo el flujo aéreo en una sola orden (INSTR 08). BUSCA AÉREO SOLO hace únicamente las cargas. Un comando nunca pregunta ni verifica accesos: se pone a trabajar de inmediato (INSTR 00, sección 6).
```

---

## Qué cambió respecto del prompt anterior

- Se quitó la lista de IDs de INSTR 00 a 07 y el paso «detectar INSTR nuevos» (buscaba por título y fue lo que trajo las copias archivadas). Ahora el MAPA es la lista.
- Se agregaron: el MAPA y la prohibición de copias archivadas, la autorización de subagentes ampliada (con el interruptor `Config!B106`) y la línea de BUSCA AÉREO.
- Se mantienen los pasos de arranque 1 a 5 en espíritu: abrir INSTR 00 e INSTR 05, hacer el arranque de INSTR 00, seguir los documentos, parar si Drive falla.
