import { Section } from '../ui/Section';

const POINTS = [
  {
    lead: 'Kein Preis, solange Omlify im Aufbau ist.',
    rest: 'Kommt einer, erfährst du ihn mindestens zwei Monate vorher und entscheidest dann neu.',
  },
  {
    lead: 'Ohne Anteil an deinen Buchungen.',
    rest: 'Wir verdienen später an deinem Zugang zur Software, nicht an dem, was deine Teilnehmer bezahlen.',
  },
  {
    lead: 'Deine Daten liegen in der EU.',
    rest: 'Server in Irland, nicht in den USA.',
  },
  {
    lead: 'Du kommst jederzeit wieder raus.',
    rest: 'Teilnehmer und Anmeldungen lädst du selbst als CSV-Datei herunter.',
  },
] as const;

export function Transparency() {
  return (
    <Section background="bg-sage-800">
      <div className="max-w-3xl text-onBrand">
        <h2 className="font-display text-[1.75rem] font-semibold leading-tight sm:text-[2rem]">
          Omlify ist im Aufbau. Deshalb kostet es gerade nichts.
        </h2>
        <p className="mt-6 text-[17px] leading-[1.45]">
          Wir bauen Omlify zusammen mit den ersten Studios. Solange das so ist, zahlst du
          nichts — kein Testzeitraum, der abläuft, keine Kreditkarte, keine automatische
          Verlängerung in irgendetwas.
        </p>
        <ul className="mt-10 space-y-6 text-[17px] leading-[1.45]">
          {POINTS.map((point) => (
            <li key={point.lead}>
              <span className="font-semibold">{point.lead}</span> {point.rest}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
