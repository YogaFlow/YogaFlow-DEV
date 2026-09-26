import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { Save } from 'lucide-react';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import StudioDesignSection from '../components/settings/StudioDesignSection';
import {
  BOOKING_MAX_PARTICIPANTS_MAX,
  BOOKING_MAX_PARTICIPANTS_MIN,
  saveBookingSettings,
} from '../lib/bookingSettings';

export default function Settings() {
  const { isAdmin, isOwner } = useAuth();
  const { tenant, updateTenant } = useTenant();
  const [saving, setSaving] = useState(false);
  const [defaultMaxParticipants, setDefaultMaxParticipants] = useState('');
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  const storedDefault = tenant?.default_max_participants;

  useEffect(() => {
    if (typeof storedDefault !== 'number') return;
    setDefaultMaxParticipants(String(storedDefault));
  }, [storedDefault]);

  const trimmed = defaultMaxParticipants.trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  const isValid = Number.isInteger(parsed)
    && parsed >= BOOKING_MAX_PARTICIPANTS_MIN
    && parsed <= BOOKING_MAX_PARTICIPANTS_MAX;
  const unchanged = tenant != null && parsed === tenant.default_max_participants;
  const canSave = Boolean(tenant && isValid && !unchanged && !saving);

  const handleSaveSettings = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await saveBookingSettings(parsed);
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

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-dangerSoft border border-danger text-danger px-4 py-3 rounded-sm">
          Zugriff verweigert. Administratorrechte erforderlich.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />

      {isOwner ? (
        <div className="mb-6">
          <StudioDesignSection />
        </div>
      ) : null}

      <div className="bg-surface rounded-md border border-border p-3.5 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-text mb-4">Buchungseinstellungen</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-textMuted mb-2">
                Standardanzahl Teilnehmer pro Kurs
              </label>
              <input
                type="number"
                value={defaultMaxParticipants}
                onChange={(e) => setDefaultMaxParticipants(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-border rounded-sm focus:ring-2 focus:ring-brand focus:border-transparent"
                min={BOOKING_MAX_PARTICIPANTS_MIN}
                max={BOOKING_MAX_PARTICIPANTS_MAX}
                step="1"
              />
              <p className="mt-1 text-sm text-textMuted">
                Dieser Wert wird beim Erstellen neuer Kurse verwendet
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <button
            onClick={() => void handleSaveSettings()}
            disabled={!canSave}
            className="flex items-center gap-2 bg-brand text-onBrand px-6 py-2 rounded-sm hover:bg-brandPressed transition-colors disabled:bg-surfaceSunken"
          >
            <Save size={20} />
            {saving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
          </button>
        </div>
      </div>

      <div className="mt-6 bg-surface rounded-md border border-border p-3.5">
        <h2 className="text-xl font-semibold text-text mb-4">Systeminformationen</h2>
        <div className="space-y-2 text-sm text-textMuted">
          <div className="flex justify-between">
            <span>Anwendungsname:</span>
            <span className="font-medium text-text">Omlify</span>
          </div>
          <div className="flex justify-between">
            <span>Datenbankstatus:</span>
            <span className="font-medium text-brand">Verbunden</span>
          </div>
        </div>
      </div>
    </div>
  );
}
