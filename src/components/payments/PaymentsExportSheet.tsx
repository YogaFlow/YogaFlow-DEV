import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ModalBackdrop from '../ui/ModalBackdrop';
import {
  downloadLedgerCsv,
  fetchLedgerExport,
  LEDGER_EXPORT_FOOTNOTE,
} from '../../lib/ledgerExport';
import {
  buildPaymentsListCsv,
  fetchAllStudioPayments,
  paymentsExportFilename,
} from '../../lib/paymentsExport';
import { listReceiptsForPayments } from '../../lib/receipts';
import { fetchStudioPayments } from '../../lib/studioPayments';
import type { PaymentKind, PaymentOverviewStatus } from '../../lib/paymentOverview';
import { withDevTenant } from '../../context/TenantContext';
import { currentTenantSlug } from '../../lib/tenantSlug';
import {
  berlinYearMonth,
  exportPreviewLabel,
  formatMonthLabel,
  formatYearMonth,
  resolveExportRange,
  shiftYearMonth,
  type ExportPeriodPreset,
  type YearMonth,
} from '../../lib/exportPeriod';

export type PaymentsExportFilters = {
  month: string;
  kind: PaymentKind | '';
  status: PaymentOverviewStatus | '';
  search: string;
};

type Props = {
  open: boolean;
  filters: PaymentsExportFilters;
  onClose: () => void;
};

type Mode = 'payments' | 'ledger';

const PRESETS: { id: ExportPeriodPreset; label: string }[] = [
  { id: 'this_month', label: 'Dieser Monat' },
  { id: 'last_month', label: 'Letzter Monat' },
  { id: 'this_year', label: 'Dieses Jahr' },
  { id: 'custom', label: 'Eigener Zeitraum' },
];

