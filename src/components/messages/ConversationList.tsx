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
    <div className="flex flex-col max-lg:h-auto lg:h-full lg:min-h-0 bg-surface rounded-[var(--radius-md)] border border-border overflow-hidden">
      {showHeader && (
        <div className="shrink-0 p-3.5 border-b border-border space-y-3">
          <button
            type="button"
            onClick={onNewMessage}
            className="w-full flex items-center justify-center gap-2 bg-brand text-onBrand px-4 py-2.5 rounded-[var(--radius-sm)] hover:bg-brandPressed transition-colors text-sm font-medium"
          >
            + Neue Nachricht
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-textSubtle" />
            <input
              type="text"
              placeholder="Unterhaltungen suchen..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-border py-2.5 pl-10 pr-4 text-base focus:border-transparent focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      )}

      <div className="max-lg:overflow-visible lg:flex-1 lg:min-h-0 lg:overflow-y-auto overscroll-y-contain">
        {conversations.length === 0 ? (
          <p className="text-textMuted text-center py-8 text-sm">
            {searchTerm.trim() ? 'Keine Unterhaltungen gefunden' : 'Noch keine Nachrichten'}
          </p>
        ) : (
          conversations.map((conversation, index) => (
            <div key={conversation.key}>
              <ConversationListItem
                conversation={conversation}
                isActive={activeConversationKey === conversation.key}
                onClick={() => onSelectConversation(conversation.key)}
              />
              {index < conversations.length - 1 && (
                <div className="mx-4 border-b border-border" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ConversationList;
