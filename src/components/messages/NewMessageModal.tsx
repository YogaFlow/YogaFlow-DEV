import React, { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Send, Smile, X } from 'lucide-react';
import { Course, User } from '../../types';

interface NewMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  participants: User[];
  isCourseLeader: boolean;
  selectedCourse: string;
  onSelectedCourseChange: (id: string) => void;
  recipientId: string;
  onRecipientIdChange: (id: string) => void;
  isBroadcast: boolean;
  onIsBroadcastChange: (value: boolean) => void;
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending?: boolean;
}

const NewMessageModal: React.FC<NewMessageModalProps> = ({
  isOpen,
  onClose,
  courses,
  participants,
  isCourseLeader,
  selectedCourse,
  onSelectedCourseChange,
  recipientId,
  onRecipientIdChange,
  isBroadcast,
  onIsBroadcastChange,
  message,
  onMessageChange,
  onSubmit,
  sending = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selectedCourseData = courses.find((c) => c.id === selectedCourse);
  const courseLeaderLabel = selectedCourseData?.teacher
    ? `Kursleiter – ${selectedCourseData.teacher.first_name} ${selectedCourseData.teacher.last_name}`.trim()
    : 'Kursleiter';

  useEffect(() => {
    if (isOpen) {
      const frameId = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frameId);
    }
    setIsVisible(false);
  }, [isOpen]);

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
      onMessageChange(message + emojiData.emoji);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    onMessageChange(message.slice(0, start) + emojiData.emoji + message.slice(end));
    requestAnimationFrame(() => {
      const pos = start + emojiData.emoji.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity duration-200 ${
        isVisible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full sm:max-w-lg max-h-[95vh] overflow-y-auto rounded-t-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Neue Nachricht</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-[var(--radius-sm)] hover:bg-surfaceSunken text-textMuted transition-colors"
            aria-label="Schließen"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-textMuted mb-1">Kurs</label>
            <select
              value={selectedCourse}
              onChange={(e) => onSelectedCourseChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent text-base"
              required
            >
              <option value="">Kurs auswählen</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} - {format(new Date(course.date), 'dd.MM.yyyy')}
                </option>
              ))}
            </select>
          </div>

          {isCourseLeader && selectedCourse && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-textMuted">
                <input
                  type="checkbox"
                  checked={isBroadcast}
                  onChange={(e) => {
                    onIsBroadcastChange(e.target.checked);
                    if (e.target.checked) onRecipientIdChange('');
                  }}
                  className="rounded-[var(--radius-sm)] border-border text-brand focus:ring-brand"
                />
                An alle Teilnehmer senden
              </label>
            </div>
          )}

          {!isBroadcast && selectedCourse && (
            <div>
              <label className="block text-sm font-medium text-textMuted mb-1">Empfänger</label>
              <select
                value={recipientId}
                onChange={(e) => onRecipientIdChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent text-base"
                required={!isBroadcast}
              >
                <option value="">Empfänger auswählen</option>
                {isCourseLeader ? (
                  participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.first_name} {participant.last_name}
                    </option>
                  ))
                ) : (
                  <option value={selectedCourseData?.teacher_id ?? ''}>
                    {courseLeaderLabel}
                  </option>
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-textMuted mb-1">Nachricht</label>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 pr-10 border border-border rounded-[var(--radius-sm)] focus:ring-2 focus:ring-brand focus:border-transparent resize-none text-base"
                placeholder="Geben Sie hier Ihre Nachricht ein..."
                required
              />
              <div className="absolute bottom-2 right-2" ref={pickerRef}>
                <button
                  type="button"
                  onClick={() => setEmojiOpen((o) => !o)}
                  className="p-1.5 rounded-[var(--radius-sm)] text-textSubtle hover:text-brandPressed hover:bg-surfaceSunken"
                  aria-label="Emoji auswählen"
                >
                  <Smile size={18} />
                </button>
                {emojiOpen && (
                  <div className="absolute bottom-full right-0 mb-2 z-50 shadow-lg rounded-[var(--radius-md)] overflow-hidden">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      theme={Theme.LIGHT}
                      width={280}
                      height={340}
                      searchPlaceholder="Emoji suchen..."
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 bg-brand text-onBrand px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-brandPressed transition-colors disabled:opacity-50 text-sm font-medium"
          >
            <Send size={18} />
            Nachricht senden
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewMessageModal;