function MonthStepper({
  value,
  onChange,
  label,
}: {
  value: YearMonth;
  onChange: (next: YearMonth) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-1">
      <button
        type="button"
        aria-label={`${label}: vorheriger Monat`}
        onClick={() => onChange(shiftYearMonth(value, -1))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surfaceSunken"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <p className="min-w-0 flex-1 text-center text-[15px] font-medium tabular-nums text-text">
        {formatMonthLabel(value)}
      </p>
      <button
        type="button"
        aria-label={`${label}: nächster Monat`}
        onClick={() => onChange(shiftYearMonth(value, 1))}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text active:bg-surfaceSunken"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

function monthsInRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  let cur = from;
  const endKey = formatYearMonth(to);
  for (let i = 0; i < 24; i += 1) {
    out.push(cur);
    if (formatYearMonth(cur) === endKey) break;
    cur = shiftYearMonth(cur, 1);
    if (formatYearMonth(cur) > endKey) break;
  }
  return out;
}

function downloadCsv(filename: string, body: string) {
  const blob = new Blob([`\uFEFF${body}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function PaymentsExportSheet({ open, filters, onClose }: Props) {
  const initial = berlinYearMonth();
  const [mode, setMode] = useState<Mode>('payments');
  const [preset, setPreset] = useState<ExportPeriodPreset>('this_month');
  const [monthFrom, setMonthFrom] = useState<YearMonth>(initial);
  const [monthTo, setMonthTo] = useState<YearMonth>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const parsed = /^(\d{4})-(\d{2})$/.exec(filters.month.slice(0, 7));
    if (parsed) {
      const ym = { year: Number(parsed[1]), month: Number(parsed[2]) };
      setMonthFrom(ym);
      setMonthTo(ym);
    }
  }, [open, filters.month]);

  const selectPreset = (next: ExportPeriodPreset) => {
    setPreset(next);
    const now = berlinYearMonth();
    if (next === 'this_month') {
      setMonthFrom(now);
      setMonthTo(now);
    } else if (next === 'last_month') {
      const last = shiftYearMonth(now, -1);
      setMonthFrom(last);
      setMonthTo(last);
    } else if (next === 'this_year') {
      setMonthFrom({ year: now.year, month: 1 });
      setMonthTo({ year: now.year, month: 12 });
    }
  };

  const range = useMemo(
    () =>
      resolveExportRange({
        preset,
        month: monthFrom,
        monthTo: preset === 'custom' || preset === 'this_year' ? monthTo : monthFrom,
      }),
    [preset, monthFrom, monthTo],
  );

  const monthList = useMemo(() => {
    if (preset === 'this_year') {
      const y = berlinYearMonth().year;
      return monthsInRange({ year: y, month: 1 }, { year: y, month: 12 });
    }
    if (preset === 'custom') return monthsInRange(monthFrom, monthTo);
    return [monthFrom];
  }, [preset, monthFrom, monthTo]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPreviewCount(null);
    void (async () => {
      try {
        let total = 0;
        for (const ym of monthList) {
          const page = await fetchStudioPayments({
            month: formatYearMonth(ym),
            kind: filters.kind,
            status: filters.status,
            search: filters.search,
            page: 1,
          });
          total += page.total;
        }
        if (active) setPreviewCount(total);
      } catch {
        if (active) setPreviewCount(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, monthList, filters.kind, filters.status, filters.search]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      if (mode === 'payments') {
        const allRows = [];
        for (const ym of monthList) {
          const rows = await fetchAllStudioPayments({
            month: formatYearMonth(ym),
            kind: filters.kind,
            status: filters.status,
            search: filters.search,
          });
          allRows.push(...rows);
        }
        const receipts = await listReceiptsForPayments(allRows.map((r) => r.payment_id));
        const receiptByPayment = new Map<string, string>();
        for (const receipt of receipts) {
          if (receipt.kind !== 'receipt') continue;
          if (!receiptByPayment.has(receipt.payment_id)) {
            receiptByPayment.set(receipt.payment_id, receipt.number);
          }
        }
        const stamp =
          monthList.length === 1
            ? formatYearMonth(monthList[0]!)
            : `${formatYearMonth(monthList[0]!)}_${formatYearMonth(monthList[monthList.length - 1]!)}`;
        downloadCsv(
          paymentsExportFilename(stamp, currentTenantSlug()),
          buildPaymentsListCsv(allRows, receiptByPayment),
        );
        setNote(`${allRows.length} Zeilen exportiert.`);
        return;
      }
      const result = await fetchLedgerExport(range.from, range.to);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const slug = currentTenantSlug() ?? 'studio';
      const stamp =
        preset === 'this_year'
          ? String(berlinYearMonth().year)
          : `${range.from}_${range.to}`;
      downloadLedgerCsv(`omlify-${slug}-steuer-${stamp}`, result.rows);
      setNote('Steuer-Export erstellt (Buchungen + Summen).');
    } catch {
      setError('Der Export ist fehlgeschlagen. Bitte versuche es noch einmal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalBackdrop
      open={open}
      visible
      canDismiss={!busy}
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-md"
      labelledBy="payments-export-title"
    >
      <div className="p-5 sm:p-6">
        <h3 id="payments-export-title" className="text-[17px] font-medium text-text">
          Exportieren
        </h3>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Zeitraum">
          {PRESETS.map((item) => {
            const active = preset === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPreset(item.id)}
                data-testid={`export-preset-${item.id}`}
                className={`inline-flex h-11 items-center rounded-full px-3.5 text-[14px] font-medium ${
                  active
                    ? 'bg-brand text-onBrand'
                    : 'border border-borderStrong bg-surface text-text active:bg-surfaceSunken'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {preset === 'this_year' ? (
          <p className="mt-3 text-center text-[15px] font-medium text-text">
            {berlinYearMonth().year}
          </p>
        ) : preset === 'custom' ? (
          <div className="mt-3 space-y-2">
            <p className="text-[13px] text-textMuted">Von</p>
            <MonthStepper label="Von" value={monthFrom} onChange={setMonthFrom} />
            <p className="text-[13px] text-textMuted">Bis</p>
            <MonthStepper label="Bis" value={monthTo} onChange={setMonthTo} />
          </div>
        ) : (
          <div className="mt-3">
            <MonthStepper
              label="Monat"
              value={monthFrom}
              onChange={(next) => {
                setMonthFrom(next);
                setMonthTo(next);
                setPreset('custom');
              }}
            />
          </div>
        )}

        <p className="mt-3 text-[14px] text-textMuted" data-testid="export-preview">
          {exportPreviewLabel(previewCount)}
        </p>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Exportart">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'payments'}
            onClick={() => setMode('payments')}
            className={`w-full rounded-md border px-3.5 py-3 text-left ${
              mode === 'payments' ? 'border-brand bg-brandSoft' : 'border-border bg-surface'
            }`}
          >
            <p className="text-[15px] font-medium text-text">Zahlungsliste (CSV)</p>
            <p className="mt-1 text-[13px] text-textMuted">
              Aktuelle Filter inkl. Belegnummer
            </p>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'ledger'}
            onClick={() => setMode('ledger')}
            className={`w-full rounded-md border px-3.5 py-3 text-left ${
              mode === 'ledger' ? 'border-brand bg-brandSoft' : 'border-border bg-surface'
            }`}
          >
            <p className="text-[15px] font-medium text-text">Für die Steuerberatung (CSV)</p>
            <p className="mt-1 text-[13px] text-textMuted">Hauptbuch + Summen</p>
          </button>
        </div>

        {mode === 'ledger' ? (
          <p className="mt-3 text-[12px] leading-5 text-textMuted">{LEDGER_EXPORT_FOOTNOTE}</p>
        ) : (
          <p className="mt-3 text-[12px] leading-5 text-textMuted">
            Es gelten die Filter Art, Status und Suche von der Zahlungsliste.
          </p>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-[15px] text-danger">
            {error}
          </p>
        ) : null}
        {note ? <p className="mt-3 text-[15px] text-text">{note}</p> : null}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
            data-testid="payments-export-run"
          >
            {busy ? 'Wird erstellt…' : 'Herunterladen'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-full border border-borderStrong text-[15px] font-medium text-text active:bg-surfaceSunken"
          >
            Schließen
          </button>
        </div>

        <p className="mt-3 text-[12px] text-textMuted">
          Steuerstatus stellst du unter{' '}
          <Link to={withDevTenant('/settings/zahlungen')} className="text-brand underline">
            Einstellungen › Zahlungen
          </Link>{' '}
          ein.
        </p>
      </div>
    </ModalBackdrop>
  );
}
