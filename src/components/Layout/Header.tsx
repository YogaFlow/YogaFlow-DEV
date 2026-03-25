import React, { useEffect, useRef, useState } from 'react';
import { Bell, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { userProfile } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const unreadNotificationsCount = 0;
  const notificationButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationPopupRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 shadow-sm border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 max-[380px]:px-3 max-[380px]:py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-3 rounded-md hover:bg-gray-100 mr-3 sm:mr-4 shrink-0 max-[380px]:p-2.5 max-[380px]:mr-2"
          >
            <Menu className="w-6 h-6 max-[380px]:w-5 max-[380px]:h-5" />
          </button>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 truncate max-[380px]:text-[17px]">
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
              className="p-3 rounded-full hover:bg-gray-100 relative max-[380px]:p-2.5"
              aria-label="Benachrichtigungen öffnen"
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              aria-controls="notifications-popup"
            >
              <Bell className="w-6 h-6 text-gray-600 max-[380px]:w-5 max-[380px]:h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full max-[380px]:w-2.5 max-[380px]:h-2.5"></span>
              )}
            </button>

            <div
              id="notifications-popup"
              ref={notificationPopupRef}
              role="dialog"
              aria-label="Benachrichtigungen"
              aria-hidden={!isNotificationsOpen}
              className={`absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-1.5rem))] max-[380px]:w-[min(18rem,calc(100vw-1rem))] bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-40 origin-top-right transition-all duration-200 ease-out ${
                isNotificationsOpen
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 -translate-y-1 scale-95 pointer-events-none'
              }`}
            >
              <p className="text-sm font-semibold text-gray-900">Benachrichtigungen</p>
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-sm text-gray-700">Keine Benachrichtigungen vorhanden.</p>
                <p className="text-xs text-gray-500 mt-1">Funktion kommt in Kuerze.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;