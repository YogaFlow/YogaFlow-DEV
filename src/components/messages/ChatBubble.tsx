import React from 'react';
import { Message } from '../../types';
import { formatDateTime } from '../../lib/format';

interface ChatBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  showCourseTitle?: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isOwnMessage,
  showCourseTitle = true,
}) => {
  const courseTitle = (message.course as { title?: string } | undefined)?.title;
  const timeLabel = formatDateTime(message.created_at);

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] ${
          isOwnMessage ? 'items-end' : 'items-start'
        } flex flex-col gap-1`}
      >
        {showCourseTitle && courseTitle && (
          <span
            className={`text-[10px] text-textSubtle px-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}
          >
            {courseTitle}
          </span>
        )}
        <div
          className={`px-4 py-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed ${
            isOwnMessage
              ? 'bg-brand text-onBrand rounded-md rounded-br-sm'
              : 'bg-surfaceSunken text-text rounded-md rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>
        <span
          className={`text-[10px] text-textSubtle px-1 tabular-nums ${isOwnMessage ? 'text-right' : 'text-left'}`}
        >
          {timeLabel}
        </span>
      </div>
    </div>
  );
};

export default ChatBubble;
