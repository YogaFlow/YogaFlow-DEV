# Edge-Function-Laufzeit (Geldkette 0.3c, Architektur A1)

Stand: gemessen 25.09.2026 gegen DEV (`mufxhtctutfpzklwqnze`), Function `service-ping`.

## Plattformgrenzen (nicht geschätzt)

Quelle: [Supabase Docs — Edge Functions Limits](https://supabase.com/docs/guides/functions/limits)

| Grenze | Free | Paid |
|---|---|---|
| Wall-clock (Worker aktiv) | **150 s** | 400 s |
| Request idle timeout (keine Antwort) | **150 s** → sonst 504 | 150 s |
| CPU-Zeit pro Request | **2 s** | 2 s |
| Speicher | 256 MB | 256 MB |

DEV-Plan: Limits wie Free (150 s Wall-clock / Idle), solange das Projekt nicht auf einem Paid-Plan liegt. Kein Timeout provoziert — die Doku ist die Bezugsgröße.

## Gemessene Dauer `service-ping`

Aufruf: POST `/functions/v1/service-ping` mit Owner-JWT und `x-omlify-tenant: demoalpha`, RPC `record_service_ping`.

| Sample | ms |
|---|---|
| 1 (kalt / erster nach Deploy) | 1860 |
| 2–6 (warm) | 234, 260, 275, 291, 312 |

Warm: **min 234 · median 275 · max 312 ms** (n=5).  
Kalt einmalig ~1,9 s — typisch Worker-Start, nicht Fachlogik.

## Folgerung für Sprint A

- **Passt in eine Edge Function:** einzelne Nutzeraktionen (Vermerk bar, Karte verkaufen, Einlösen, Soft-Cancel) — unter 1 s Warmlauf, weit unter 150 s und 2 s CPU.
- **Nicht als synchronen Request über alle Studios:** Kartenverfall (A6) — ein täglicher Lauf „für jeden Pass jedes Studios“. Bei wachsender Studiozahl skaliert die Arbeit linear; ein Request, der alle Tenants abarbeitet, riskiert Idle-/Wall-clock-Timeout und hält keinen fairen Tenant-Schnitt.
- **A6 deshalb:** `pg_cron` (oder Queue) mit **batches je Tenant** bzw. begrenzter Batchgröße, nicht ein einziger `service-*`-Aufruf „alles heute“. Die Function (oder SQL-Job) macht höchstens einen Chunk; Fortschritt über `events`/`causation_id` idempotent.

Noch nicht committed — Ablage für Review in Story 0.3.
