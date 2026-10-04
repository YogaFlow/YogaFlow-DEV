import { buildPaymentsListCsv, paymentsExportFilename } from './paymentsExportCsv.ts';
import {
  PAYMENTS_PAGE_SIZE,
  type PaymentKind,
  type PaymentOverviewStatus,
  type StudioPaymentRow,
} from './paymentOverview.ts';
import { listReceiptsForPayments } from './receipts.ts';
import { fetchStudioPayments } from './studioPayments.ts';
import { currentTenantSlug } from './tenantSlug.ts';

export { buildPaymentsListCsv, paymentsExportFilename } from './paymentsExportCsv.ts';

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

/** Alle Seiten der aktuellen Filter laden (für Export). */
export async function fetchAllStudioPayments(query: {
  month: string;
  kind: PaymentKind | '';
  status: PaymentOverviewStatus | '';
  search: string;
}): Promise<StudioPaymentRow[]> {
  const first = await fetchStudioPayments({ ...query, page: 1 });
  const pages = Math.max(1, Math.ceil(first.total / PAYMENTS_PAGE_SIZE));
  const items = [...first.items];
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchStudioPayments({ ...query, page });
    items.push(...next.items);
  }
  return items;
}

export async function downloadPaymentsListCsv(query: {
  month: string;
  kind: PaymentKind | '';
  status: PaymentOverviewStatus | '';
  search: string;
}): Promise<{ ok: true; rows: number } | { ok: false; message: string }> {
  try {
    const rows = await fetchAllStudioPayments(query);
    const receipts = await listReceiptsForPayments(rows.map((r) => r.payment_id));
    const receiptByPayment = new Map<string, string>();
    for (const receipt of receipts) {
      if (receipt.kind !== 'receipt') continue;
      if (!receiptByPayment.has(receipt.payment_id)) {
        receiptByPayment.set(receipt.payment_id, receipt.number);
      }
    }
    downloadCsv(
      paymentsExportFilename(query.month, currentTenantSlug()),
      buildPaymentsListCsv(rows, receiptByPayment),
    );
    return { ok: true, rows: rows.length };
  } catch {
    return { ok: false, message: 'Der Export ist fehlgeschlagen. Bitte versuche es noch einmal.' };
  }
}
