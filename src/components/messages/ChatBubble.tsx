import React from 'react';
import { format } from 'date-fns';
import { Message } from '../../types';

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
  const timeLabel = format(new Date(message.created_at), 'dd.MM.yyyy HH:mm');

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] ${
          isOwnMessage ? 'items-end' : 'items-start'
        } flex flex-col gap-1`}
      >
        {showCourseTitle && courseTitle && (
          <span
            className={`text-[10px] text-gray-400 px-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}
          >
            {courseTitle}
          </span>
        )}
        <div
          className={`px-4 py-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed ${
            isOwnMessage
              ? 'bg-teal-600 text-white rounded-2xl rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'
          }`}
        >
          {message.content}
        </div>
        <span
          className={`text-[10px] text-gray-400 px-1 ${isOwnMessage ? 'text-right' : 'text-left'}`}
        >
          {timeLabel}
        </span>
      </div>
    </div>
  );
};

export default ChatBubble;
