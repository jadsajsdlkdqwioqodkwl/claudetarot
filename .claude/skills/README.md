# Skills del asesor y del director CRO

Skills que cargan las Routines de Claude (plan, sin API) al trabajar en este
repo. Copiadas de repos MIT y adaptadas a la regla de la casa:

> **La IA nunca manda mensajes.** Lee chats, mide y propone. Todo lo que
> redacta sale por `scripts/asesor/enviar.py` → `/api/asesor/sugerencias` →
> CRM ✨ Sugerencias, donde una persona lo aprueba, lo corrige o lo descarta.
> Lo mismo con respuestas rápidas nuevas, variantes de mensajes y cambios a
> la bienvenida: se proponen, no se aplican.

Reglas del negocio: `docs/negocio.md`. Ventanas y costos de WhatsApp:
`docs/whatsapp-ventanas-y-costos.md`. Datos: `scripts/asesor/contexto.py`,
`embudo.py`, `memoria.py`.

## Qué skill para qué

| Skill | Origen | Uso aquí |
|---|---|---|
| `cro` | coreyhaines31/marketingskills | Auditar la bienvenida, la secuencia de bienvenida y las aperturas (primer mensaje humano) como si fueran una landing: propuesta de valor, CTA, confianza, fricción |
| `ab-testing` | coreyhaines31 | Diseñar el experimento: hipótesis, métrica (llegó a etapa 4/5 del embudo), tamaño de muestra, cuándo cortar |
| `sms` | coreyhaines31 | Flujos de mensajería de ecommerce (bienvenida, carrito, postventa, win-back) aplicados a WhatsApp. Ignorar TCPA/10DLC (EE.UU.); aquí mandan las ventanas de 24 h / 72 h |
| `offers` | coreyhaines31 | Oferta del kit, regalo, garantía, urgencia. Solo dentro de lo que permite `docs/negocio.md` |
| `marketing-psychology` | coreyhaines31 | Prueba social, anclaje, aversión a la pérdida en los textos |
| `customer-research` | coreyhaines31 | Informe semanal de voz del cliente: objeciones, palabras que usan, por qué compran |
| `ads` | coreyhaines31 | Estrategia de Meta (Click-to-WhatsApp): cuándo apagar/escalar, fatiga, estructura de tests. Solo recomienda; no toca campañas |
| `objection-handling` · `closing` · `follow-up-discipline` · `sales-process-optimization` | louisblythe/sales-skills | Coaching y playbook para las vendedoras; mejorar respuestas rápidas |
| `conversation-ab-testing` · `ab-message-testing` | louisblythe | Variantes de respuestas rápidas y de bienvenida, y cuál gana |
| `objection-pattern-learning` | louisblythe | Objeciones nuevas agrupadas → propuesta de respuesta rápida |
| `win-loss-reason-extraction` | louisblythe | Por qué se ganó o perdió cada chat (entrada del director CRO) |
| `conversation-quality-scoring` | louisblythe | Puntaje por chat y por vendedora → coaching |
| `ghost-recovery-sequences` · `re-engagement-sequencing` | louisblythe | Secuencias para chats que dejaron de responder (propuestas, dentro de 24 h o con plantilla) |
| `buying-signal-amplification` · `intent-detection` | louisblythe | Marcar intención de compra para priorizar la bandeja |
| `cross-sell-upsell-detection` | louisblythe | 2 kits, collar extra, mazo Classic/Gold |
| `prospect-fatigue-detection` · `drip-pacing-intelligence` | louisblythe | No insistir de más; tiempos de cada paso |
| `human-in-the-loop-training` · `feedback-loop-integration` | louisblythe | Aprender de `texto_original` vs. lo aprobado y de si hubo compra → `asesor_memoria` |

## Cómo leer las skills de louisblythe

Están escritas para construir un bot que responde solo. Aquí se usan como
**criterio de análisis**, no como arquitectura (cada una lleva este aviso al
inicio):

- Donde dicen "el bot responde / envía / dispara", léase "el asesor propone
  una sugerencia para ✨ Sugerencias".
- El código Python de ejemplo es ilustrativo. No se implementa un servicio
  aparte ni se llama a ninguna API de IA: el razonamiento lo hace la Routine.
- "Aprender" = anotar una lección con evidencia en `asesor_memoria`, o
  proponer una respuesta rápida / variante nueva. Nunca cambiar algo en vivo.
- Límite de insistencia: el de `docs/negocio.md` (3–4 mensajes dentro de las
  24 h; nada masivo no pedido), aunque la skill sugiera más.

## Licencias

- coreyhaines31/marketingskills — MIT © 2025 Corey Haines (sin la carpeta `evals/`).
- louisblythe/sales-skills — MIT (según su README).
