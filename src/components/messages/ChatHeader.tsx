import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MoreVertical, Trash2, Users } from 'lucide-react';
import ChatAvatar from './ChatAvatar';

interface ChatHeaderProps {
  displayName: string;
  isBroadcast?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  showOnlineStatus?: boolean;
  onDeleteRequest?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  displayName,
  isBroadcast = false,
  showBackButton = false,
  onBack,
  showOnlineStatus = false,
  onDeleteRequest,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const handleDeleteClick = () => {
    setMenuOpen(false);
    onDeleteRequest?.();
  };

  return (
    <div className="flex shrink-0 items-center gap-3 px-4 py-3 border-b border-border bg-surface">
      {showBackButton && (
        <button
          type="button"
          onClick={onBack}
          className="p-2 -ml-1 rounded-lg hover:bg-surfaceSunken text-textMuted transition-colors lg:hidden"
          aria-label="Zurück zur Konversationsliste"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <ChatAvatar size="sm" />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-text truncate">{displayName}</h2>
        {isBroadcast && (
          <span className="inline-flex items-center gap-1 text-xs text-textMuted">
            <Users size={12} />
            Rundnachricht
          </span>
        )}
        {showOnlineStatus && (
          <span className="text-xs text-textSubtle">Online-Status folgt</span>
        )}
      </div>

      {onDeleteRequest && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-2 rounded-lg text-textMuted hover:bg-surfaceSunken hover:text-textMuted transition-colors"
            aria-label="Weitere Optionen"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical size={20} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-50 min-w-[11rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleDeleteClick}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-dangerSoft transition-colors text-left"
              >
                <Trash2 size={16} />
                Unterhaltung löschen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatHeader;
