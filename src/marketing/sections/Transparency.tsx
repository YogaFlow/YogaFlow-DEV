import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const POINTS = [
  {
    title: 'Kein Preis, solange Omlify im Aufbau ist',
    body: 'Kommt einer, erfährst du ihn mindestens zwei Monate vorher und entscheidest dann neu.',
  },
  {
    title: 'Ohne Anteil an deinen Buchungen',
    body: 'Wir verdienen später an deinem Zugang zur Software, nicht an dem, was deine Teilnehmer bezahlen.',
  },
  {
    title: 'Deine Daten liegen in der EU',
    body: 'Server in Irland, nicht in den USA. Jedes Studio hat seine eigene, getrennte Umgebung.',
  },
  {
    title: 'Du kommst jederzeit wieder raus',
    body: 'Teilnehmer und Anmeldungen lädst du selbst als CSV-Datei herunter.',
  },
] as const;

export function Transparency() {
  return (
    <Section background="mkt-fir bg-sage-800">
      <Reveal>
        <div className="mkt-eyebrow">Preis</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Omlify ist im Aufbau. Deshalb kostet es gerade nichts.</h2>
      </Reveal>
      <Reveal className="mkt-zero">
        <div className="mkt-zero-big">0 €</div>
        <div className="mkt-zero-cap">
          pro Monat, für alle Kurse, alle Teilnehmer und so lange, bis wir dir etwas anderes sagen.
        </div>
      </Reveal>
      <div className="mkt-grid4 mkt-on-dark-line">
        {POINTS.map((point) => (
          <Reveal key={point.title} className="mkt-f4 mkt-on-dark-line">
            <b>{point.title}</b>
            <span>{point.body}</span>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
