import React from 'react';
import { User } from 'lucide-react';

type ChatAvatarSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<ChatAvatarSize, { container: string; icon: number }> = {
  sm: { container: 'w-10 h-10', icon: 20 },
  md: { container: 'w-12 h-12', icon: 24 },
  lg: { container: 'w-16 h-16', icon: 32 },
};

interface ChatAvatarProps {
  size?: ChatAvatarSize;
  imageUrl?: string | null;
  alt?: string;
  className?: string;
}

const ChatAvatar: React.FC<ChatAvatarProps> = ({
  size = 'sm',
  imageUrl,
  alt = 'Profilbild',
  className = '',
}) => {
  const { container, icon } = sizeClasses[size];

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        className={`${container} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${container} rounded-full bg-teal-100 flex items-center justify-center shrink-0 ${className}`}
      aria-hidden={!alt}
    >
      <User size={icon} className="text-teal-600" />
    </div>
  );
};

export default ChatAvatar;
