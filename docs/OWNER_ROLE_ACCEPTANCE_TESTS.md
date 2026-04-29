# Owner-Rolle: Akzeptanztests

Diese Testfaelle verifizieren die User-Story "Sichere Verwaltung der Owner-Rolle".

## Voraussetzungen

- Es gibt mindestens einen Tenant mit mindestens drei Nutzern.
- Startrollen:
  - `owner_a` mit Rolle `owner`
  - `admin_a` mit Rolle `admin`
  - `user_a` mit Rolle `user`
- Optional fuer Testfall 3: `owner_b` als zweiter Owner.

## Testfall 1: Owner kann weiteren Owner ernennen

1. Als `owner_a` in die Nutzerverwaltung gehen.
2. Rolle von `user_a` auf `owner` setzen.
3. Erwartung:
   - Rollenwechsel wird gespeichert.
   - `user_a` hat danach Rolle `owner`.

## Testfall 2: Nicht-Owner darf keine Owner-Rolle vergeben

1. Als `admin_a` einen Rollenwechsel auf `owner` fuer `user_a` ausfuehren (z. B. per SQL/API-Request).
2. Erwartung:
   - Request wird abgelehnt.
   - Fehlermeldung enthaelt `OWNER_ASSIGNMENT_FORBIDDEN` oder eine entsprechende UI-Meldung.

## Testfall 3: Mehrere Owner gleichzeitig sind moeglich

1. Stelle sicher, dass `owner_a` und `owner_b` beide Rolle `owner` haben.
2. Erwartung:
   - Beide Nutzer bleiben gleichzeitig Owner.
   - Keine Constraint-Verletzung.

## Testfall 4: Letzter Owner kann Rolle nicht entfernen

1. Stelle sicher, dass genau ein Owner existiert (`owner_a`).
2. Als `owner_a` eigene Rolle von `owner` auf `admin` setzen.
3. Erwartung:
   - Rollenwechsel wird abgelehnt.
   - UI zeigt: "Die letzte Owner-Rolle kann nicht entfernt werden ..."
   - Serverseitig kommt `LAST_OWNER_REQUIRED`.

## Testfall 5: Owner darf eigene Rolle abgeben, wenn weiterer Owner existiert

1. Stelle sicher, dass `owner_a` und `owner_b` beide Owner sind.
2. Als `owner_a` eigene Rolle auf `admin` setzen.
3. Erwartung:
   - Rollenwechsel ist erlaubt.
   - `owner_b` bleibt Owner.
   - Tenant hat weiterhin mindestens einen Owner.

## Testfall 6: Owner-Loeschen darf letzten Owner nicht entfernen

1. Stelle sicher, dass genau ein Owner im Tenant existiert.
2. Versuche diesen Owner ueber Delete-User-Flow zu loeschen.
3. Erwartung:
   - Loeschung wird abgelehnt.
   - Server gibt `LAST_OWNER_REQUIRED` zurueck.
