import { useCallback, useEffect, useState } from 'react';
import type { PassProduct } from '../../types';
import { formatCents } from '../../lib/format';
import {
  formatPassValidity,
  formatUnitsLabel,
  centsPerUnit,
  listPassProducts,
  setPassProductArchived,
} from '../../lib/passProducts';
import ConfirmDialog, { type ConfirmDialogState } from '../ui/ConfirmDialog';
import FeedbackDialog, { type FeedbackDialogState } from '../ui/FeedbackDialog';
import PassProductDialog from './PassProductDialog';

export default function PassProductsSection() {
  const [products, setProducts] = useState<PassProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PassProduct | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<ConfirmDialogState | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackDialogState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError('');
    try {
      const rows = await listPassProducts();
      setProducts(rows);
    } catch {
      setLoadError('Karten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = products.filter((p) => p.archived_at == null);
  const archived = products.filter((p) => p.archived_at != null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (product: PassProduct) => {
    setEditing(product);
    setDialogOpen(true);
  };

  const requestArchive = (product: PassProduct) => {
    setArchiveTargetId(product.id);
    setArchiveConfirm({
      title: 'Karte archivieren?',
      message:
        'Die Karte kann danach nicht mehr verkauft werden. Bereits verkaufte Karten bleiben gültig.',
      confirmLabel: 'Archivieren',
      cancelLabel: 'Abbrechen',
      variant: 'danger',
    });
  };

  const confirmArchive = async () => {
    if (!archiveTargetId) return;
    setArchiveLoading(true);
    try {
      const result = await setPassProductArchived(archiveTargetId, true);
      if (!result.ok) {
        setFeedback({ title: 'Archivieren fehlgeschlagen', message: result.message, type: 'error' });
      } else {
        await reload();
      }
    } finally {
      setArchiveLoading(false);
      setArchiveConfirm(null);
      setArchiveTargetId(null);
    }
  };

  const restore = async (product: PassProduct) => {
    setBusyId(product.id);
    try {
      const result = await setPassProductArchived(product.id, false);
      if (!result.ok) {
        setFeedback({ title: 'Zurückholen fehlgeschlagen', message: result.message, type: 'error' });
      } else {
        await reload();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-surface rounded-md border border-border p-3.5">
      <FeedbackDialog dialog={feedback} onClose={() => setFeedback(null)} />
      <ConfirmDialog
        dialog={archiveConfirm}
        loading={archiveLoading}
        onConfirm={() => void confirmArchive()}
        onCancel={() => {
          if (archiveLoading) return;
          setArchiveConfirm(null);
          setArchiveTargetId(null);
        }}
      />
      <PassProductDialog
        open={dialogOpen}
        product={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => void reload()}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text">Karten</h2>
        {active.length > 0 || archived.length > 0 ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand transition-colors active:bg-brandPressed"
          >
            Karte anlegen
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-textMuted">Wird geladen…</p>
      ) : loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : active.length === 0 ? (
        <div className="rounded-md border border-border bg-surfaceSunken px-3.5 py-5">
          <p className="text-[15px] text-text">
            Lege 5er- oder 10er-Karten an, die du vor Ort verkaufst.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand transition-colors active:bg-brandPressed"
          >
            Karte anlegen
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {active.map((product) => {
            const per = centsPerUnit(product.price_cents, product.units);
            return (
              <li key={product.id} className="bg-surface px-3.5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="text-[15px] font-medium text-text">{product.name}</p>
                    <p className="text-sm tabular-nums text-textMuted">
                      {formatUnitsLabel(product.units)}
                      {' · '}
                      {formatCents(product.price_cents)}
                      {per != null ? ` · ${formatCents(per)} pro Termin` : ''}
                    </p>
                    <p className="text-sm text-textMuted">
                      {formatPassValidity(product.validity_rule, product.validity_value)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(product)}
                      className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-brand transition-colors active:bg-brandSoft"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => requestArchive(product)}
                      className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-textMuted transition-colors active:bg-surfaceSunken"
                    >
                      Archivieren
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setArchiveExpanded((v) => !v)}
            className="inline-flex min-h-11 items-center text-[15px] font-medium text-textMuted"
            aria-expanded={archiveExpanded}
          >
            Archiviert ({archived.length})
            <span className="ml-2 text-textSubtle" aria-hidden>
              {archiveExpanded ? '▴' : '▾'}
            </span>
          </button>
          {archiveExpanded ? (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border">
              {archived.map((product) => (
                <li key={product.id} className="bg-surfaceSunken px-3.5 py-3 opacity-80">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[15px] font-medium text-textMuted">{product.name}</p>
                      <p className="text-sm tabular-nums text-textSubtle">
                        {formatUnitsLabel(product.units)}
                        {' · '}
                        {formatCents(product.price_cents)}
                      </p>
                      <p className="text-sm text-textSubtle">
                        {formatPassValidity(product.validity_rule, product.validity_value)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === product.id}
                      onClick={() => void restore(product)}
                      className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium text-brand transition-colors active:bg-brandSoft disabled:opacity-50"
                    >
                      {busyId === product.id ? 'Bitte warten…' : 'Zurückholen'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
