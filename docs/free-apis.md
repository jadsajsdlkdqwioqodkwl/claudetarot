# APIs LLM gratuitas con un router local

Fuente: [open-free-llm-api/awesome-freellm-apis](https://github.com/open-free-llm-api/awesome-freellm-apis) (MIT, actualizado el 2026-10-19). Los límites cambian con frecuencia; compruébalos en su web antes de depender de ellos.

## Proveedores recomendados

| Proveedor | Tarjeta | Modelo sugerido (ID) | Límite del plan gratuito | Clave |
|---|---|---|---|---|
| Google Gemini | No | `gemini-3.6-flash` | 15 RPM, 1.500 RPD | https://aistudio.google.com/app/apikey |
| Groq | No | `llama-3.3-70b-versatile` | 30 RPM, 14.400 RPD | https://console.groq.com/keys |
| OpenRouter | Registro (saldo de $10 para algunos modelos) | `nvidia/nemotron-3-ultra-550b-a55b:free` | Modelos `:free`, ~1K RPD con topup | https://openrouter.ai/workspaces/default/keys |

Las cifras son las que indicaba el README en la fecha de arriba.

## Opción A: LiteLLM como proxy local (recomendado)

LiteLLM expone un endpoint compatible con OpenAI y, con `/v1/messages`, con Anthropic, así que Claude Code puede apuntar a él.

### 1. Instalar

```bash
pip install 'litellm[proxy]'
```

### 2. Guardar las claves como variables de entorno

No pongas las claves en ningún archivo del proyecto.

```bash
export GEMINI_API_KEY="tu-clave-de-gemini"
export GROQ_API_KEY="tu-clave-de-groq"
export LITELLM_MASTER_KEY="sk-local-$(openssl rand -hex 16)"
```

### 3. Crear `litellm-config.yaml` (fuera del repo o en una carpeta ignorada)

```yaml
model_list:
  - model_name: gemini-flash
    litellm_params:
      model: gemini/gemini-3.6-flash
      api_key: os.environ/GEMINI_API_KEY

  - model_name: llama-groq
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: os.environ/GROQ_API_KEY

router_settings:
  fallbacks:
    - gemini-flash: ["llama-groq"]     # si Gemini se queda sin cuota, usa Groq
  num_retries: 2

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
```

### 4. Arrancar el proxy

```bash
litellm --config litellm-config.yaml --port 4000
```

### 5. Probarlo

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-flash","messages":[{"role":"user","content":"Hola"}]}'
```

### 6. Usarlo desde Claude Code (solo cuando llegues al límite)

```bash
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_AUTH_TOKEN="$LITELLM_MASTER_KEY"
export ANTHROPIC_API_KEY=""
```

Para que Claude Code use Gemini o Groq, el `model_name` debe coincidir con el modelo que pide Claude Code, o asignarlo con `model_name: claude-sonnet-5-5` en el YAML. Ten en cuenta que:

- Calidad y tool use varían mucho entre modelos gratuitos; Claude Code depende de llamadas a herramientas bien formadas.
- Revisa el `/v1/messages` de tu versión de LiteLLM antes de confiar en él.

## Opción B: OpenRouter directo (sin proxy)

Es la opción más simple, pero sin fallback automático.

```bash
export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
export OPENAI_API_KEY="$OPENROUTER_API_KEY"
```

Los modelos gratuitos llevan el sufijo `:free`. El README también indica usar OpenRouter como endpoint de Claude Code con `ANTHROPIC_BASE_URL=https://openrouter.ai/api`; eso requiere un saldo de $10 para algunos modelos de Anthropic.

## Opción C: modelos locales (sin límite)

Si necesitas uso ilimitado y privado, Ollama, LM Studio o llama.cpp sirven como endpoint compatible con OpenAI. Apunta LiteLLM a `http://localhost:11434` con `model: ollama/<modelo>`.

## Buenas prácticas

- Nunca subas claves al repositorio. Añade `litellm-config.yaml` a `.gitignore` si lo guardas en el proyecto.
- Usa una clave maestra local (`LITELLM_MASTER_KEY`) para que el proxy no quede abierto en la red.
- Empieza con Groq o Gemini: no piden tarjeta.
- Si un proveedor cambia sus límites, actualiza la tabla antes de confiar en el fallback.
