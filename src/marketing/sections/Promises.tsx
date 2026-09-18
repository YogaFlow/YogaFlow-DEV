import { Section } from '../ui/Section';

const PROMISES = [
  {
    title: 'Deine eigene Buchungsseite',
    body: 'deinstudio.omlify.de, dein Logo, deine Farbe. Deine Teilnehmer buchen bei dir — nicht auf einem Portal, das ihnen nebenbei drei andere Studios vorschlägt.',
  },
  {
    title: 'Kurse und Wartelisten, die sich selbst sortieren',
    body: 'Einzeltermine oder ganze Serien in Minuten angelegt. Wird ein Platz frei, rückt die Warteliste nach und deine Teilnehmerin erfährt es — ohne dass du eine Nachricht tippst.',
  },
  {
    title: 'Allein oder im Team',
    body: 'Als selbstständige Lehrerin brauchst du nichts außer dir. Kommen Trainerinnen dazu, bekommen sie eigene Zugänge und sehen genau das, was sie brauchen.',
  },
] as const;

export function Promises() {
  return (
    <Section background="bg-surface">
      <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-text sm:text-[2rem]">
        Was du damit bekommst
      </h2>
      <div className="mt-8 divide-y divide-border rounded-md border border-border bg-surface">
        {PROMISES.map((item) => (
          <div key={item.title} className="px-5 py-6 sm:px-8 sm:py-8">
            <h3 className="font-display text-[19px] font-semibold leading-snug text-text sm:text-[22px]">
              {item.title}
            </h3>
            <p className="mt-3 max-w-3xl text-[17px] leading-[1.45] text-text">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
