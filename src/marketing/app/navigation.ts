import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Home,
  MessageSquare,
  Settings,
  User,
  UserCog,
  Users,
} from 'lucide-react';
import { titleForPath } from '../../lib/routeTitles';

export type AppRole = 'owner' | 'teacher' | 'user';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export const STUDIO_NAME = 'Yoga mit Mila';

export const ROLE_META: Record<AppRole, { name: string; label: string; pillClass: string }> = {
  owner: {
    name: 'Mila Vogt',
    label: 'Inhaberin/Inhaber',
    pillClass: 'bg-brand text-onBrand',
  },
  teacher: {
    name: 'Jana Ortmann',
    label: 'Kursleitung',
    pillClass: 'bg-brandSoft text-brandOnSoft',
  },
  user: {
    name: 'Anna Reuter',
    label: 'Teilnehmer',
    pillClass: 'bg-surfaceSunken text-textMuted',
  },
};

export const NAV_BY_ROLE: Record<AppRole, readonly NavItem[]> = {
  owner: [
    { to: '/dashboard', icon: Home, label: 'Übersicht' },
    { to: '/courses', icon: Calendar, label: 'Kurse' },
    { to: '/my-courses', icon: BookOpen, label: 'Kurse verwalten' },
    { to: '/my-registrations', icon: ClipboardCheck, label: 'Meine Anmeldungen' },
    { to: '/participants', icon: Users, label: 'Teilnehmer' },
    { to: '/messages', icon: MessageSquare, label: 'Nachrichten' },
    { to: '/settings', icon: Settings, label: 'Einstellungen' },
    { to: '/users', icon: UserCog, label: 'Nutzerverwaltung' },
    { to: '/profile', icon: User, label: 'Profil' },
  ],
  teacher: [
    { to: '/dashboard', icon: Home, label: 'Übersicht' },
    { to: '/courses', icon: Calendar, label: 'Kurse' },
    { to: '/my-courses', icon: BookOpen, label: 'Kurse verwalten' },
    { to: '/my-registrations', icon: ClipboardCheck, label: 'Meine Anmeldungen' },
    { to: '/participants', icon: Users, label: 'Teilnehmer' },
    { to: '/messages', icon: MessageSquare, label: 'Nachrichten' },
    { to: '/users', icon: UserCog, label: 'Nutzerverwaltung' },
    { to: '/profile', icon: User, label: 'Profil' },
  ],
  user: [
    { to: '/dashboard', icon: Home, label: 'Übersicht' },
    { to: '/courses', icon: Calendar, label: 'Kurse' },
    { to: '/my-registrations', icon: ClipboardCheck, label: 'Meine Anmeldungen' },
    { to: '/messages', icon: MessageSquare, label: 'Nachrichten' },
    { to: '/profile', icon: User, label: 'Profil' },
  ],
};

/** Kursdetail zählt als Kurse, Kursteilnehmer als Teilnehmer — wie in der App. */
export function navActivePath(path: string): string {
  if (path.startsWith('/course/') && path.endsWith('/participants')) return '/participants';
  if (path.startsWith('/course/')) return '/courses';
  return path;
}

export function pageTitle(path: string): string {
  return titleForPath(path) || 'Kurs';
}
