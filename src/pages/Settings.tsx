import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import { GlobalSettings } from '../types';

export default function Settings() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancellationDeadline, setCancellationDeadline] = useState('48');
  const [defaultMaxParticipants, setDefaultMaxParticipants] = useState('10');

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*');

      if (error) throw error;

      data?.forEach((setting: GlobalSettings) => {
        if (setting.key === 'cancellation_deadline_hours') {
          setCancellationDeadline(String(setting.value));
        } else if (setting.key === 'default_max_participants') {
          setDefaultMaxParticipants(String(setting.value));
        }
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updates = [
        {
          key: 'cancellation_deadline_hours',
          value: parseInt(cancellationDeadline),
          updated_at: new Date().toISOString()
        },
        {
          key: 'default_max_participants',
          value: parseInt(defaultMaxParticipants),
          updated_at: new Date().toISOString()
        }
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('global_settings')
          .upsert(update, { onConflict: 'key' });

        if (error) throw error;
      }

      alert('Einstellungen erfolgreich gespeichert');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      alert('Fehler beim Speichern der Einstellungen: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Zugriff verweigert. Administratorrechte erforderlich.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon size={32} className="text-gray-900" />
        <h1 className="text-3xl font-bold text-gray-900">Systemeinstellungen</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Buchungseinstellungen</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stornierungsfrist (Stunden vor Kursbeginn)
              </label>
              <input
                type="number"
                value={cancellationDeadline}
                onChange={(e) => setCancellationDeadline(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                min="0"
                step="1"
              />
              <p className="mt-1 text-sm text-gray-500">
                Teilnehmer können innerhalb dieser Frist vor Kursbeginn nicht mehr stornieren
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Standardanzahl Teilnehmer pro Kurs
              </label>
              <input
                type="number"
                value={defaultMaxParticipants}
                onChange={(e) => setDefaultMaxParticipants(e.target.value)}
                className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                min="1"
                step="1"
              />
              <p className="mt-1 text-sm text-gray-500">
                Dieser Wert wird beim Erstellen neuer Kurse verwendet
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-2 bg-gray-900 text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
          >
            <Save size={20} />
            {saving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
          </button>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Systeminformationen</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Anwendungsname:</span>
            <span className="font-medium text-gray-900">YogaFlow Manager</span>
          </div>
          <div className="flex justify-between">
            <span>Datenbankstatus:</span>
            <span className="font-medium text-green-600">Verbunden</span>
          </div>
        </div>
      </div>
    </div>
  );
}
