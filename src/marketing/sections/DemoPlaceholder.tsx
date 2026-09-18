import { Section } from '../ui/Section';

export function DemoPlaceholder() {
  return (
    <Section id="demo" background="bg-sand">
      <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-text sm:text-[2rem]">
        Sieh es dir an. Von beiden Seiten.
      </h2>
      <div className="mt-8 flex h-[520px] items-center justify-center rounded-lg border border-border bg-surface">
        <p className="px-4 text-center text-[17px] text-textSubtle">Interaktive Vorschau folgt</p>
      </div>
    </Section>
  );
}
