# Prueba de funcionamiento en Claude Code del navegador

Abre una sesión nueva en Claude Code (navegador) sobre este repo y pega el texto de abajo, tal cual.

---

Haz una prueba de las herramientas de este repo y dame un informe corto, en 10 líneas o menos. Revisa en este orden y responde con ✅ o ❌ por cada punto:

1. **Plugins:** ¿`claude-code-setup` y `claude-mem` aparecen activos? (`/plugin` o lista de plugins).
2. **CodeGraph:** ¿el servidor `codegraph` está conectado? Luego busca con `codegraph_explore` la función `textoSirvePara` y dime en qué archivo está. Si no devuelve nada, dilo.
3. **Memoria:** guarda esta nota con la herramienta de memoria: "prueba de sesión web, fecha de hoy". Luego búscala y confirma que la encontraste. Además, busca "herramientas del equipo" en claude-mem y dime si hay algo.
4. **Reglas:** ¿lees la sección «Herramientas del equipo» de `CLAUDE.md`? Dime las tres reglas en una línea cada una.
5. **Skills de seguridad:** ¿aparecen las skills de Strix (por ejemplo `penetration-testing-with-strix`)? Solo dilo; no las ejecutes.
6. **Chequeo del proyecto:** corre `npm install` y luego `npm run check`. Dime solo cuántos chequeos fallaron y el nombre de cada uno que falle. No cambies nada del código.
7. **Arranque:** ¿existe `.claude/hooks/session-start.sh` y su configuración en `.claude/settings.json`?

No cambies archivos ni hagas commits en esta prueba. Si algo falla, dime qué y en qué paso, sin proponer arreglos largos.

---
