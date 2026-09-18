import type { ReactNode } from 'react';

type SectionTag = 'section' | 'header' | 'footer';
type SectionSpacing = 'header' | 'section' | 'footer';
type BlendColor = 'sand' | 'sage-50' | 'surface';

type SectionProps = {
  id?: string;
  as?: SectionTag;
  background: string;
  spacing?: SectionSpacing;
  blendTop?: BlendColor;
  blendBottom?: BlendColor;
  children: ReactNode;
};

const SPACING: Record<SectionSpacing, string> = {
  header: 'py-3 sm:py-4',
  section: 'py-16 sm:py-24',
  footer: 'py-10 sm:py-12',
};

const BLEND_TOP: Record<BlendColor, string> = {
  sand: 'mkt-bt-sand',
  'sage-50': 'mkt-bt-sage-50',
  surface: 'mkt-bt-surface',
};

const BLEND_BOTTOM: Record<BlendColor, string> = {
  sand: 'mkt-bb-sand',
  'sage-50': 'mkt-bb-sage-50',
  surface: 'mkt-bb-surface',
};

export function Section({
  id,
  as: Tag = 'section',
  background,
  spacing = 'section',
  blendTop,
  blendBottom,
  children,
}: SectionProps) {
  const blends = Boolean(blendTop || blendBottom);
  const className = [
    background,
    blends ? 'mkt-sec-blend' : '',
    blendTop ? BLEND_TOP[blendTop] : '',
    blendBottom ? BLEND_BOTTOM[blendBottom] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag id={id} className={className}>
      <div className={`mkt-sec-inner mx-auto max-w-[1120px] px-4 sm:px-6 ${SPACING[spacing]}`}>
        {children}
      </div>
    </Tag>
  );
}
