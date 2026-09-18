import { Section } from '../ui/Section';

export function Hero() {
  return (
    <Section background="bg-sand">
      <div className="max-w-3xl">
        <h1 className="font-display text-[2rem] font-semibold leading-[1.2] text-text sm:text-5xl sm:leading-tight">
          Deine Kurse. Deine Buchungsseite.{' '}
          <span className="text-brand">Deine Kunden.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-[17px] leading-[1.45] text-text">
          Omlify ist die Kurs- und Buchungsverwaltung für Yoga-Studios und selbstständige
          Yogalehrer in Deutschland. Unter deiner eigenen Adresse, mit deinem Logo — und
          ohne dass wir an deinen Buchungen mitverdienen.
        </p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
          <a
            href="#demo"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Omlify ansehen
          </a>
          <a
            href="/onboarding"
            className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Oder direkt loslegen: Studio einrichten
          </a>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-textMuted tabular-nums">
          Aktuell kostenlos · Keine Kreditkarte · In 5 Minuten eingerichtet
        </p>
      </div>
    </Section>
  );
}
