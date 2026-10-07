import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PassHistoryEntry } from '../../lib/passHistory';
import {
  fetchOwnPassesWithHistory,
  formatPassUntil,
  passExpiresWithinDays,
  type ManagedPass,
  type PassMovementView,
} from '../../lib/passes';
import ReceiptSeeLink from '../payments/ReceiptSeeLink';
import { saleReceiptsByPayment } from '../../lib/receipts';
import PassHistoryList from './PassHistoryList';

const MyPassesSection: React.FC = () => {
  const [active, setActive] = useState<ManagedPass[]>([]);
  const [inactive, setInactive] = useState<ManagedPass[]>([]);
  const [historyByPass, setHistoryByPass] = useState<
    Record<string, PassHistoryEntry<PassMovementView>[]>
  >({});
  const [receiptByPayment, setReceiptByPayment] = useState<
    Record<string, { id: string; number: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inactiveOpen, setInactiveOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOwnPassesWithHistory();
      setActive(data.active);
      setInactive(data.inactive);
      setHistoryByPass(data.historyByPass);
      setReceiptByPayment(
        await saleReceiptsByPayment(
          [...data.active, ...data.inactive].map((pass) => pass.payment_id),
        ),
      );
    } catch (e) {
      console.error(e);
      setError('Kurskarten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-textSubtle">
        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-brand" />
        Lade Kurskarten…
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-text">
        {error}
      </p>
    );
  }

  if (active.length === 0 && inactive.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 border-b border-border pb-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">
          Kurskarten
        </h2>
        <Link
          to="/my-passes"
          className="text-[13px] font-medium text-brand underline"
        >
          Alle Kurskarten ›
        </Link>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-textSubtle italic">Keine aktiven Kurskarten.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((pass) => {
            const expiring = passExpiresWithinDays(pass.valid_until, 14);
            return (
              <li
                key={pass.id}
                className="rounded-md border border-border bg-surface px-3 py-2.5"
              >
                <p className="text-sm font-medium text-text">{pass.name}</p>
                <p className="mt-0.5 text-xs tabular-nums text-textMuted">
                  noch {pass.remaining} von {pass.units_total} · gültig bis{' '}
                  {formatPassUntil(pass.valid_until)}
                </p>
                {expiring ? (
                  <p className="mt-1 text-[13px] text-accentText">
                    läuft am {formatPassUntil(pass.valid_until)} ab
                  </p>
                ) : null}
                {receiptByPayment[pass.payment_id] ? (
                  <div className="mt-2">
                    <ReceiptSeeLink
                      receiptId={receiptByPayment[pass.payment_id].id}
                      number={receiptByPayment[pass.payment_id].number}
                    />
                  </div>
                ) : null}
                <PassHistoryList
                  entries={historyByPass[pass.id] ?? []}
                  studioView={false}
                />
              </li>
            );
          })}
        </ul>
      )}

      {inactive.length > 0 ? (
        <div>
          <button
            type="button"
            aria-expanded={inactiveOpen}
            onClick={() => setInactiveOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm text-textMuted"
          >
            <span>Abgelaufen oder storniert ({inactive.length})</span>
            {inactiveOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
          {inactiveOpen ? (
            <ul className="mt-1 space-y-2">
              {inactive.map((pass) => (
                <li
                  key={pass.id}
                  className="rounded-md border border-border bg-surfaceSunken px-3 py-2.5"
                >
                  <p className="text-sm font-medium text-text">{pass.name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-textMuted">
                    noch {pass.remaining} von {pass.units_total} · gültig bis{' '}
                    {formatPassUntil(pass.valid_until)}
                  </p>
                  {receiptByPayment[pass.payment_id] ? (
                    <div className="mt-2">
                      <ReceiptSeeLink
                        receiptId={receiptByPayment[pass.payment_id].id}
                        number={receiptByPayment[pass.payment_id].number}
                      />
                    </div>
                  ) : null}
                  <PassHistoryList
                    entries={historyByPass[pass.id] ?? []}
                    studioView={false}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default MyPassesSection;
