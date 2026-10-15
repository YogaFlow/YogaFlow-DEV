import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import {
  BOOKING_CANCELLATION_WINDOW_DEFAULT,
  BOOKING_CANCELLATION_WINDOW_MAX,
  BOOKING_CANCELLATION_WINDOW_MIN,
  BOOKING_MAX_PARTICIPANTS_MAX,
  BOOKING_MAX_PARTICIPANTS_MIN,
  saveBookingSettings,
} from '../../lib/bookingSettings';
import FeedbackDialog, { type FeedbackDialogState } from '../ui/FeedbackDialog';

export default function BookingSettingsSection() {
  const { tenant, updateTenant } = useTenant();
  const [saving, setSaving] = useState(false);
  const [defaultMaxParticipants, setDefaultMaxParticipants] = useState('');
  const [cancellationWindowHours, setCancellationWindowHours] = useState('');
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  const storedDefault = tenant?.default_max_participants;
  const storedWindow =
    typeof tenant?.cancellation_window_hours === 'number'
      ? tenant.cancellation_window_hours
      : BOOKING_CANCELLATION_WINDOW_DEFAULT;

  useEffect(() => {
    if (typeof storedDefault !== 'number') return;
    setDefaultMaxParticipants(String(storedDefault));
  }, [storedDefault]);

  useEffect(() => {
    setCancellationWindowHours(String(storedWindow));
  }, [storedWindow]);

  const trimmedMax = defaultMaxParticipants.trim();
  const parsedMax = /^\d+$/.test(trimmedMax) ? Number(trimmedMax) : NaN;
  const maxValid =
    Number.isInteger(parsedMax) &&
    parsedMax >= BOOKING_MAX_PARTICIPANTS_MIN &&
    parsedMax <= BOOKING_MAX_PARTICIPANTS_MAX;

  const trimmedWindow = cancellationWindowHours.trim();
  const parsedWindow = /^\d+$/.test(trimmedWindow) ? Number(trimmedWindow) : NaN;
  const windowValid =
    Number.isInteger(parsedWindow) &&
    parsedWindow >= BOOKING_CANCELLATION_WINDOW_MIN &&
    parsedWindow <= BOOKING_CANCELLATION_WINDOW_MAX;

  const maxChanged = tenant != null && maxValid && parsedMax !== tenant.default_max_participants;
  const windowChanged = tenant != null && windowValid && parsedWindow !== storedWindow;
  const canSave = Boolean(
    tenant && maxValid && windowValid && (maxChanged || windowChanged) && !saving,
  );

  const handleSaveSettings = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await saveBookingSettings({
        defaultMaxParticipants: maxChanged ? parsedMax : null,
        cancellationWindowHours: windowChanged ? parsedWindow : null,
      });
      if (result.ok) {
        updateTenant(result.patch);
        setFeedbackDialog({
          title: 'Gespeichert',
          message: 'Die Buchungseinstellungen sind gespeichert.',
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
    <div>
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <div className="space-y-6 rounded-md border border-border bg-surface p-3.5">
        <div>
          <h2 className="mb-4 text-xl font-semibold text-text">Buchungseinstellungen</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-textMuted">
                Standardanzahl Teilnehmer pro Kurs
              </label>
              <input
                type="number"
                value={defaultMaxParticipants}
                onChange={(e) => setDefaultMaxParticipants(e.target.value)}
                className="w-full max-w-xs rounded-sm border border-border px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-brand"
                min={BOOKING_MAX_PARTICIPANTS_MIN}
                max={BOOKING_MAX_PARTICIPANTS_MAX}
                step="1"
              />
              <p className="mt-1 text-sm text-textMuted">
                Dieser Wert wird beim Erstellen neuer Kurse verwendet
              </p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-textMuted">
                Kostenlos abmelden bis … Stunden vor Kursbeginn
              </label>
              <input
                type="number"
                value={cancellationWindowHours}
                onChange={(e) => setCancellationWindowHours(e.target.value)}
                className="w-full max-w-xs rounded-sm border border-border px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-brand"
                min={BOOKING_CANCELLATION_WINDOW_MIN}
                max={BOOKING_CANCELLATION_WINDOW_MAX}
                step="1"
                data-testid="cancellation-window"
              />
              <p className="mt-1 text-[13px] leading-5 text-textMuted">
                Gilt für neue Buchungen. Bestehende Buchungen behalten ihre Frist.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-border bg-sand px-3 py-3 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={() => void handleSaveSettings()}
          disabled={!canSave}
          className="flex min-h-11 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:bg-surfaceSunken disabled:text-textMuted"
        >
          <Save size={20} />
          {saving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
        </button>
      </div>
    </div>
  );
}
