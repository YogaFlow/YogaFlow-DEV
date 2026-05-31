import React, { RefObject } from 'react';
import { MessageSquare } from 'lucide-react';
import { Conversation } from '../../lib/messages/conversations';
import { User } from '../../types';
import ChatHeader from './ChatHeader';
import ChatBubble from './ChatBubble';
import ChatInput from './ChatInput';

interface ChatThreadProps {
  conversation: Conversation | null;
  currentUserId: string | undefined;
  chatScrollRef: RefObject<HTMLDivElement>;
  chatEndRef: RefObject<HTMLDivElement>;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onSendReply: () => void;
  sending?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
  isCourseLeader?: boolean;
  isBroadcastMode?: boolean;
  onBroadcastModeChange?: (value: boolean) => void;
  participants?: User[];
  directRecipientId?: string;
  onDirectRecipientChange?: (id: string) => void;
  onDeleteRequest?: () => void;
}

const ChatThread: React.FC<ChatThreadProps> = ({
  conversation,
  currentUserId,
  chatScrollRef,
  chatEndRef,
  replyText,
  onReplyTextChange,
  onSendReply,
  sending = false,
  showBackButton = false,
  onBack,
  isCourseLeader = false,
  isBroadcastMode = true,
  onBroadcastModeChange,
  participants = [],
  directRecipientId = '',
  onDirectRecipientChange,
  onDeleteRequest,
}) => {
  if (!conversation) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
          <MessageSquare size={48} className="mb-3 opacity-40" />
          <p className="text-sm text-center">Wähle eine Unterhaltung aus der Liste</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <ChatHeader
        displayName={conversation.displayName}
        isBroadcast={conversation.isBroadcast}
        showBackButton={showBackButton}
        onBack={onBack}
        onDeleteRequest={onDeleteRequest}
      />

      <div
        ref={chatScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 py-4 space-y-3"
        role="log"
        aria-label="Chatverlauf"
      >
        {conversation.messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            isOwnMessage={message.sender_id === currentUserId}
          />
        ))}
        <div ref={chatEndRef} aria-hidden className="h-px shrink-0" />
      </div>

      <ChatInput
        value={replyText}
        onChange={onReplyTextChange}
        onSubmit={onSendReply}
        disabled={sending}
        isCourseLeader={isCourseLeader}
        isBroadcastThread={conversation.isBroadcast}
        isBroadcastMode={isBroadcastMode}
        onBroadcastModeChange={onBroadcastModeChange}
        participants={participants}
        directRecipientId={directRecipientId}
        onDirectRecipientChange={onDirectRecipientChange}
      />
    </div>
  );
};

export default ChatThread;
