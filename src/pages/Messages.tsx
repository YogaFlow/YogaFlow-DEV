import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import ConversationList from '../components/messages/ConversationList';
import ChatThread from '../components/messages/ChatThread';
import NewMessageModal from '../components/messages/NewMessageModal';
import ChatDeleteConfirmDialog from '../components/messages/ChatDeleteConfirmDialog';
import {
  buildConversations,
  filterConversationsBySearch,
} from '../lib/messages/conversations';
import { filterHiddenConversations } from '../lib/messages/hiddenConversations';
import { deleteConversation } from '../lib/messages/deleteConversation';
import {
  sendMessage,
  buildThreadSendPayload,
  getConversationKeyAfterSend,
  SendMessagePayload,
} from '../lib/messages/sendMessage';
import { useMessagesData } from '../lib/messages/useMessagesData';
import { markConversationAsRead, notifyMessagesSeen } from '../lib/useUnreadMessages';

export default function Messages() {
  const { userProfile, isCourseLeader } = useAuth();
  const {
    messages,
    courses,
    participants,
    loading,
    messagesLastSeen,
    fetchMessages,
    fetchParticipants,
    refreshLastSeen,
  } = useMessagesData(userProfile);

  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isBroadcastMode, setIsBroadcastMode] = useState(true);
  const [directRecipientId, setDirectRecipientId] = useState('');
  const [threadParticipants, setThreadParticipants] = useState<typeof participants>([]);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);
  const [activeConversationKey, setActiveConversationKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hasAutoSelected, setHasAutoSelected] = useState(false);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollChatToBottom = useCallback(() => {
    const container = chatScrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, []);

  const conversations = useMemo(() => {
    if (!userProfile?.id) return [];
    const built = buildConversations(messages, userProfile.id, messagesLastSeen, courses);
    return filterHiddenConversations(userProfile.id, built);
  }, [messages, userProfile?.id, messagesLastSeen, courses]);

  const filteredConversations = useMemo(
    () => filterConversationsBySearch(conversations, searchTerm),
    [conversations, searchTerm]
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.key === activeConversationKey) ?? null,
    [conversations, activeConversationKey]
  );

  const activeConversationMessageCount = activeConversation?.messages.length ?? 0;
  const activeConversationLastMessageId =
    activeConversation?.messages[activeConversationMessageCount - 1]?.id ?? null;

  useEffect(() => {
    if (selectedCourse) {
      void fetchParticipants(selectedCourse);
    }
  }, [selectedCourse, fetchParticipants]);

  useEffect(() => {
    if (activeConversation?.isBroadcast && activeConversation.courseId && isCourseLeader) {
      void fetchParticipants(activeConversation.courseId);
    }
  }, [activeConversation?.isBroadcast, activeConversation?.courseId, isCourseLeader, fetchParticipants]);

  useEffect(() => {
    if (activeConversation?.isBroadcast && isCourseLeader) {
      setThreadParticipants(participants);
    } else {
      setThreadParticipants([]);
    }
  }, [activeConversation?.isBroadcast, isCourseLeader, participants]);

  useEffect(() => {
    if (!loading && !hasAutoSelected && conversations.length > 0) {
      setActiveConversationKey(conversations[0].key);
      setHasAutoSelected(true);
    }
  }, [loading, hasAutoSelected, conversations]);

  useEffect(() => {
    if (
      activeConversationKey &&
      !conversations.some((c) => c.key === activeConversationKey)
    ) {
      setActiveConversationKey(conversations[0]?.key ?? null);
    }
  }, [conversations, activeConversationKey]);

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (
      !isMobile &&
      hasAutoSelected &&
      !activeConversationKey &&
      conversations.length > 0
    ) {
      setActiveConversationKey(conversations[0].key);
    }
  }, [conversations, activeConversationKey, hasAutoSelected]);

  useEffect(() => {
    if (!activeConversationKey) return;
    const frameId = requestAnimationFrame(() => scrollChatToBottom());
    return () => cancelAnimationFrame(frameId);
  }, [
    activeConversationKey,
    activeConversationMessageCount,
    activeConversationLastMessageId,
    scrollChatToBottom,
  ]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => {
      if (mq.matches) {
        setIsMobileChatOpen(false);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const handleOpenConversation = async (conversationKey: string) => {
    const conversation = conversations.find((c) => c.key === conversationKey);
    if (conversation && userProfile?.id && conversation.unreadCount > 0) {
      await markConversationAsRead(userProfile.id, conversationKey, conversation.messages);
      refreshLastSeen();
      await fetchMessages();
    }

    setActiveConversationKey(conversationKey);
    setReplyText('');
    setIsBroadcastMode(true);
    setDirectRecipientId('');

    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (isMobile) {
      setIsMobileChatOpen(true);
    }

    requestAnimationFrame(() => scrollChatToBottom());
  };

  const handleBackFromMobileChat = () => {
    setIsMobileChatOpen(false);
    setActiveConversationKey(null);
  };

  const executeSend = async (
    payload: SendMessagePayload,
    options: {
      clearReply?: boolean;
      closeModal?: boolean;
      openConversationKey?: string;
      showSuccessDialog?: boolean;
    } = {}
  ) => {
    if (!userProfile?.id) return;

    setSending(true);
    const fullPayload: SendMessagePayload = {
      ...payload,
      tenantId: userProfile.tenant_id,
      senderId: userProfile.id,
    };

    const { error } = await sendMessage(fullPayload);
    setSending(false);

    if (error) {
      setFeedbackDialog({
        title: 'Senden fehlgeschlagen',
        message: 'Fehler beim Senden der Nachricht: ' + error.message,
        type: 'error',
      });
      return;
    }

    if (options.clearReply) setReplyText('');
    if (options.closeModal) {
      setModalOpen(false);
      setModalMessage('');
      setRecipientId('');
      setIsBroadcast(false);
      setSelectedCourse('');
    }

    await fetchMessages();

    const conversationKey =
      options.openConversationKey ??
      getConversationKeyAfterSend(fullPayload, userProfile.id);
    setActiveConversationKey(conversationKey);

    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    if (isMobile) {
      setIsMobileChatOpen(true);
    }

    if (options.showSuccessDialog) {
      setFeedbackDialog({
        title: 'Nachricht gesendet',
        message: 'Nachricht erfolgreich gesendet.',
        type: 'success',
      });
    }

    requestAnimationFrame(() => scrollChatToBottom());
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !modalMessage.trim()) return;
    if (!isBroadcast && !recipientId) return;

    await executeSend(
      {
        tenantId: userProfile?.tenant_id,
        senderId: userProfile?.id ?? '',
        courseId: selectedCourse,
        content: modalMessage,
        isBroadcast,
        recipientId: isBroadcast ? undefined : recipientId,
      },
      { closeModal: true, showSuccessDialog: true }
    );
  };

  const handleSendReply = async () => {
    if (!activeConversation || !userProfile?.id || !replyText.trim()) return;

    if (
      activeConversation.isBroadcast &&
      isCourseLeader &&
      !isBroadcastMode &&
      !directRecipientId
    ) {
      return;
    }

    const payload = buildThreadSendPayload(
      activeConversation,
      courses,
      userProfile.id,
      isCourseLeader,
      replyText,
      {
        isBroadcastMode,
        directRecipientId: isBroadcastMode ? undefined : directRecipientId,
      }
    );

    if (!payload) return;

    await executeSend(payload, { clearReply: true });
  };

  const handleDeleteRequest = () => {
    if (activeConversation) setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeConversation || !userProfile?.id) return;

    setDeleting(true);
    const { error } = await deleteConversation(userProfile.id, activeConversation);
    setDeleting(false);

    if (error) {
      setDeleteConfirmOpen(false);
      setFeedbackDialog({
        title: 'Löschen fehlgeschlagen',
        message: 'Fehler beim Löschen: ' + error.message,
        type: 'error',
      });
      return;
    }

    setDeleteConfirmOpen(false);
    setReplyText('');
    setActiveConversationKey(null);
    setIsMobileChatOpen(false);
    await fetchMessages();
    notifyMessagesSeen();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  const listPanel = (
    <ConversationList
      conversations={filteredConversations}
      activeConversationKey={activeConversationKey}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      onSelectConversation={(key) => void handleOpenConversation(key)}
      onNewMessage={() => setModalOpen(true)}
    />
  );

  const threadPanel = (
    <ChatThread
      conversation={activeConversation}
      currentUserId={userProfile?.id}
      chatScrollRef={chatScrollRef}
      chatEndRef={chatEndRef}
      replyText={replyText}
      onReplyTextChange={setReplyText}
      onSendReply={() => void handleSendReply()}
      sending={sending}
      showBackButton
      onBack={handleBackFromMobileChat}
      isCourseLeader={isCourseLeader}
      isBroadcastMode={isBroadcastMode}
      onBroadcastModeChange={setIsBroadcastMode}
      participants={threadParticipants}
      directRecipientId={directRecipientId}
      onDirectRecipientChange={setDirectRecipientId}
      onDeleteRequest={handleDeleteRequest}
    />
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-4 lg:p-0">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />

      <ChatDeleteConfirmDialog
        isOpen={deleteConfirmOpen}
        displayName={activeConversation?.displayName ?? ''}
        isBroadcast={activeConversation?.isBroadcast ?? false}
        deleting={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <NewMessageModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        courses={courses}
        participants={participants}
        isCourseLeader={isCourseLeader}
        selectedCourse={selectedCourse}
        onSelectedCourseChange={setSelectedCourse}
        recipientId={recipientId}
        onRecipientIdChange={setRecipientId}
        isBroadcast={isBroadcast}
        onIsBroadcastChange={setIsBroadcast}
        message={modalMessage}
        onMessageChange={setModalMessage}
        onSubmit={(e) => void handleModalSubmit(e)}
        sending={sending}
      />

      <div className="flex items-center gap-3 mb-3 lg:mb-4 shrink-0">
        <MessageSquare size={26} className="text-gray-900 lg:w-7 lg:h-7" />
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Nachrichten</h1>
      </div>

      {/* Desktop / Tablet: two columns */}
      <div className="hidden lg:grid lg:grid-cols-[minmax(280px,360px)_1fr] gap-4 flex-1 min-h-0">
        <div className="min-h-0">{listPanel}</div>
        <div className="min-h-0">{threadPanel}</div>
      </div>

      {/* Mobile: list OR fullscreen chat */}
      <div className="lg:hidden flex-1 min-h-0">
        {!isMobileChatOpen ? (
          listPanel
        ) : (
          <div className="fixed inset-0 z-30 flex flex-col bg-white lg:hidden">
            {threadPanel}
          </div>
        )}
      </div>
    </div>
  );
}
