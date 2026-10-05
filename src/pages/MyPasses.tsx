/**
 * K1 — Meine Karten: Kacheln, kaufen, Widerruf.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PassHistoryList from '../components/passes/PassHistoryList';
import PassPurchaseSheet from '../features/payments/PassPurchaseSheet';
import PassWithdrawalDialog from '../components/passes/PassWithdrawalDialog';
import { useTenant } from '../context/TenantContext';
import { formatCents } from '../lib/format';
import {
  fetchMostCommonCoursePriceCents,
  listOnlinePassProducts,
  type OnlinePassProduct,
} from '../lib/passProducts';
import {
  passBuyListLine,
  passWithdrawalLinkHint,
} from '../lib/passOnlineTexts';
import type { PassHistoryEntry } from '../lib/passHistory';
import {
  fetchOwnPassesWithHistory,
  formatPassUntil,
  type ManagedPass,
  type PassMovementView,
} from '../lib/passes';

const MyPasses: React.FC = () => {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [active, setActive] = useState<ManagedPass[]>([]);
  const [inactive, setInactive] = useState<ManagedPass[]>([]);
  const [historyByPass, setHistoryByPass] = useState<
    Record<string, PassHistoryEntry<PassMovementView>[]>
  >({});
  const [products, setProducts] = useState<OnlinePassProduct[]>([]);
  const [commonPrice, setCommonPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [buyProduct, setBuyProduct] = useState<OnlinePassProduct | null>(null);
  const [withdrawPass, setWithdrawPass] = useState<ManagedPass | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [passes, online, common] = await Promise.all([
        fetchOwnPassesWithHistory(),
        listOnlinePassProducts(),
        fetchMostCommonCoursePriceCents(),
      ]);
      setActive(passes.active);
      setInactive(passes.inactive);
      setHistoryByPass(passes.historyByPass);
      setProducts(online);
      setCommonPrice(common);
    } catch (e) {
      console.error(e);
      setError('Karten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-textSubtle">
        <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-brand" />
        Lade Karten…
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-text">
        {error}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-6" data-testid="my-passes-page">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">
          Aktive Karten
        </h2>
        {active.length === 0 ? (
          <p className="text-sm italic text-textSubtle">Keine aktiven Karten.</p>
        ) : (
          <ul className="space-y-3">
            {active.map((pass) => {
              const used = Math.max(0, pass.units_total - pass.remaining);
              const pct =
                pass.units_total > 0
                  ? Math.min(100, Math.round((used / pass.units_total) * 100))
                  : 0;
              const purchased = new Date(pass.created_at);
              const deadline = new Date(purchased.getTime() + 14 * 24 * 60 * 60 * 1000);
              const withinWindow =
                pass.status === 'active' && Date.now() <= deadline.getTime();
              return (
                <li
                  key={pass.id}
                  className="rounded-md border border-border bg-surface px-4 py-3"
                  data-testid={`pass-tile-${pass.id}`}
                >
                  <p className="text-[15px] font-medium text-text">{pass.name}</p>
                  <p className="mt-1 text-sm tabular-nums text-textMuted">
                    noch {pass.remaining} von {pass.units_total}
                  </p>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-surfaceSunken"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm tabular-nums text-textMuted">
                    gültig bis {formatPassUntil(pass.valid_until)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {withinWindow ? (
                      <button
                        type="button"
                        className="min-h-11 text-sm text-textMuted underline"
                        onClick={() => setWithdrawPass(pass)}
                        data-testid={`pass-withdraw-${pass.id}`}
                      >
                        Vertrag widerrufen
                        <span className="ml-1 no-underline">
                          ({passWithdrawalLinkHint(deadline.toISOString())})
                        </span>
                      </button>
                    ) : null}
                  </div>
                  <PassHistoryList
                    entries={historyByPass[pass.id] ?? []}
                    studioView={false}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {inactive.length > 0 ? (
        <section>
          <button
            type="button"
            aria-expanded={inactiveOpen}
            onClick={() => setInactiveOpen((v) => !v)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm text-textMuted"
          >
            <span>Abgelaufen oder verbraucht ({inactive.length})</span>
            {inactiveOpen ? (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
          {inactiveOpen ? (
            <ul className="mt-2 space-y-2">
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
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {products.length > 0 ? (
        <section className="space-y-3" data-testid="pass-buy-list">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-textMuted">
            Karte kaufen
          </h2>
          <ul className="space-y-2">
            {products.map((product) => {
              const { line, tooltip } = passBuyListLine({
                units: product.units,
                priceCents: product.price_cents,
                commonCoursePriceCents: commonPrice,
              });
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 text-left active:bg-surfaceSunken"
                    title={tooltip ?? undefined}
                    onClick={() => setBuyProduct(product)}
                    data-testid={`pass-buy-${product.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-text">
                        {product.name}
                      </span>
                      <span className="mt-0.5 block text-sm tabular-nums text-textMuted">
                        {line}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-brand">
                      {formatCents(product.price_cents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {active.length === 0 && products.length === 0 ? (
        <p className="text-sm text-textMuted">
          In diesem Studio gibt es gerade keine online kaufbaren Karten.{' '}
          <button
            type="button"
            className="font-medium text-brand"
            onClick={() => navigate('/courses')}
          >
            Zu den Kursen
          </button>
        </p>
      ) : null}

      <PassPurchaseSheet
        open={buyProduct != null}
        product={buyProduct}
        studioName={tenant?.name ?? 'Studio'}
        onClose={() => setBuyProduct(null)}
        onFinished={() => void reload()}
      />

      <PassWithdrawalDialog
        open={withdrawPass != null}
        pass={withdrawPass}
        onClose={() => setWithdrawPass(null)}
        onDone={() => void reload()}
      />
    </div>
  );
};

export default MyPasses;
