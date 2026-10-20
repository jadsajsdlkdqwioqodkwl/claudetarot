#!/usr/bin/env bash
# Prepara las herramientas del proyecto al iniciar una sesión (web, móvil o local).
# Es idempotente: si ya está todo instalado, no hace nada y termina sin error.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Índice de CodeGraph: solo la primera vez (la carpeta .codegraph está en .gitignore).
# Se usa npx para no depender del PATH; el servidor MCP (.mcp.json) también usa npx.
if [ ! -d .codegraph ]; then
  npx -y @colbymchenry/codegraph init -i >/dev/null 2>&1 || echo "session-start: codegraph init falló" >&2
fi

# Plugins del proyecto: si la sesión no los cargó, los instala (idempotente).
if command -v claude >/dev/null 2>&1; then
  for p in claude-mem@thedotmack claude-code-setup@claude-plugins-official; do
    if ! claude plugin list 2>/dev/null | grep -q "$p"; then
      claude plugin marketplace add thedotmack/claude-mem >/dev/null 2>&1
      claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1
      claude plugin install "$p" >/dev/null 2>&1 || echo "session-start: no se pudo instalar $p" >&2
    fi
  done
fi

# Agent Reach (RSS y YouTube): solo si hay uv y aún no está instalado.
if ! command -v agent-reach >/dev/null 2>&1 && command -v uv >/dev/null 2>&1; then
  uv tool install agent-reach >/dev/null 2>&1 \
    || echo "session-start: no se pudo instalar agent-reach" >&2
fi

exit 0
