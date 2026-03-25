import React from 'react';
import { Bell, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { userProfile } = useAuth();

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
          <button className="p-3 rounded-full hover:bg-gray-100 relative max-[380px]:p-2.5">
            <Bell className="w-6 h-6 text-gray-600 max-[380px]:w-5 max-[380px]:h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full max-[380px]:w-2.5 max-[380px]:h-2.5"></span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;