import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, Clock, Download, Minus, MoreHorizontal } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isStudioAdmin } from '../lib/userRoles';
import { berlinIsoFromInstant } from '../lib/courseDateTime';
import { formatCents, formatNumericDate } from '../lib/format';
import {
  PAYMENT_KIND_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PAYMENT_SUMS_HINT,
  PAYMENTS_PAGE_SIZE,
  paymentEmptyText,
  paymentKindLabel,
  paymentMonthOptions,
  paymentPageLabel,
  paymentPersonName,
  paymentPurpose,
  paymentStatusText,
  paymentStatusTone,
  type PaymentKind,
  type PaymentOverviewStatus,
  type StatusTone,
  type StudioPaymentRow,
} from '../lib/paymentOverview';
import { fetchStudioPayments } from '../lib/studioPayments';
import PaymentRefundSheet from '../components/payments/PaymentRefundSheet';
import PaymentsExportSheet from '../components/payments/PaymentsExportSheet';

const TONE_ICON: Record<StatusTone, typeof Check> = {
  neutral: Check,
  pending: Clock,
  attention: AlertTriangle,
  muted: Minus,
};

const fieldClass =
  'h-11 w-full rounded-sm border border-borderStrong bg-surface px-3 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

const StatusText: React.FC<{ row: StudioPaymentRow }> = ({ row }) => {
  const tone = paymentStatusTone(row.status);
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        tone === 'muted' ? 'text-textMuted' : 'text-text'
      } ${tone === 'attention' ? 'font-medium' : ''}`}
      data-testid="payment-status"
    >
      <Icon className="h-4 w-4 shrink-0 text-textMuted" aria-hidden />
      {paymentStatusText(row)}
    </span>
  );
};

const Payments: React.FC = () => {
  const { userProfile } = useAuth();
  const allowed = isStudioAdmin(userProfile);
  const [params, setParams] = useSearchParams();

  const today = berlinIsoFromInstant(new Date());
  const monthOptions = useMemo(() => paymentMonthOptions(today), [today]);
  const [month, setMonth] = useState(monthOptions[0]?.value ?? '');
  const [kind, setKind] = useState<PaymentKind | ''>('');
  const [status, setStatus] = useState<PaymentOverviewStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<StudioPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const selectedId = params.get('payment');
  const selected = rows.find((row) => row.payment_id === selectedId) ?? null;

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [month, kind, status, search]);

  const load = useCallback(async () => {
    if (!allowed || !month) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchStudioPayments({ month, kind, status, search, page });
      setRows(result.items);
      setTotal(result.total);
      setLoadError(false);
    } catch (error) {
      console.error(error);
      setRows([]);
      setTotal(0);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [allowed, month, kind, status, search, page]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const openDetail = (row: StudioPaymentRow) => {
    const next = new URLSearchParams(params);
    next.set('payment', row.payment_id);
    setParams(next, { replace: false });
  };

  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('payment');
    setParams(next, { replace: true });
  };

  if (!allowed) {
    return (
      <div className="p-8">
        <div className="rounded-sm border border-danger bg-dangerSoft px-4 py-3 text-danger">
          Zugriff verweigert. Diese Seite ist nur für die Studioleitung.
        </div>
      </div>
    );
  }

  const filtered = kind !== '' || status !== '' || search.trim() !== '';
  const pages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));

  const rowAction = (row: StudioPaymentRow) => {
    if (row.kind === 'online') return { type: 'sheet' as const };
    if (row.subject_type === 'registration' && row.course_id) {
      return { type: 'link' as const, to: `/course/${row.course_id}/kassieren` };
    }
    return null;
  };

  const renderCardBody = (row: StudioPaymentRow) => (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[15px] font-medium text-text">{paymentPersonName(row)}</span>
          <span className="shrink-0 text-[15px] tabular-nums text-text">{formatCents(row.amount_cents)}</span>
        </span>
        <span className="mt-0.5 block text-[13px] text-textMuted">{paymentPurpose(row)}</span>
        <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
          {formatNumericDate(berlinIsoFromInstant(row.paid_at))} · {paymentKindLabel(row.kind)}
        </span>
        <span className="mt-1 block text-[13px]">
          <StatusText row={row} />
        </span>
      </span>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] leading-5 text-textMuted sm:hidden">Filter und Export</p>
        <div className="relative ml-auto">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-[15px] font-medium text-textMuted active:bg-surfaceSunken md:hidden"
            aria-label="Mehr"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            data-testid="payments-more"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-lg md:hidden">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] text-text"
                onClick={() => {
                  setMenuOpen(false);
                  setExportOpen(true);
                }}
              >
                <Download className="h-4 w-4" aria-hidden />
                Exportieren
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="hidden h-11 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-textMuted active:bg-surfaceSunken md:inline-flex"
            onClick={() => setExportOpen(true)}
            data-testid="payments-export"
          >
            <Download className="h-4 w-4" aria-hidden />
            Exportieren
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Filter">
        <label className="col-span-2 block md:col-span-1">
          <span className="sr-only">Monat</span>
          <select className={fieldClass} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Monat">
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Art</span>
          <select
            className={fieldClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as PaymentKind | '')}
            aria-label="Art"
          >
            {PAYMENT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Status</span>
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as PaymentOverviewStatus | '')}
            aria-label="Status"
          >
            {PAYMENT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 block md:col-span-1">
          <span className="sr-only">Name suchen</span>
          <input
            type="search"
            className={fieldClass}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name suchen"
            aria-label="Name suchen"
            maxLength={60}
          />
        </label>
      </section>

      {loading && rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand" />
        </div>
      ) : loadError ? (
        <p role="alert" className="rounded-md border border-border bg-surface px-4 py-6 text-[15px] text-text">
          Die Zahlungen konnten nicht geladen werden. Bitte lade die Seite neu.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-4 py-10 text-center text-[15px] leading-6 text-textMuted">
          {paymentEmptyText(filtered)}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface md:hidden" data-testid="payment-cards">
            {rows.map((row) => {
              const action = rowAction(row);
              const cls =
                'flex min-h-11 w-full items-center gap-3 px-3.5 py-3 text-left no-underline active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset';
              return (
                <li key={row.payment_id} data-testid="payment-row">
                  {action?.type === 'sheet' ? (
                    <button type="button" className={cls} onClick={() => openDetail(row)}>
                      {renderCardBody(row)}
                      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                    </button>
                  ) : action?.type === 'link' ? (
                    <Link to={action.to} className={cls}>
                      {renderCardBody(row)}
                      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                    </Link>
                  ) : (
                    <div className={cls.replace(' active:bg-surfaceSunken', '')}>{renderCardBody(row)}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-hidden rounded-md border border-border bg-surface md:block">
            <table className="w-full text-left text-[15px]" data-testid="payment-table">
              <thead className="border-b border-border text-[13px] text-textMuted">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Datum</th>
                  <th className="px-3.5 py-2.5 font-medium">Person</th>
                  <th className="px-3.5 py-2.5 font-medium">Wofür</th>
                  <th className="px-3.5 py-2.5 font-medium">Art</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Betrag</th>
                  <th className="px-3.5 py-2.5 font-medium">Status</th>
                  <th className="w-11 px-2 py-2.5" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const action = rowAction(row);
                  return (
                    <tr key={row.payment_id} data-testid="payment-row">
                      <td className="px-3.5 py-2.5 tabular-nums text-textMuted">
                        {formatNumericDate(berlinIsoFromInstant(row.paid_at))}
                      </td>
                      <td className="px-3.5 py-2.5 text-text">{paymentPersonName(row)}</td>
                      <td className="px-3.5 py-2.5 text-textMuted">{paymentPurpose(row)}</td>
                      <td className="px-3.5 py-2.5 text-textMuted">{paymentKindLabel(row.kind)}</td>
                      <td className="px-3.5 py-2.5 text-right tabular-nums text-text">{formatCents(row.amount_cents)}</td>
                      <td className="px-3.5 py-2.5">
                        <StatusText row={row} />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {action?.type === 'sheet' ? (
                          <button
                            type="button"
                            onClick={() => openDetail(row)}
                            aria-label={`Zahlung von ${paymentPersonName(row)} öffnen`}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-textSubtle active:bg-surfaceSunken"
                          >
                            <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
                          </button>
                        ) : action?.type === 'link' ? (
                          <Link
                            to={action.to}
                            aria-label={`Kasse für ${paymentPurpose(row)} öffnen`}
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-textSubtle active:bg-surfaceSunken"
                          >
                            <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] tabular-nums text-textMuted">{paymentPageLabel(page, total)}</span>
            {pages > 1 ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex min-h-11 items-center rounded-full border border-borderStrong px-4 text-[15px] font-medium text-text active:bg-surfaceSunken disabled:opacity-50"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  disabled={page >= pages || loading}
                  onClick={() => setPage((value) => Math.min(pages, value + 1))}
                  className="inline-flex min-h-11 items-center rounded-full border border-borderStrong px-4 text-[15px] font-medium text-text active:bg-surfaceSunken disabled:opacity-50"
                >
                  Weiter
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <p className="text-[13px] leading-5 text-textMuted">{PAYMENT_SUMS_HINT}</p>

      <PaymentRefundSheet
        paymentId={selectedId}
        firstName={selected?.first_name?.trim() || 'die Person'}
        subtitle={selected ? `${paymentPersonName(selected)} · ${paymentPurpose(selected)}` : undefined}
        onClose={closeDetail}
        onChanged={() => setReloadKey((value) => value + 1)}
      />

      <PaymentsExportSheet
        open={exportOpen}
        filters={{ month, kind, status, search }}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
};

export default Payments;
