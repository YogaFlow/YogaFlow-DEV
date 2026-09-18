import { Reveal } from '../ui/Reveal';
import { Section } from '../ui/Section';

const STEPS = [
  {
    n: 'Schritt 1',
    title: 'Studio anlegen',
    body: 'Name, Adresse, Logo. Deine Farbe wählst du aus neun Vorlagen.',
    fields: [
      { label: 'Studioname', value: 'Yoga mit Mila' },
      { label: 'Adresse', value: 'yomita.omlify.de' },
    ],
    barsOn: 1,
  },
  {
    n: 'Schritt 2',
    title: 'Ersten Kurs eintragen',
    body: 'Einzeltermin oder Serie, Plätze, Preis. Der Rest läuft von allein.',
    fields: [
      { label: 'Kurs', value: 'Vinyasa Flow' },
      { label: 'Donnerstag', value: '18:30 · 12 Plätze' },
    ],
    barsOn: 2,
  },
  {
    n: 'Schritt 3',
    title: 'Link teilen',
    body: 'In deine Instagram-Bio, in den Newsletter, in die WhatsApp-Gruppe. Fertig.',
    fields: [
      { label: 'Teilen', value: 'yomita.omlify.de' },
      { label: 'Deine Teilnehmer', value: 'buchen selbst' },
    ],
    barsOn: 3,
  },
] as const;

export function Setup() {
  return (
    <Section background="bg-surface" blendTop="sand" blendBottom="sand">
      <Reveal>
        <div className="mkt-eyebrow">So fängst du an</div>
      </Reveal>
      <Reveal>
        <h2 className="mkt-display">Drei Schritte. Keine Einrichtungsgebühr, kein Termin.</h2>
      </Reveal>
      <div className="mkt-steps">
        {STEPS.map((step) => (
          <Reveal key={step.n} className="mkt-step">
            <span className="n">{step.n}</span>
            <h4>{step.title}</h4>
            <p>{step.body}</p>
            <div className="mkt-mini">
              {step.fields.map((field) => (
                <div key={field.label} className="mkt-field">
                  <span>{field.label}</span>
                  <b>{field.value}</b>
                </div>
              ))}
              <div className="mkt-bars">
                <i className={step.barsOn >= 1 ? 'on' : undefined} />
                <i className={step.barsOn >= 2 ? 'on' : undefined} />
                <i className={step.barsOn >= 3 ? 'on' : undefined} />
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
