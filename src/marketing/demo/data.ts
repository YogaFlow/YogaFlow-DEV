import type { DemoCourse } from './types';

export const DEMO_COURSES: readonly DemoCourse[] = [
  {
    id: 1,
    title: 'Vinyasa Flow · Mittelstufe',
    weekday: 'Do',
    day: '18',
    month: 'Sep',
    time: '18:30 bis 19:45',
    price: '18 €',
    seats: 12,
    taken: 12,
    waitlist: 2,
  },
  {
    id: 2,
    title: 'Hatha für Einsteiger',
    weekday: 'Sa',
    day: '20',
    month: 'Sep',
    time: '10:00 bis 11:15',
    price: '15 €',
    seats: 10,
    taken: 8,
    waitlist: 0,
  },
  {
    id: 3,
    title: 'Yin Yoga am Abend',
    weekday: 'Di',
    day: '23',
    month: 'Sep',
    time: '19:00 bis 20:15',
    price: '18 €',
    seats: 14,
    taken: 5,
    waitlist: 0,
  },
];

export const DEMO_PARTICIPANTS: Readonly<Record<number, readonly string[]>> = {
  1: [
    'Anna Reuter',
    'Lena Brandt',
    'Sophie Wald',
    'Jana Ortmann',
    'Mira Kellner',
    'Tim Faber',
    'Nele Kurz',
    'Paul Sieber',
    'Ida Rohde',
    'Ben Marquardt',
    'Lisa Thönnes',
    'Kira Vogt',
  ],
  2: [
    'Anna Reuter',
    'Jana Ortmann',
    'Nele Kurz',
    'Paul Sieber',
    'Ida Rohde',
    'Ben Marquardt',
    'Lisa Thönnes',
    'Kira Vogt',
  ],
  3: ['Lena Brandt', 'Sophie Wald', 'Tim Faber', 'Mira Kellner', 'Ida Rohde'],
};

export const OWNER_NAV: readonly { label: string; current: boolean }[] = [
  { label: 'Übersicht', current: false },
  { label: 'Kurse', current: true },
  { label: 'Teilnehmer', current: false },
  { label: 'Trainer', current: false },
  { label: 'Nachrichten', current: false },
  { label: 'Einstellungen', current: false },
];

export function courseById(id: number): DemoCourse | undefined {
  return DEMO_COURSES.find((course) => course.id === id);
}

export function occupancy(course: DemoCourse, booked: Record<number, boolean>) {
  const taken = course.taken + (booked[course.id] ? 1 : 0);
  return { taken, free: course.seats - taken };
}

export function freeSeatsLabel(free: number): string {
  return free === 1 ? 'noch 1 Platz' : `noch ${free} Plätze`;
}

export function listStatusLabel(course: DemoCourse, free: number): string | null {
  if (free <= 0) {
    return course.waitlist ? `Ausgebucht · ${course.waitlist} auf Warteliste` : 'Ausgebucht';
  }
  if (free <= 3) return freeSeatsLabel(free);
  return null;
}

export function waitlistPosition(course: DemoCourse): number {
  return course.waitlist + 1;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2);
}
