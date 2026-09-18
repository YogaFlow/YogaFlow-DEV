import { Bell, Menu } from 'lucide-react';

type AppHeaderProps = {
  title: string;
  unread?: number;
};

export function AppHeader({ title, unread = 0 }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-2.5 border-b border-border bg-surface px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          className="mkt-ap-burger rounded-sm p-2 text-text"
          aria-label="Menü"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="truncate text-lg font-medium text-text">{title}</h1>
      </div>
      <button
        type="button"
        className="relative rounded-full p-2 text-textMuted"
        aria-label={unread > 0 ? `Benachrichtigungen, ${unread} ungelesen` : 'Benachrichtigungen'}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-danger px-[3px] text-[10px] font-bold leading-none text-onBrand tabular-nums"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>
    </header>
  );
}
