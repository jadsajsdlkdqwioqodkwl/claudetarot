# "Si siempre" video: performance analysis and variations (2026-10-03)

Source: Meta Ads, USD account `1785535595797328`, lifetime data ("maximum").
The PEN account `1230044722526886` has no "si siempre" ads.
Live CRM/CX data (`contexto.py`) was not available in this session (no
`ASESOR_CLAVE`), so customer voice comes from `docs/negocio.md`,
`docs/plan-seguimientos.md` and `docs/anuncios/brief-avatar-oferta.md`.

## The ads

| Ad | Video | Length | Spend | Impr. | CPM | CTR | Conv. started | Cost/conv. | Purchases* |
|---|---|---|---|---|---|---|---|---|---|
| si siempre 8/26 (**winner**) | 1361715622146428 | 34 s | $701.69 | 307,764 | $2.28 | 3.18 % | 1,505 | **$0.47** | 16 |
| KEYWORDS SI SIEMPRE 8/8 | same | 34 s | $119.92 | 75,056 | $1.60 | 3.20 % | 449 | **$0.27** | 8 |
| si siempre 8/26 - api | same | 34 s | $502.05 | 169,804 | $2.96 | 2.73 % | 725 | $0.69 | 42 |
| video mejorado (**your variation**) | 1089749413705203 | 59 s | $155.28 | 35,245 | $4.41 | 2.57 % | 161 | $0.96 | 2 |
| video mejorado - Copy | same | 59 s | $58.23 | 17,537 | $3.32 | 2.75 % | 87 | $0.67 | 7 |
| claude1 | 1100075335869517 | 74 s | $80.46 | 24,596 | $3.27 | 3.22 % | 83 | $0.97 | 6 |
| woman sisiempre | – | – | $52.92 | 22,649 | $2.34 | 2.68 % | 73 | $0.72 | 1 |
| si siempre 8/26 - api - Copy | 1050072224492940 | – | $25.14 | 9,552 | $2.63 | 2.75 % | 31 | $0.81 | 1 |
| chisme ad | – | – | $25.55 | 7,051 | $3.62 | 4.40 % | 86 | $0.30 | 1 |

\* Purchases come from the pixel/CAPI and only started being sent partway
through. The "api" copy (launched 9/23) has 42 because purchases were being
tracked by then, not because it sold more. Compare conversations, not
purchases, across ads with different launch dates.

## Soft metrics (share of impressions)

Meta's MCP does not expose 3-second views, so "hook rate" is read here from
average play time + 25 % views. ThruPlay = 15 s or the end.

| Ad | Avg. play | 25 % | 50 % | 75 % | 100 % | ThruPlay | Hold (100 %/25 %) |
|---|---|---|---|---|---|---|---|
| Winner (34 s) | 5 s | 12.3 % (≈8.6 s) | 7.3 % (≈17 s) | 5.2 % | 3.5 % | 8.1 % | 29 % |
| KEYWORDS (34 s) | 5 s | 12.8 % | 7.7 % | 5.4 % | 3.6 % | 8.6 % | 28 % |
| api (34 s) | 4 s | 10.3 % | 5.9 % | 4.1 % | 2.7 % | 6.7 % | 26 % |
| Variation (59 s) | 5 s | 6.7 % (≈14.7 s) | 3.5 % (≈29 s) | 2.2 % | 1.2 % | 6.6 % | 17 % |
| Variation copy (59 s) | 5 s | 7.2 % | 4.2 % | 2.5 % | 1.4 % | 7.1 % | 20 % |
| claude1 (74 s) | 6 s | 7.2 % (≈18 s) | 4.6 % | 2.9 % | 1.6 % | 8.0 % | 23 % |

## What it says

1. **The hook works the same in both videos.** Average play time is 5 s on the
   winner and on the variation. People stopped scrolling equally; the first
   seconds weren't what changed.
2. **The variation lost on length.** At ~15 s, 8.1 % of viewers of the
   34 s video were still watching (ThruPlay) vs. 6.6 % for the 59 s one. At
   ~17 s the winner still kept 7.3 %. With twice the length, the price and
   the CTA come at the end, and only 1.2 % saw them (vs. 3.5 %). The 74 s
   "claude1" shows the same pattern.
3. **Meta charged more for it.** CPM went from $2.28 to $4.41. Less watch
   time and fewer clicks lower the ad's ranking, so each impression costs
   more. That plus a lower CTR (2.57 % vs. 3.18 %) doubled the cost per
   conversation ($0.96 vs. $0.47).
