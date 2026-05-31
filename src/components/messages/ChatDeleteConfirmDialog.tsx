import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ChatDeleteConfirmDialogProps {
  isOpen: boolean;
  displayName: string;
  isBroadcast: boolean;
  deleting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ChatDeleteConfirmDialog: React.FC<ChatDeleteConfirmDialogProps> = ({
  isOpen,
  displayName,
  isBroadcast,
  deleting = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Unterhaltung löschen</h3>
              <p className="text-sm text-gray-600 mt-1 truncate">{displayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-gray-600 leading-6">
          {isBroadcast
            ? 'Möchten Sie diese Unterhaltung wirklich löschen? Nachrichten, die Sie nicht löschen dürfen, werden ausgeblendet. Neue Nachrichten in diesem Kurs erscheinen wieder in der Liste.'
            : 'Möchten Sie diese Unterhaltung wirklich löschen? Alle Nachrichten werden dauerhaft entfernt – auch für den anderen Teilnehmer.'}
        </p>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Wird gelöscht…' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatDeleteConfirmDialog;
