import React from 'react';

interface AccentPillProps {
  children: React.ReactNode;
  className?: string;
}

const AccentPill: React.FC<AccentPillProps> = ({ children, className }) => (
  <span
    className={`inline-flex rounded-full bg-accentSoft px-2.5 py-0.5 text-[13px] font-medium text-accentText whitespace-nowrap${className ? ` ${className}` : ''}`}
  >
    {children}
  </span>
);

export default AccentPill;