4. **The offer was worse.** The winner: S/79 "¡Solo por esta semana!" +
   "Mándanos un mensaje y te separo el tuyo hoy". The variation: S/89
   ("precio regular S/120") + "¡No lo dejes pasar!", with no concrete CTA.
   It also promises a "bolsa de terciopelo", which `docs/negocio.md` does not
   list as part of the kit. Check that before reusing it.
5. **The winner is wearing out.** Duplicating it ("- api", same video) gave
   $0.69 per conversation vs. $0.47 for the original, with a lower 25 %
   rate (10.3 % vs. 12.3 %). Same creative, worse result: that's audience
   fatigue / auction timing, not the video. The best version ran with
   keywords ("KEYWORDS SI SIEMPRE 8/8": $0.27, CPM $1.60). The original ad
   still shows `WITH_ISSUES` in Ads Manager.
6. **"chisme ad"** ($0.30 per conversation, CTR 4.40 %, 12 % at 25 %) has a
   hook rate as strong as the winner's, on small spend ($25). Worth scaling as
   a parallel test.

## Owner decision to check

The winner sells at S/79 "solo por esta semana". `docs/negocio.md` says
the kit is S/89 and S/79 is a closing tool, not an opener. The brief PDF
uses S/79 as the current price. The ad data favors S/79 up front; the owner
decides, and `negocio.md` must match.

## Variations to produce (one variable each, so you know what worked)

Shared rules (from the winner and the brief): ≤ 35 s, same opening
frame and hook text on screen in the first second, S/79, contraentrega,
"te separo el tuyo hoy", words "kit / cartas / tapete / manual"; no
"baraja"; no "original".

**V1: Short cut, same footage (tests length only).** 20–25 s.
- 0–3 s: same opening + text "Si siempre te dio curiosidad el tarot pero no
  sabías por dónde empezar…"
- 3–8 s: close-up of a card with its meaning printed on it. Text: "Cada carta
  trae su significado. No tienes que memorizar nada."
- 8–13 s: manual open on "tu primera tirada". Text: "Manual en español, paso
  a paso."
- 13–17 s: all of it on the tapete: 78 cartas, manual, tapete, collar.
  Text: "78 cartas (22 arcanos mayores + 56 menores) + tapete + collar de
  regalo."
- 17–22 s: price card. "Todo el kit S/79 · Envío gratis · Pagas al recibir ·
  Escríbenos y te separo el tuyo."

**V2: Same video, new hook line (tests hook text only).** Keep the winner's
video intact; change only the on-screen text and first line of the copy:
- A: "¿No sabes nada de tarot? Este kit te enseña desde cero."
- B: "Si siempre quisiste leerte las cartas tú mism@ pero no sabías por
  dónde empezar…"
- C: "Si siempre te dio curiosidad el tarot pero 78 cartas te parecían
  demasiado…"

**V3: POV first reading (tests format; belief chains 1 and 3).** 25–30 s,
hands only, natural light, no music-video vibe.
- 0–2 s: hook text (winner's line) over hands opening the box.
- 2–10 s: shuffle, pull 3 cards onto the tapete.
- 10–20 s: voice over reading the printed meaning straight off a card:
  "Mira, aquí mismo dice lo que significa…" Text: "Mi primera lectura,
  sin saber nada."
- 20–28 s: kit contents + price card (as V1).

**V4: Male hands/voice version of V1 (tests the 30–40 % male segment).**
Same cut as V1, neutral copy ("tú mism@", or no gender at all).

### Copy for V1–V4 (primary text)

Keep the winner's body. Changes: S/79 stays, drop the "chakras/astrología"
line from the top three bullets (the brief says the buyer is pragmatic), and
lead with the beginner promise:

> ✨ Si siempre te ha dado curiosidad el Tarot pero no sabías por dónde
> empezar... este kit es para ti 🔮👇
>
> 🃏 78 cartas (22 arcanos mayores + 56 menores) con el significado impreso
> en cada una
> 📖 Manual en español paso a paso: cómo barajar, preguntar y hacer tu
> primera tirada
> 🧿 Tapete de lectura (🎁)
> 📿 Collar de Tarot (🎁)
>
> 💸 Todo el kit por S/79. ¡Solo por esta semana! ✨
> 👉 Envío gratis a todo el Perú y pagas al recibir.
>
> 📩 Mándanos un mensaje y te separo el tuyo hoy.

## How to test

- Put the variations **in the same ad set as the winner** (or a Meta A/B
  test), not in new campaigns. The "- api" duplicate proved that a new
  campaign with the same video already costs 47 % more, so a new campaign
  can't tell you whether the creative is worse.
- Decide on cost per conversation and conversion to sale in the CRM
  (stage 4/5), not on purchases (attribution is partial).
- Minimum per variation before judging: ~US$40–50 or ~80 conversations.
- Keep the winner on as control while it holds under ~$0.60 per
  conversation.
