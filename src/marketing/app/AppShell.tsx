import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { pageTitle, type AppRole } from './navigation';

type AppShellProps = {
  role: AppRole;
  path: string;
  unread?: number;
  onNavigate?: (path: string) => void;
  clickable?: readonly string[];
  sidebarAsContent?: boolean;
  children: ReactNode;
};

export function AppShell({
  role,
  path,
  unread = 0,
  onNavigate,
  clickable,
  sidebarAsContent = false,
  children,
}: AppShellProps) {
  return (
    <div className={`mkt-ap flex min-w-0 bg-sand${sidebarAsContent ? ' mkt-ap-role-focus' : ''}`}>
      <AppSidebar role={role} path={path} clickable={clickable} onNavigate={onNavigate} />
      <div className="mkt-ap-main flex min-w-0 flex-1 flex-col">
        <AppHeader title={pageTitle(path)} unread={unread} />
        <div className="mkt-ap-body flex-1 overflow-x-hidden overflow-y-auto bg-sand px-4 pb-14 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
