import type { ReactNode } from 'react';

type SectionTag = 'section' | 'header' | 'footer';
type SectionSpacing = 'header' | 'section' | 'footer' | 'hero';
type BlendColor = 'sand' | 'sage-50' | 'surface';

type SectionProps = {
  id?: string;
  as?: SectionTag;
  background: string;
  spacing?: SectionSpacing;
  blendTop?: BlendColor;
  blendBottom?: BlendColor;
  wide?: boolean;
  className?: string;
  children: ReactNode;
};

const SPACING: Record<SectionSpacing, string> = {
  header: 'pt-3 sm:pt-4',
  section: 'py-16 sm:py-24',
  footer: 'py-10 sm:py-12',
  hero: '',
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
  wide = false,
  className,
  children,
}: SectionProps) {
  const blends = Boolean(blendTop || blendBottom);
  const tagClass = [
    background,
    blends ? 'mkt-sec-blend' : '',
    blendTop ? BLEND_TOP[blendTop] : '',
    blendBottom ? BLEND_BOTTOM[blendBottom] : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const innerClass = [
    'mkt-sec-inner mx-auto px-4 sm:px-6',
    wide ? 'max-w-[1440px]' : 'max-w-[1360px]',
    SPACING[spacing],
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag id={id} className={tagClass}>
      <div className={innerClass}>{children}</div>
    </Tag>
  );
}
