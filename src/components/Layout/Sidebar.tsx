import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Calendar,
  Users,
  BookOpen,
  Settings,
  User,
  LogOut,
  Home,
  MessageSquare,
  UserCog
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar: React.FC = () => {
  const { userProfile, signOut, isAdmin, isCourseLeader, isParticipant } = useAuth();

  const getNavItems = () => {
    const items = [
      { to: '/dashboard', icon: Home, label: 'Übersicht' },
      { to: '/courses', icon: Calendar, label: 'Kurse' },
      { to: '/messages', icon: MessageSquare, label: 'Nachrichten' },
      { to: '/profile', icon: User, label: 'Profil' }
    ];

    if (isCourseLeader || isAdmin) {
      items.splice(2, 0,
        { to: '/my-courses', icon: BookOpen, label: 'Meine Kurse' },
        { to: '/participants', icon: Users, label: 'Teilnehmer' }
      );
    }

    if (isAdmin) {
      items.splice(-1, 0,
        { to: '/users', icon: UserCog, label: 'Benutzerverwaltung' },
        { to: '/settings', icon: Settings, label: 'Einstellungen' }
      );
    }

    return items;
  };

  const navItems = getNavItems();

  return (
    <div className="bg-white shadow-lg h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">YogaFlow</h1>
        <p className="text-sm text-gray-600 mt-1">
          {userProfile?.first_name} {userProfile?.last_name}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {userProfile?.roles?.map(role => (
            <span
              key={role}
              className={`inline-block px-2 py-1 text-xs rounded-full ${
                role === 'admin'
                  ? 'bg-red-100 text-red-800'
                  : role === 'course_leader'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}
            >
              {role === 'admin' ? 'Admin' :
               role === 'course_leader' ? 'Kursleiter' : 'Teilnehmer'}
            </span>
          ))}
        </div>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => `
                  flex items-center px-4 py-3 rounded-lg transition-colors
                  ${isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                  }
                `}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={signOut}
          className="flex items-center w-full px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Abmelden
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
