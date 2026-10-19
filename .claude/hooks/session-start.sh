#!/usr/bin/env bash
# Prepara las herramientas del proyecto al iniciar una sesión (web, móvil o local).
# Es idempotente: si ya está todo instalado, no hace nada y termina sin error.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# CodeGraph: el servidor MCP (.mcp.json) lo necesita en el PATH.
if ! command -v codegraph >/dev/null 2>&1; then
  npm install -g @colbymchenry/codegraph >/dev/null 2>&1 \
    || echo "session-start: no se pudo instalar codegraph" >&2
fi

# Índice del proyecto: solo la primera vez (la carpeta .codegraph está en .gitignore).
if command -v codegraph >/dev/null 2>&1 && [ ! -d .codegraph ]; then
  codegraph init -i >/dev/null 2>&1 || echo "session-start: codegraph init falló" >&2
fi

exit 0
