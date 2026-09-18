import type { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export function EmptyState({ icon: Icon, title, text }: EmptyStateProps) {
  return (
    <div className="mkt-empty">
      <Icon className="mx-auto h-[52px] w-[52px] text-textSubtle" aria-hidden />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
