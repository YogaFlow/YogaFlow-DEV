export type DemoView = 'owner' | 'guest';

export type DemoState = {
  view: DemoView;
  path: string;
  courseId: number | null;
  booked: Record<number, boolean>;
  waitlisted: Record<number, boolean>;
};

export type DemoCourse = {
  id: number;
  title: string;
  dayLabel: string;
  dateLine: string;
  weekday: string;
  day: string;
  month: string;
  time: string;
  end: string;
  duration: string;
  price: string;
  max: number;
  registered: number;
  waitlist: number;
  teacher: string;
  location: string;
  description: string;
};
