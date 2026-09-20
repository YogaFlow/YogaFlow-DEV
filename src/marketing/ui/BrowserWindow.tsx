import type { CSSProperties, ReactNode } from 'react';

type BrowserWindowProps = {
  url: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function BrowserWindow({ url, children, className, style }: BrowserWindowProps) {
  return (
    <div className={['mkt-win', className].filter(Boolean).join(' ')} style={style}>
      <div className="mkt-tb">
        <i />
        <i />
        <i />
        <span className="mkt-url">{url}</span>
      </div>
      {children}
    </div>
  );
}
