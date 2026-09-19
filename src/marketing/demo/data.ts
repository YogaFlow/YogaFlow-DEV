import type { AppRole } from '../app/navigation';
import type { DemoCourse } from './types';

export const DEMO_COURSES: readonly DemoCourse[] = [
  {
    id: 1,
    title: 'Vinyasa Flow · Mittelstufe',
    dayLabel: 'Do, 18. Sep',
    dateLine: 'Donnerstag, 18. September',
    weekday: 'Do',
    day: '18',
    month: 'Sep',
    time: '18:30',
    end: '19:45',
    duration: '1 Std. 15 Min.',
    price: '18 €',
    max: 12,
    registered: 12,
    waitlist: 2,
    teacher: 'Mila Vogt',
    location: 'Studio Neuss · Raum 1',
    description:
      'Fließende Übergänge im ruhigen Tempo. Wir arbeiten mit dem Atem und bauen die Sequenz über die Stunde auf.',
  },
  {
    id: 2,
    title: 'Hatha für Einsteiger',
    dayLabel: 'Sa, 20. Sep',
    dateLine: 'Samstag, 20. September',
    weekday: 'Sa',
    day: '20',
    month: 'Sep',
    time: '10:00',
    end: '11:15',
    duration: '1 Std. 15 Min.',
    price: '15 €',
    max: 10,
    registered: 8,
    waitlist: 0,
    teacher: 'Mila Vogt',
    location: 'Studio Neuss · Raum 1',
    description:
      'Ruhige Haltungen, lange gehalten. Für alle, die neu anfangen oder nach einer Pause zurückkommen.',
  },
  {
    id: 3,
    title: 'Yin Yoga am Abend',
    dayLabel: 'Di, 23. Sep',
    dateLine: 'Dienstag, 23. September',
    weekday: 'Di',
    day: '23',
    month: 'Sep',
    time: '19:00',
    end: '20:15',
    duration: '1 Std. 15 Min.',
    price: '18 €',
    max: 14,
    registered: 5,
    waitlist: 0,
    teacher: 'Jana Ortmann',
    location: 'Studio Neuss · Raum 2',
    description: 'Passive Haltungen, drei bis fünf Minuten gehalten. Bring dir gern eine Decke mit.',
  },
];

export const DEMO_PARTICIPANTS: Readonly<Record<number, readonly string[]>> = {
  1: [
    'Anna Reuter',
    'Lena Brandt',
    'Sophie Wald',
    'Jana Ortmann',
    'Tim Faber',
    'Nele Kurz',
    'Paul Sieber',
    'Ida Rohde',
    'Ben Marquardt',
    'Lisa Thönnes',
    'Kira Vogt',
    'Ella Sander',
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

export const DEMO_WAITING: Readonly<Record<number, readonly string[]>> = {
  1: ['Mira Kellner', 'Ella Sander'],
  2: [],
  3: [],
};

export function courseById(id: number): DemoCourse | undefined {
  return DEMO_COURSES.find((course) => course.id === id);
}

export function occupancy(
  course: DemoCourse,
  booked: Record<number, boolean>,
  takenOverride?: number,
) {
  const taken = takenOverride ?? (course.registered + (booked[course.id] ? 1 : 0));
  return { taken, remaining: course.max - taken };
}

export function waitlistPositionFor(course: DemoCourse): number {
  return course.waitlist + 1;
}

export function isOwnCourse(course: DemoCourse, role: AppRole): boolean {
  if (role === 'owner') return course.teacher === 'Mila Vogt';
  if (role === 'teacher') return course.teacher === 'Jana Ortmann';
  return false;
}

export const DEMO_STUDIO_PEOPLE: readonly string[] = [
  'Anna Reuter',
  'Lena Brandt',
  'Sophie Wald',
  'Jana Ortmann',
  'Tim Faber',
  'Nele Kurz',
  'Paul Sieber',
  'Ida Rohde',
  'Ben Marquardt',
  'Lisa Thönnes',
  'Kira Vogt',
  'Mira Kellner',
];

export const LIST_ROW_LIMIT = 6;

export function withMore<T>(items: readonly T[], max = LIST_ROW_LIMIT): { shown: T[]; rest: number } {
  if (items.length <= max) return { shown: items.slice(), rest: 0 };
  return { shown: items.slice(0, max), rest: items.length - max };
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2);
}

export function courseMeta(course: DemoCourse): string {
  const place = course.location.split(' · ')[0];
  return [`bis ${course.end}`, course.teacher, place].filter(Boolean).join(' · ');
}
