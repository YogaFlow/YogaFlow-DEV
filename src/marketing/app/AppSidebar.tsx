import { LogOut } from 'lucide-react';
import { NAV_BY_ROLE, ROLE_META, STUDIO_NAME, navActivePath, type AppRole } from './navigation';

function StudioHeart() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

type AppSidebarProps = {
  role: AppRole;
  path: string;
  clickable?: readonly string[];
  onNavigate?: (path: string) => void;
};

export function AppSidebar({ role, path, clickable, onNavigate }: AppSidebarProps) {
  const meta = ROLE_META[role];
  const active = navActivePath(path);
  const items = NAV_BY_ROLE[role];

  return (
    <div className="mkt-ap-side flex shrink-0 flex-col bg-surface shadow-lg">
      <div className="border-b border-border px-4 pb-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-onBrand">
            <StudioHeart />
          </span>
          <span className="text-[15px] font-medium leading-tight text-text">{STUDIO_NAME}</span>
        </div>
        <p className="mt-1.5 text-[13px] text-textMuted">{meta.name}</p>
        <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs ${meta.pillClass}`}>
          {meta.label}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => {
            const isActive = item.to === active;
            const canGo = Boolean(onNavigate && clickable?.includes(item.to));
            const className = `flex w-full items-center rounded-sm px-4 py-3 text-left text-[15px] whitespace-nowrap ${
              isActive ? 'bg-brand text-onBrand' : 'text-textMuted'
            } ${canGo ? 'cursor-pointer' : 'cursor-default'}`;
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="mr-3 h-5 w-5 shrink-0" aria-hidden />
                {item.label}
              </>
            );
            return (
              <li key={item.to}>
                {canGo ? (
                  <button type="button" className={className} onClick={() => onNavigate?.(item.to)}>
                    {content}
                  </button>
                ) : (
                  <span className={className}>{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <span className="flex cursor-default items-center rounded-sm px-4 py-3 text-[15px] text-textMuted">
          <LogOut className="mr-3 h-5 w-5 shrink-0" aria-hidden />
          Abmelden
        </span>
      </div>
    </div>
  );
}
