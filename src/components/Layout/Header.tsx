import React, { useEffect, useRef, useState } from 'react';
import { Bell, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../lib/useNotifications';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationPopupRef = useRef<HTMLDivElement | null>(null);

  // Beim Öffnen des Popups alle ungelesenen Benachrichtigungen als gelesen markieren.
  useEffect(() => {
    if (isNotificationsOpen) {
      void markAllAsRead();
    }
  }, [isNotificationsOpen, markAllAsRead]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        notificationButtonRef.current?.contains(target) ||
        notificationPopupRef.current?.contains(target)
      ) {
        return;
      }

      setIsNotificationsOpen(false);
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const handleGoToRegistrations = (path?: string) => {
    setIsNotificationsOpen(false);
    const destination =
      !path || path === '/my-courses' || path.startsWith('/my-courses#anmeldungen')
        ? '/my-registrations'
        : path;
    navigate(destination);
  };

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85 shadow-sm border-b border-border px-4 py-3 sm:px-6 sm:py-4 max-[380px]:px-3 max-[380px]:py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-3 rounded-md hover:bg-surfaceSunken mr-3 sm:mr-4 shrink-0 max-[380px]:p-2.5 max-[380px]:mr-2"
          >
            <Menu className="w-6 h-6 max-[380px]:w-5 max-[380px]:h-5" />
          </button>
          <h2 className="text-lg sm:text-xl font-semibold text-text truncate max-[380px]:text-[17px]">
            <span className="max-[380px]:hidden">Willkommen zurück, {userProfile?.first_name}!</span>
            <span className="hidden max-[380px]:inline">Willkommen</span>
          </h2>
        </div>

        <div className="flex items-center space-x-3 sm:space-x-4 shrink-0 max-[380px]:space-x-2">
          <div className="relative">
            <button
              ref={notificationButtonRef}
              type="button"
              onClick={() => setIsNotificationsOpen((prev) => !prev)}
              className="p-3 rounded-full hover:bg-surfaceSunken relative max-[380px]:p-2.5"
              aria-label={
                unreadCount > 0
                  ? `Benachrichtigungen öffnen, ${unreadCount} ungelesen`
                  : 'Benachrichtigungen öffnen'
              }
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              aria-controls="notifications-popup"
            >
              <span className="relative inline-flex items-center justify-center">
                <Bell
                  className={`w-6 h-6 max-[380px]:w-5 max-[380px]:h-5 ${
                    unreadCount > 0 ? 'text-textMuted' : 'text-textMuted'
                  }`}
                />
                {unreadCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger px-[3px] text-[10px] font-bold leading-none text-onBrand tabular-nums shadow-sm ring-1 ring-surface max-[380px]:-top-0 max-[380px]:-right-0.5"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </span>
            </button>

            <div
              id="notifications-popup"
              ref={notificationPopupRef}
              role="dialog"
              aria-label="Benachrichtigungen"
              aria-hidden={!isNotificationsOpen}
              className={`absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1.5rem))] max-[380px]:w-[min(18rem,calc(100vw-1rem))] bg-surface border border-border rounded-xl shadow-lg p-4 z-40 origin-top-right transition-all duration-200 ease-out ${
                isNotificationsOpen
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 -translate-y-1 scale-95 pointer-events-none'
              }`}
            >
              <p className="text-sm font-semibold text-text">Benachrichtigungen</p>
              <div className="mt-3 border-t border-border pt-3 max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-textMuted">Keine Benachrichtigungen vorhanden.</p>
                ) : (
                  <ul className="space-y-3">
                    {notifications.map((notification) => (
                      <li
                        key={notification.id}
                        className={`rounded-lg border p-3 ${
                          notification.read_at
                            ? 'border-border bg-surfaceSunken/50'
                            : 'border-sage-200 bg-sage-100/30'
                        }`}
                      >
                        <p className="text-sm text-text">{notification.body}</p>
                        <button
                          type="button"
                          onClick={() => handleGoToRegistrations(notification.action_path)}
                          className="mt-2 text-sm font-medium text-brand hover:text-brandPressed underline-offset-2 hover:underline"
                        >
                          Zu meinen Anmeldungen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
