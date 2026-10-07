/**
 * K1 — Öffentliche Widerrufsseite (ohne Login): Beleg + E-Mail.
 */
import React, { useState } from 'react';
import { formatCents } from '../lib/format';
import {
  passWithdrawalCalcLine,
  passWithdrawalUpcomingNotice,
} from '../lib/passOnlineTexts';
import { supabase } from '../lib/supabase';
import StudioPublicLegalLine from '../components/Layout/StudioPublicLegalLine';

type LookupHit = {
  found?: boolean;
  matched?: boolean;
  pass_id?: string;
  name?: string;
  units_used?: number;
  units_used_upcoming?: number;
  upcoming_dates?: string[];
  units_total?: number;
  price_cents?: number;
  wertersatz_cents?: number;
  refund_cents?: number;
  within_window?: boolean;
  withdrawal_deadline_at?: string;
  message?: string;
};

function lookupMatched(body: LookupHit): boolean {
  return body.found === true || body.matched === true;
}

const Widerruf: React.FC = () => {
  const [receipt, setReceipt] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [hit, setHit] = useState<LookupHit | null>(null);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  const lookup = async () => {
    setBusy(true);
    setError('');
    setDone('');
    setHit(null);
    try {
      const { data, error: err } = await supabase.rpc('lookup_pass_withdrawal_public', {
        p_receipt_number: receipt.trim(),
        p_email: email.trim(),
        p_client_ip: null,
      });
      if (err) {
        setError('Bitte versuche es später erneut.');
        return;
      }
      const body = (data ?? {}) as LookupHit & { success?: boolean; error?: string };
      setNote(
        'Wenn die Angaben zu einem Kauf passen, siehst du jetzt die Zusammenfassung.',
      );
      if (lookupMatched(body) && body.within_window === false) {
        setError('Die Widerrufsfrist für diesen Kauf ist abgelaufen.');
        setHit(null);
        return;
      }
      if (lookupMatched(body)) setHit(body);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!hit || !lookupMatched(hit)) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('confirm_pass_withdrawal_public', {
        p_receipt_number: receipt.trim(),
        p_email: email.trim(),
        p_client_ip: null,
      });
      if (err) {
        setError('Widerruf fehlgeschlagen.');
        return;
      }
      const body = (data ?? {}) as {
        success?: boolean;
        refund_cents?: number;
        error?: string;
      };
      if (body.success !== true) {
        setError(
          body.error === 'WINDOW_EXPIRED'
            ? 'Die Widerrufsfrist für diesen Kauf ist abgelaufen.'
            : body.error === 'ALREADY_WITHDRAWN'
              ? 'Dieser Vertrag wurde bereits widerrufen.'
              : 'Widerruf fehlgeschlagen.',
        );
        return;
      }
      setDone(
        `Widerruf bestätigt. ${formatCents(body.refund_cents ?? 0)} werden erstattet. Die Eingangsbestätigung geht an die gespeicherte E-Mail.`,
      );
      setHit(null);
    } finally {
      setBusy(false);
    }
  };

  const hitOk = hit != null && lookupMatched(hit);
  const upcomingDates = Array.isArray(hit?.upcoming_dates)
    ? hit.upcoming_dates.map(String)
    : [];
  const upcomingNotice = passWithdrawalUpcomingNotice(upcomingDates);
  const calc =
    hitOk &&
    hit.price_cents != null &&
    hit.units_total != null &&
    hit.units_used != null
      ? passWithdrawalCalcLine({
          priceCents: hit.price_cents,
          unitsTotal: hit.units_total,
          unitsUsed: hit.units_used,
          unitsUsedUpcoming: hit.units_used_upcoming ?? 0,
        })
      : '';

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 sm:p-8" data-testid="widerruf-page">
      <h1 className="text-xl font-semibold text-text">Vertrag widerrufen</h1>
      <p className="text-sm text-textMuted">
        Gib Belegnummer und die E-Mail an, mit der du die Mehrfachkarte gekauft hast.
      </p>
      <p className="text-sm text-textMuted">
        Die Belegnummer findest du in deiner Bestätigungs-Mail oder unter Mehrfachkarten.
      </p>

      {done ? (
        <p className="rounded-md border border-border bg-surface px-4 py-3 text-[15px] text-text">
          {done}
        </p>
      ) : (
        <>
          <div className="space-y-4">
            <div>
              <label htmlFor="wd-receipt" className="mb-1 block text-sm text-textMuted">
                Belegnummer
              </label>
              <input
                id="wd-receipt"
                value={receipt}
                onChange={(ev) => setReceipt(ev.target.value)}
                className="w-full rounded-sm border border-borderStrong px-4 py-3"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="wd-email" className="mb-1 block text-sm text-textMuted">
                E-Mail
              </label>
              <input
                id="wd-email"
                type="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className="w-full rounded-sm border border-borderStrong px-4 py-3"
                autoComplete="email"
              />
            </div>
            <button
              type="button"
              disabled={busy || !receipt.trim() || !email.trim()}
              onClick={() => void lookup()}
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand disabled:opacity-50"
            >
              Weiter
            </button>
          </div>

          {note ? <p className="text-sm text-textMuted">{note}</p> : null}
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {hitOk ? (
            <div className="space-y-3 rounded-md border border-border bg-surface p-4">
              <p className="text-[15px] font-medium text-text">{hit.name}</p>
              {upcomingNotice ? (
                <p className="text-sm text-text" data-testid="public-withdrawal-upcoming">
                  {upcomingNotice}
                </p>
              ) : null}
              <p className="text-[15px] tabular-nums text-text">{calc}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-danger px-5 text-[15px] font-medium text-onBrand disabled:opacity-50"
                data-testid="public-withdrawal-confirm"
              >
                Widerruf bestätigen
              </button>
            </div>
          ) : null}
        </>
      )}
      <StudioPublicLegalLine className="pt-4" />
    </div>
  );
};

export default Widerruf;
