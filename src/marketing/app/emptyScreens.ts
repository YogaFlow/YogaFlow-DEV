import { ClipboardCheck, MessageSquare, Settings, User, UserCog } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const EMPTY_SCREENS: Record<string, { icon: LucideIcon; title: string; text: string }> = {
  '/messages': {
    icon: MessageSquare,
    title: 'Nachrichten',
    text: 'In Omlify schreibst du hier direkt mit deinen Teilnehmern. In dieser Demo ist der Bereich leer.',
  },
  '/settings': {
    icon: Settings,
    title: 'Einstellungen',
    text: 'Studioname, Logo, Markenfarbe und Buchungsregeln. In dieser Demo nicht enthalten.',
  },
  '/users': {
    icon: UserCog,
    title: 'Nutzerverwaltung',
    text: 'Rollen vergeben und Zugänge verwalten. In dieser Demo nicht enthalten.',
  },
  '/profile': {
    icon: User,
    title: 'Profil',
    text: 'Deine eigenen Daten und Benachrichtigungen. In dieser Demo nicht enthalten.',
  },
};

export const OWNER_REGISTRATIONS_EMPTY = {
  icon: ClipboardCheck,
  title: 'Meine Anmeldungen',
  text: 'Kurse, für die du dich selbst angemeldet hast. In dieser Demo leer.',
} as const;
