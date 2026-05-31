import React from 'react';
import { Search } from 'lucide-react';
import { Conversation } from '../../lib/messages/conversations';
import ConversationListItem from './ConversationListItem';

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationKey: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSelectConversation: (key: string) => void;
  onNewMessage: () => void;
  showHeader?: boolean;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationKey,
  searchTerm,
  onSearchChange,
  onSelectConversation,
  onNewMessage,
  showHeader = true,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {showHeader && (
        <div className="shrink-0 p-4 border-b border-gray-100 space-y-3">
          <button
            type="button"
            onClick={onNewMessage}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
          >
            + Neue Nachricht
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Unterhaltungen suchen..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-2 space-y-0.5">
        {conversations.length === 0 ? (
          <p className="text-gray-500 text-center py-8 text-sm">
            {searchTerm.trim() ? 'Keine Unterhaltungen gefunden' : 'Noch keine Nachrichten'}
          </p>
        ) : (
          conversations.map((conversation) => (
            <ConversationListItem
              key={conversation.key}
              conversation={conversation}
              isActive={activeConversationKey === conversation.key}
              onClick={() => onSelectConversation(conversation.key)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ConversationList;
