# Herramientas de Claude Code para este repo

Todo lo de esta página vive en el repositorio. Funciona en Claude Code en el navegador, en el móvil y en la computadora, siempre que la sesión abra este repo.

## Qué hay y para qué sirve

| Herramienta | Para qué sirve | Cómo se usa |
|---|---|---|
| **CodeGraph** | Busca código sin leer archivos completos, así gasta menos. | Automático. Pregunta normal: "¿dónde se calcula el precio?". |
| **Memoria del proyecto** | Guarda datos que le pidas recordar. | "Recuerda que el precio de la masilla es S/ 89". |
| **claude-mem** | Recuerda decisiones de sesiones anteriores. | "¿Qué decidimos sobre el seguimiento la vez pasada?" |
| **claude-code-setup** | Revisa el proyecto y sugiere automatizaciones. | "Recomiéndame automatizaciones para este proyecto". |
| **Strix** (skills de seguridad) | Auditorías y pruebas de seguridad. | Solo con autorización explícita. Ver abajo. |
| **Agent Reach** | Lee RSS y YouTube (por ahora). | "Lee el feed de este blog" o "resume este video". |
| **APIs gratuitas** | Respaldo cuando se acaban los límites de tu cuenta. | Ver `docs/free-apis.md`. |

## Reglas que Claude sigue en este repo

Están en `CLAUDE.md`, sección «Herramientas del equipo»:

- Busca primero con CodeGraph antes de leer archivos completos.
- Escribe el código mínimo: primero configuración, luego funciones nativas, luego lo que ya existe en el repo.
- Si pides algo explícito, lo hace sin discutir. El riesgo real se menciona en una línea.

## Qué se instala solo al iniciar una sesión

`.claude/hooks/session-start.sh` instala CodeGraph e indexa el repo, y también intenta instalar Agent Reach. Si algo falla, la sesión sigue funcionando.

Los plugins `claude-code-setup` y `claude-mem` se activan desde `.claude/settings.json`.

## Seguridad (Strix)

Las skills de Strix sirven para auditorías autorizadas. Nunca las uses contra el sitio en vivo sin autorización explícita, porque pueden tocar pedidos y datos reales. Empieza siempre por el código del repo.

## Lo que no está

- **Ponytail:** no hubo acceso al repositorio; sus reglas no están aquí.
- **Canales de Agent Reach para Reddit, X y GitHub:** la versión disponible no los trae.
- **`npm run check`:** tiene un fallo previo en la prueba de la variante en 4:5 (no es un bug del sitio).
