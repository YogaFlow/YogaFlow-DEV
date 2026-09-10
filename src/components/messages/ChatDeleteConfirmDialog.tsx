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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-text/45"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-danger shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-text">Unterhaltung löschen</h3>
              <p className="text-sm text-textMuted mt-1 truncate">{displayName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-sm text-textSubtle hover:text-textMuted hover:bg-surfaceSunken"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-textMuted leading-6">
          {isBroadcast
            ? 'Möchten Sie diese Unterhaltung wirklich löschen? Nachrichten, die Sie nicht löschen dürfen, werden ausgeblendet. Neue Nachrichten in diesem Kurs erscheinen wieder in der Liste.'
            : 'Möchten Sie diese Unterhaltung wirklich löschen? Alle Nachrichten werden dauerhaft entfernt – auch für den anderen Teilnehmer.'}
        </p>

        <div className="mt-6 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-textMuted rounded-sm hover:bg-surfaceSunken transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-danger rounded-sm hover:bg-dangerSoft transition-colors disabled:opacity-50"
          >
            {deleting ? 'Wird gelöscht…' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatDeleteConfirmDialog;
