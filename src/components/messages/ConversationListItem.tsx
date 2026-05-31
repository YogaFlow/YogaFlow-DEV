import React from 'react';
import { format } from 'date-fns';
import { Users } from 'lucide-react';
import { Conversation } from '../../lib/messages/conversations';
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
      className={`w-full text-left flex items-start gap-3 p-3 rounded-lg transition-colors ${
        isActive
          ? 'bg-teal-900/[0.07] border border-teal-700/30'
          : 'border border-transparent hover:bg-gray-50'
      }`}
    >
      <ChatAvatar size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between items-start gap-2 mb-0.5">
          <p className="font-medium text-gray-900 truncate text-sm">{conversation.displayName}</p>
          <div className="flex flex-col items-end shrink-0">
            <p
              className={`text-xs shrink-0 ${
                conversation.unreadCount > 0
                  ? 'text-emerald-600 font-medium'
                  : 'text-gray-500'
              }`}
            >
              {format(conversation.lastMessageAt, 'dd.MM.yyyy HH:mm')}
            </p>
            {conversation.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mt-1 text-xs font-semibold text-emerald-700 tabular-nums rounded-full border border-emerald-500 bg-emerald-50">
                {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {conversation.isBroadcast && (
            <Users size={13} className="text-gray-400 shrink-0" />
          )}
          <p className="text-sm text-gray-500 truncate">{conversation.preview}</p>
        </div>
      </div>
    </button>
  );
};

export default ConversationListItem;
