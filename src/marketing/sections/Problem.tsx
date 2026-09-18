import { Section } from '../ui/Section';

export function Problem() {
  return (
    <Section background="bg-sage-50">
      <div className="max-w-3xl">
        <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-text sm:text-[2rem]">
          Sonntagabend, und du sortierst Anmeldungen.
        </h2>
        <div className="mt-10 space-y-8 text-[19px] leading-relaxed text-text sm:text-[22px] sm:leading-relaxed">
          <p>
            Anmeldungen kommen über WhatsApp, Instagram und E-Mail — die Liste führst du im
            Kopf.
          </p>
          <p>Wer bezahlt hat, weißt du erst, wenn du nachrechnest.</p>
          <p>Fällt eine Stunde aus, tippst du zwölf Nachrichten einzeln.</p>
        </div>
        <p className="mt-12 text-[17px] italic leading-[1.45] text-textMuted">
          Das ist keine Frage von Disziplin. Es ist ein Werkzeugproblem.
        </p>
      </div>
    </Section>
  );
}
