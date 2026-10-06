import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import {
  PASS_HINT_DEFAULT_TEMPLATE,
  PASS_HINT_MAX_LEN,
  PASS_HINT_PLACEHOLDERS,
  renderPassHint,
  validatePassHintTemplate,
} from '../../lib/passHint';
import { savePassHintSettings } from '../../lib/passHintSettings';
import { listPassProducts } from '../../lib/passProducts';
import { visibleCourses } from '../../lib/visibleScope';
import FeedbackDialog, { type FeedbackDialogState } from '../ui/FeedbackDialog';

type PreviewSource = {
  courseTitle: string;
  coursePrice: number;
  passName: string;
  passPriceCents: number;
  passUnits: number;
};

async function loadPreviewSource(): Promise<PreviewSource | null> {
  const [products, coursesRes] = await Promise.all([
    listPassProducts().catch(() => []),
    visibleCourses('id, title, price, pass_eligible, date')
      .eq('pass_eligible', true)
      .not('price', 'is', null)
      .order('date', { ascending: true })
      .limit(20),
  ]);
  const online = products.filter(
    (p) => p.archived_at == null && p.online_purchasable === true && p.units >= 1,
  );
  const product = online.sort(
    (a, b) => a.price_cents / a.units - b.price_cents / b.units,
  )[0];
  const course = (coursesRes.data ?? []).find(
    (c: { price?: number | null }) => Number(c.price) > 0,
  );
  if (!product || !course) return null;
  return {
    courseTitle: String(course.title ?? 'Kurs'),
    coursePrice: Number(course.price),
    passName: product.name,
    passPriceCents: product.price_cents,
    passUnits: product.units,
  };
}

export default function PassHintSection() {
  const { tenant, updateTenant } = useTenant();
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<PreviewSource | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setEnabled(tenant.pass_hint_enabled === true);
    setTemplate(tenant.pass_hint_template ?? '');
  }, [tenant]);

  useEffect(() => {
    void loadPreviewSource().then(setPreview);
  }, [tenant?.id]);

  if (!tenant) return null;

  const validation = validatePassHintTemplate(template);
  const storedEnabled = tenant.pass_hint_enabled === true;
  const storedTemplate = tenant.pass_hint_template ?? '';
  const dirty =
    enabled !== storedEnabled || template.trim() !== storedTemplate.trim();
  const canSave = dirty && validation.ok && !saving;

  const previewRender =
    preview &&
    renderPassHint(template.trim() ? template : null, {
      passName: preview.passName,
      passPriceCents: preview.passPriceCents,
      passUnits: preview.passUnits,
      coursePriceEuros: preview.coursePrice,
    });

  const insertChip = (name: string) => {
    const token = `{${name}}`;
    setTemplate((prev) => {
      if (prev.length + token.length > PASS_HINT_MAX_LEN) return prev;
      return `${prev}${token}`;
    });
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await savePassHintSettings({
        enabled,
        template: template.trim(),
      });
      if (result.ok) {
        updateTenant(result.patch);
        setFeedbackDialog({
          title: 'Gespeichert',
          message: 'Der Hinweis auf Karten ist gespeichert.',
          type: 'success',
        });
      } else {
        setFeedbackDialog({
          title: 'Speichern fehlgeschlagen',
          message: result.message,
          type: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface p-3.5" data-testid="pass-hint-section">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <h2 className="mb-1 text-xl font-semibold text-text">Hinweis auf Karten im Kurs</h2>
      <p className="mb-4 text-[13px] leading-5 text-textMuted">
        Optional unter der Zahlart im Kursdetail. Standard aus. Preise kommen aus Platzhaltern —
        tippe keine Beträge.
      </p>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 rounded-sm border-border text-brand focus:ring-brand"
          data-testid="pass-hint-enabled"
        />
        <span className="text-[15px] text-text">Hinweis anzeigen</span>
      </label>

      <div className="mt-4">
        <label className="mb-2 block text-sm font-medium text-textMuted" htmlFor="pass-hint-template">
          Text
        </label>
        <textarea
          id="pass-hint-template"
          value={template}
          onChange={(e) => setTemplate(e.target.value.slice(0, PASS_HINT_MAX_LEN))}
          rows={3}
          maxLength={PASS_HINT_MAX_LEN}
          placeholder={PASS_HINT_DEFAULT_TEMPLATE}
          className="w-full rounded-sm border border-border px-3 py-2 text-[15px] text-text focus:border-transparent focus:ring-2 focus:ring-brand"
          data-testid="pass-hint-template"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-textMuted">
            {template.trim().length}/{PASS_HINT_MAX_LEN} · leer = Standardtext
          </p>
          <button
            type="button"
            className="min-h-11 text-[13px] font-medium text-brand underline"
            onClick={() => setTemplate(PASS_HINT_DEFAULT_TEMPLATE)}
            data-testid="pass-hint-restore"
          >
            Standardtext wiederherstellen
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PASS_HINT_PLACEHOLDERS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => insertChip(name)}
              className="min-h-11 rounded-full border border-border bg-surfaceSunken px-3 text-[13px] font-medium text-text active:bg-border"
              data-testid={`pass-hint-chip-${name}`}
            >
              {`{${name}}`}
            </button>
          ))}
        </div>
        {!validation.ok ? (
          <p className="mt-2 text-[13px] text-danger" data-testid="pass-hint-error">
            {validation.message}
          </p>
        ) : null}
      </div>

      <div className="mt-4 rounded-sm border border-border bg-sand px-3 py-3">
        <p className="text-[13px] font-medium text-textMuted">Vorschau</p>
        {preview && previewRender && previewRender.ok && previewRender.text ? (
          <p className="mt-1 text-[15px] text-text underline" data-testid="pass-hint-preview">
            {previewRender.text}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-textMuted" data-testid="pass-hint-preview-empty">
            {preview
              ? 'Mit diesen Preisen entfällt der Hinweis (keine Ersparnis).'
              : 'Kein passender Kurs oder kein online kaufbares Produkt für die Vorschau.'}
          </p>
        )}
        {preview ? (
          <p className="mt-1 text-[12px] text-textSubtle">
            Beispiel: {preview.courseTitle} · {preview.passName}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="flex min-h-11 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:bg-surfaceSunken disabled:text-textMuted"
          data-testid="pass-hint-save"
        >
          <Save size={20} />
          {saving ? 'Wird gespeichert…' : 'Hinweis speichern'}
        </button>
      </div>
    </div>
  );
}
