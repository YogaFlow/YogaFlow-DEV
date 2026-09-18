import type { ReactNode } from 'react';

type SectionTag = 'section' | 'header' | 'footer';
type SectionSpacing = 'header' | 'section' | 'footer';

type SectionProps = {
  id?: string;
  as?: SectionTag;
  background: string;
  spacing?: SectionSpacing;
  children: ReactNode;
};

const SPACING: Record<SectionSpacing, string> = {
  header: 'py-3 sm:py-4',
  section: 'py-16 sm:py-24',
  footer: 'py-10 sm:py-12',
};

export function Section({
  id,
  as: Tag = 'section',
  background,
  spacing = 'section',
  children,
}: SectionProps) {
  return (
    <Tag id={id} className={background}>
      <div className={`mx-auto max-w-[1120px] px-4 sm:px-6 ${SPACING[spacing]}`}>
        {children}
      </div>
    </Tag>
  );
}
