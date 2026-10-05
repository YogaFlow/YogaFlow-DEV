import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatCents } from '../../lib/format';
import { methodWord } from '../../lib/courseCheckout';
import type { PassHistoryEntry } from '../../lib/passHistory';
import {
  fetchManagedPasses,
  fetchMemberPasses,
  fetchPassHistoryForPasses,
  fetchSellablePassProducts,
  formatPassUntil,
  passActiveDetail,
  passInactiveLabel,
  revokePass,
  type ManagedPass,
  type MemberPassSummary,
  type PassMovementView,
} from '../../lib/passes';
import AdjustPassDialog from './AdjustPassDialog';
import ExtendPassDialog from './ExtendPassDialog';
import PassHistoryList from './PassHistoryList';
import SellPassDialog from './SellPassDialog';

type Props = {
  memberId: string;
  personName: string;
  isStudioAdmin: boolean;
  /** Lehrende: verkaufen ja, Preis/Storno nein. */
  canSell: boolean;
};

const MemberPassesSection: React.FC<Props> = ({
  memberId,
  personName,
  isStudioAdmin,
  canSell,
}) => {
  const [active, setActive] = useState<ManagedPass[]>([]);
  const [inactive, setInactive] = useState<ManagedPass[]>([]);
  const [teacherPasses, setTeacherPasses] = useState<MemberPassSummary[]>([]);
  const [historyByPass, setHistoryByPass] = useState<
    Record<string, PassHistoryEntry<PassMovementView>[]>
  >({});
  const [hasProducts, setHasProducts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ManagedPass | null>(null);
  const [revokeNote, setRevokeNote] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState('');
  const [adjustTarget, setAdjustTarget] = useState<ManagedPass | null>(null);
  const [extendTarget, setExtendTarget] = useState<ManagedPass | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const products = await fetchSellablePassProducts();
      setHasProducts(products.length > 0);
      if (isStudioAdmin) {
        const managed = await fetchManagedPasses(memberId);
        setActive(managed.active);
        setInactive(managed.inactive);
        setTeacherPasses([]);
        const allIds = [...managed.active, ...managed.inactive].map((p) => p.id);
        const history =
          allIds.length > 0 ? await fetchPassHistoryForPasses(allIds) : { historyByPass: {} };
        setHistoryByPass(history.historyByPass);
      } else {
        const list = await fetchMemberPasses(memberId);
        setTeacherPasses(list);
        setActive([]);
        setInactive([]);
        setHistoryByPass({});
      }
    } catch (e) {
      console.error(e);
      setError('Karten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [isStudioAdmin, memberId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirmRevoke = async () => {
    if (!revokeTarget || revokeBusy) return;
    setRevokeBusy(true);
    setRevokeError('');
    const result = await revokePass(revokeTarget.id, revokeNote);
    setRevokeBusy(false);
    if (!result.ok) {
      setRevokeError(result.message);
      return;
    }
    setRevokeTarget(null);
    setRevokeNote('');
    await reload();
  };

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-textMuted">Karten</h3>
        {canSell && hasProducts ? (
          <button
            type="button"
            onClick={() => setSellOpen(true)}
            className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-[13px] font-medium text-text active:bg-surfaceSunken"
          >
            Karte verkaufen
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-textSubtle">
          <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-brand" />
          Lade…
        </div>
      ) : error ? (
        <p role="alert" className="text-sm text-text">
          {error}
        </p>
      ) : !hasProducts && isStudioAdmin ? (
        <p className="text-sm text-textMuted">
          Lege zuerst unter Einstellungen → Karten ein Produkt an.
        </p>
      ) : isStudioAdmin ? (
        <>
          {active.length === 0 ? (
            <p className="text-sm text-textSubtle italic">Keine aktiven Karten.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((pass) => {
                const unused = pass.remaining === pass.units_total;
                return (
                  <li
                    key={pass.id}
                    className="rounded-md border border-border bg-surface px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-text">{pass.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-textMuted">
                      {passActiveDetail(pass)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setAdjustTarget(pass)}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-brand"
                      >
                        Korrigieren
                      </button>
                      <button
                        type="button"
                        onClick={() => setExtendTarget(pass)}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-brand"
                        data-testid={`extend-pass-${pass.id}`}
                      >
                        Verlängern
                      </button>
                      {unused ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRevokeError('');
                            setRevokeNote('');
                            setRevokeTarget(pass);
                          }}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-danger"
                        >
                          Stornieren
                        </button>
                      ) : null}
                    </div>
                    <PassHistoryList
                      entries={historyByPass[pass.id] ?? []}
                      studioView
                      method={pass.method}
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
                        {passInactiveLabel(pass)}
                        {pass.price_cents != null
                          ? ` · ${formatCents(pass.price_cents)} (${methodWord(pass.method)})`
                          : ''}
                      </p>
                      <PassHistoryList
                        entries={historyByPass[pass.id] ?? []}
                        studioView
                        method={pass.method}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : teacherPasses.length === 0 ? (
        <p className="text-sm text-textSubtle italic">Keine aktiven Karten.</p>
      ) : (
        <ul className="space-y-2">
          {teacherPasses.map((pass) => (
            <li
              key={pass.pass_id}
              className="rounded-md border border-border bg-surface px-3 py-2.5"
            >
              <p className="text-sm font-medium text-text">{pass.name}</p>
              <p className="mt-0.5 text-xs tabular-nums text-textMuted">
                noch {pass.remaining} von {pass.units_total} · gültig bis{' '}
                {formatPassUntil(pass.valid_until)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <SellPassDialog
        open={sellOpen}
        memberId={memberId}
        personName={personName}
        onClose={() => setSellOpen(false)}
        onSold={() => {
          setSellOpen(false);
          void reload();
        }}
      />

      <AdjustPassDialog
        open={adjustTarget != null}
        passId={adjustTarget?.id ?? ''}
        passName={adjustTarget?.name ?? ''}
        remaining={adjustTarget?.remaining ?? 0}
        onClose={() => setAdjustTarget(null)}
        onAdjusted={() => {
          setAdjustTarget(null);
          void reload();
        }}
      />

      <ExtendPassDialog
        open={extendTarget != null}
        pass={extendTarget}
        onClose={() => setExtendTarget(null)}
        onSaved={() => {
          setExtendTarget(null);
          void reload();
        }}
      />

      {revokeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/45 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />
                <h3 className="text-lg font-semibold text-text">
                  {revokeTarget.name} von {personName} stornieren?
                </h3>
              </div>
            </div>
            <p className="text-sm leading-6 text-textMuted">
              Die Zahlung von {formatCents(revokeTarget.price_cents)} (
              {methodWord(revokeTarget.method)}) wird als zurückgegeben vermerkt. Gib{' '}
              {personName.split(' ')[0] || personName} das Geld zurück.
            </p>
            <label className="mt-4 block">
              <span className="text-xs text-textMuted">
                Grund (optional) · {revokeNote.length}/200
              </span>
              <textarea
                value={revokeNote}
                maxLength={200}
                rows={2}
                onChange={(e) => setRevokeNote(e.target.value)}
                className="mt-1 w-full rounded-sm border border-borderStrong px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </label>
            {revokeError ? (
              <p role="alert" className="mt-2 text-sm text-text">
                {revokeError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!revokeBusy) setRevokeTarget(null);
                }}
                disabled={revokeBusy}
                className="rounded-full px-6 py-2 text-sm font-semibold text-textMuted transition-colors hover:bg-surfaceSunken disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void confirmRevoke()}
                disabled={revokeBusy}
                className="rounded-full px-6 py-2 text-sm font-semibold text-danger transition-colors hover:bg-dangerSoft disabled:opacity-50"
              >
                {revokeBusy ? 'Bitte warten…' : 'Stornieren'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MemberPassesSection;
