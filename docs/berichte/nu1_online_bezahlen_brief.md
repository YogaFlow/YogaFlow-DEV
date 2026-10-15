# NU-1 — Brief „Online bezahlen"

Stand: 2026-10-15 · Branch `Julius` · **STOPP**

Teilnehmer-Nachricht der Neuigkeit `2026-10-online-bezahlen` ist der Brief. Der Absatz „Und keine Sorge … selbst entscheiden.“ erscheint nur, wenn vor Ort aktiv ist, und steht vor dem Stripe-Absatz (`{onsite}` in `participantDraft`). Keine Migration. Bereits gesendete Glocken bleiben unverändert.

Titel mit 60-Zeichen-Studioname: 101 / 120. Brief mit Vor-Ort-Absatz: 783 / 2000. Die Glocke kürzt bei 140 Zeichen und zeigt den ganzen Text über „Mehr lesen“.

## PROD

| Beleg | Wert |
|-------|------|
| Merge | `bc89631` (PR #179) |
| Check-Run | `Workers Builds: yogaflow-dev` → success (2026-10-15T21:12:15Z) |
| `version.json` | `bc89631e324a99d5c123ef676d6677df4aeed082` auf `https://yomita.omlify.de/version.json` |
| Bundle | `https://yomita.omlify.de/assets/index-CIA33Fbn.js` · `text/javascript` · enthält `rollst deine Matte aus` |
| Probe | `/assets/index-missing-probe.js` → 404, leerer Body, kein `immutable` |
