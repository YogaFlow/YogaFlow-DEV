import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const FAQ_ITEMS = [
  {
    question: 'Was kostet Omlify?',
    answer:
      'Aktuell nichts. Omlify ist im Aufbau, und solange das so ist, zahlst du nichts. Wenn ein Preis kommt, erfährst du ihn mindestens zwei Monate vorher.',
  },
  {
    question: 'Nimmt Omlify eine Provision auf meine Buchungen?',
    answer:
      'Nein, es gibt kein Provisionsmodell. Omlify verdient später an deinem Zugang zur Software, nicht an dem, was deine Teilnehmer bezahlen. Sobald es Online-Zahlungen gibt, fallen die Gebühren deines Zahlungsanbieters an — die gehen an ihn, nicht an uns.',
  },
  {
    question: 'Wo liegen meine Daten, und ist das DSGVO-konform?',
    answer:
      'Deine Daten liegen in der EU, konkret in Irland. Jedes Studio hat seine eigene, getrennte Umgebung — kein Studio kann die Daten eines anderen sehen.',
  },
  {
    question: 'Brauche ich technische Kenntnisse?',
    answer:
      'Nein. Du legst dein Studio an, wählst einen Namen für deine Adresse und lädst dein Logo hoch. Alles Weitere sind Kurse, Termine und Teilnehmer.',
  },
  {
    question: 'Kann ich von Eversports oder Momoyoga wechseln?',
    answer:
      'Einen automatischen Import gibt es noch nicht. Schreib uns, wenn du wechseln willst — bei den ersten Studios machen wir den Umzug persönlich mit dir.',
  },
  {
    question: 'Können meine Teilnehmerinnen online bezahlen?',
    answer:
      'Noch nicht. Online-Zahlungen sind das, woran wir gerade arbeiten. Heute rechnest du ab wie bisher, Omlify zeigt dir zuverlässig, wer angemeldet ist.',
  },
  {
    question: 'Lohnt sich das, wenn ich nur zwei Kurse pro Woche gebe?',
    answer:
      'Ja. Omlify ist für selbstständige Lehrerinnen genauso gebaut wie für Studios. Du siehst nur das, was du brauchst.',
  },
  {
    question: 'Was passiert mit meinen Daten, wenn ich aufhöre?',
    answer:
      'Deine Teilnehmerliste mit allen Anmeldungen lädst du jederzeit selbst als CSV-Datei herunter. Für alles Weitere schreib uns — du bekommst deine Daten und wir löschen sie.',
  },
  {
    question: 'Wer steckt hinter Omlify?',
    answer:
      'Hinter Omlify stehen zwei Leute: Julius entwickelt das Produkt, André begleitet es beratend. Wir bauen Omlify mit den Studios, die es benutzen — bei jeder Frage erreichst du uns direkt unter support@omlify.de, kein Ticketsystem.',
  },
] as const;

export function Faq() {
  return (
    <Section background="bg-sand">
      <Reveal>
        <div className="mkt-eyebrow">Fragen</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Was du vermutlich wissen willst.</h2>
      </Reveal>
      <Reveal className="mkt-faq">
        {FAQ_ITEMS.map((item, index) => (
          <details key={item.question} className="mkt-qa">
            <summary>
              <span className="mkt-qn">{String(index + 1).padStart(2, '0')}</span>
              <span className="mkt-qt">{item.question}</span>
              <span className="mkt-sign" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="mkt-ans">{item.answer}</p>
          </details>
        ))}
      </Reveal>
    </Section>
  );
}
