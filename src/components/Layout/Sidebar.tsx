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
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner:   { label: 'Owner',     color: 'bg-purple-100 text-purple-800' },
  admin:   { label: 'Admin',     color: 'bg-red-100 text-red-800' },
  teacher: { label: 'Lehrer',    color: 'bg-blue-100 text-blue-800' },
  user:    { label: 'Teilnehmer', color: 'bg-green-100 text-green-800' },
};

const Sidebar: React.FC = () => {
  const { userProfile, signOut, isOwner, isAdmin, isCourseLeader } = useAuth();
  const { tenant } = useTenant();

  const getNavItems = () => {
    const items = [
      { to: '/dashboard',  icon: Home,          label: 'Übersicht' },
      { to: '/courses',    icon: Calendar,      label: 'Kurse' },
      { to: '/messages',   icon: MessageSquare, label: 'Nachrichten' },
      { to: '/profile',    icon: User,          label: 'Profil' },
    ];

    if (isCourseLeader) {
      items.splice(2, 0,
        { to: '/my-courses',   icon: BookOpen, label: 'Meine Kurse' },
        { to: '/participants', icon: Users,    label: 'Teilnehmer' },
      );
    }

    if (isAdmin) {
      items.splice(-1, 0,
        { to: '/settings', icon: Settings, label: 'Einstellungen' },
      );
    }

    if (isOwner) {
      items.splice(-1, 0,
        { to: '/users', icon: UserCog, label: 'Nutzerverwaltung' },
      );
    }

    return items;
  };

  const navItems = getNavItems();
  const roleInfo = userProfile?.role ? ROLE_LABELS[userProfile.role] : null;

  return (
    <div className="bg-white shadow-lg h-full flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">{tenant?.name ?? 'YogaFlow'}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {userProfile?.first_name} {userProfile?.last_name}
        </p>
        {roleInfo && (
          <span
            className={`inline-block mt-2 px-2 py-1 text-xs rounded-full ${roleInfo.color}`}
          >
            {roleInfo.label}
          </span>
        )}
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 rounded-lg transition-colors ${
                    isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
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
