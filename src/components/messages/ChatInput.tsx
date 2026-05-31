import React, { useRef, useState, useEffect } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Send, Smile } from 'lucide-react';
import { User } from '../../types';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  isCourseLeader?: boolean;
  isBroadcastThread?: boolean;
  isBroadcastMode?: boolean;
  onBroadcastModeChange?: (value: boolean) => void;
  participants?: User[];
  directRecipientId?: string;
  onDirectRecipientChange?: (id: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Nachricht schreiben...',
  isCourseLeader = false,
  isBroadcastThread = false,
  isBroadcastMode = true,
  onBroadcastModeChange,
  participants = [],
  directRecipientId = '',
  onDirectRecipientChange,
}) => {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!emojiOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [emojiOpen]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(value + emojiData.emoji);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = value.slice(0, start) + emojiData.emoji + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      const pos = start + emojiData.emoji.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSubmit();
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !disabled) {
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={handleFormSubmit}
      className="shrink-0 border-t border-gray-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {isBroadcastThread && isCourseLeader && onBroadcastModeChange && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-gray-600">
            <input
              type="radio"
              name="broadcastMode"
              checked={isBroadcastMode}
              onChange={() => onBroadcastModeChange(true)}
              className="text-teal-600 focus:ring-teal-500"
            />
            An alle Teilnehmer
          </label>
          <label className="flex items-center gap-1.5 text-gray-600">
            <input
              type="radio"
              name="broadcastMode"
              checked={!isBroadcastMode}
              onChange={() => onBroadcastModeChange(false)}
              className="text-teal-600 focus:ring-teal-500"
            />
            Direkt an Person
          </label>
          {!isBroadcastMode && onDirectRecipientChange && (
            <select
              value={directRecipientId}
              onChange={(e) => onDirectRecipientChange(e.target.value)}
              className="flex-1 min-w-[140px] text-xs border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-teal-500"
              required={!isBroadcastMode}
            >
              <option value="">Empfänger wählen</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="relative shrink-0" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setEmojiOpen((o) => !o)}
            className="p-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-teal-600 transition-colors"
            aria-label="Emoji auswählen"
            disabled={disabled}
          >
            <Smile size={20} />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-full left-0 mb-2 z-50 shadow-2xl rounded-xl overflow-hidden">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={Theme.LIGHT}
                width={300}
                height={380}
                searchPlaceholder="Emoji suchen..."
                previewConfig={{ showPreview: false }}
              />
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-h-[44px] max-h-32 resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="shrink-0 p-2.5 rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Nachricht senden"
        >
          <Send size={20} />
        </button>
      </div>
    </form>
  );
};

export default ChatInput;
