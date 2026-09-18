import { Section } from '../ui/Section';

export function ClosingCta() {
  return (
    <Section background="bg-sage-50">
      <div className="max-w-3xl">
        <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-text sm:text-[2rem]">
          Schau es dir an, bevor du dich entscheidest.
        </h2>
        <p className="mt-6 text-[17px] leading-[1.45] text-text">
          Kein Verkaufsgespräch, kein Countdown. Richte dein Studio ein und probier es aus —
          oder schreib uns vorher.
        </p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
          <a
            href="/onboarding"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Studio einrichten
          </a>
          <a
            href="mailto:support@omlify.de"
            className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            support@omlify.de
          </a>
        </div>
      </div>
    </Section>
  );
}
