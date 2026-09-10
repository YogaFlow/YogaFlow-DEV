import React from 'react';
import { Users } from 'lucide-react';
import { Conversation } from '../../lib/messages/conversations';
import { formatDateTime } from '../../lib/format';
import ChatAvatar from './ChatAvatar';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

const ConversationListItem: React.FC<ConversationListItemProps> = ({
  conversation,
  isActive,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-3 py-3 transition-colors ${
        isActive ? 'bg-brandSoft' : 'hover:bg-surfaceSunken'
      }`}
    >
      <ChatAvatar size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between items-start gap-2 mb-0.5">
          <p className="font-medium text-text truncate text-sm">{conversation.displayName}</p>
          <div className="flex flex-col items-end shrink-0">
            <p
              className={`text-xs shrink-0 ${
                conversation.unreadCount > 0
                  ? 'text-brand font-medium'
                  : 'text-textMuted'
              }`}
            >
              <span className="tabular-nums">{formatDateTime(conversation.lastMessageAt)}</span>
            </p>
            {conversation.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mt-1 text-xs font-semibold text-sage-800 tabular-nums rounded-full border border-sage-200 bg-sage-100">
                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {conversation.isBroadcast && (
            <Users size={13} className="text-textSubtle shrink-0" />
          )}
          <p className="text-sm text-textMuted truncate">{conversation.preview}</p>
        </div>
      </div>
    </button>
  );
};

export default ConversationListItem;
