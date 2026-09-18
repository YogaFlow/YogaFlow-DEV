export type DemoView = 'owner' | 'guest';
export type DemoScreen = 'list' | 'detail';

export type DemoState = {
  view: DemoView;
  screen: DemoScreen;
  courseId: number | null;
  booked: Record<number, boolean>;
  waitlisted: Record<number, boolean>;
};

export type DemoCourse = {
  id: number;
  title: string;
  weekday: string;
  day: string;
  month: string;
  time: string;
  price: string;
  seats: number;
  taken: number;
  waitlist: number;
};
