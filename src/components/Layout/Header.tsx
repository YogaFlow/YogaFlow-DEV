import React from 'react';
import { Bell, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { userProfile } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-3 py-2 sm:px-6 sm:py-4 max-[380px]:px-2 max-[380px]:py-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 mr-2 sm:mr-4 shrink-0 max-[380px]:p-1.5 max-[380px]:mr-1.5"
          >
            <Menu className="w-5 h-5 max-[380px]:w-4 max-[380px]:h-4" />
          </button>
          <h2 className="text-base sm:text-xl font-semibold text-gray-800 truncate max-[380px]:text-sm">
            <span className="max-[380px]:hidden">Willkommen zurück, {userProfile?.first_name}!</span>
            <span className="hidden max-[380px]:inline">Willkommen</span>
          </h2>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4 shrink-0 max-[380px]:space-x-1">
          <button className="p-2 rounded-full hover:bg-gray-100 relative max-[380px]:p-1.5">
            <Bell className="w-5 h-5 text-gray-600 max-[380px]:w-4 max-[380px]:h-4" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full max-[380px]:w-2.5 max-[380px]:h-2.5"></span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;