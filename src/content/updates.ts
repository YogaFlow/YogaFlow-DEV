/** Omlify-Neuigkeiten für Owner/Admin („Neu für dich"). Gehen mit dem Deploy live. */

export type UpdateShowIf = 'always' | 'onlinePaymentsActive' | 'hasPassProducts';

export type StudioUpdateCta = {
  label: string;
  path: string;
};

export type StudioUpdateParticipantMessage = {
  title: string;
  body: string;
  /**
   * Absatz nur, wenn vor Ort (Bar) aktiv ist.
   * Steht `{onsite}` im Text, wird er dort eingesetzt. Sonst ans Ende angehängt.
   */
  onsiteSuffix?: string;
};

export type StudioUpdate = {
  id: string;
  date: string;
  title: string;
  body: string;
  cta?: StudioUpdateCta;
  showIf: UpdateShowIf;
  participantMessage?: StudioUpdateParticipantMessage;
  /**
   * Teilnehmer-Nachricht nur anbieten, wenn diese Bedingung gilt.
   * Sonst Hinweis (z. B. zuerst Kurskarte anlegen).
   */
  participantMessageIf?: 'hasPassProducts';
};

export const STUDIO_UPDATES: readonly StudioUpdate[] = [
  {
    id: '2026-10-zahlungen-im-blick',
    date: '2026-10-15',
    title: 'Zahlungen im Blick',
    body:
      'In der Teilnehmerliste siehst du jetzt bei jeder Anmeldung, ob sie bezahlt ist. Mit „Bar erhalten" hakst du Zahlungen vor Ort ab. Unter „Zu erledigen" auf der Übersicht findest du, was noch offen ist — und frühere Kurse kannst du auf einmal als erledigt markieren.',
    cta: { label: 'Zur Übersicht', path: '/dashboard' },
    showIf: 'always',
  },
  {
    id: '2026-10-kurskarten-verkaufen',
    date: '2026-10-15',
    title: 'Kurskarten verkaufen',
    body:
      'Du kannst jetzt Kurskarten anlegen, z. B. eine 10er-Karte, und sie im Studio verkaufen. Omlify zählt die Termine automatisch mit.',
    cta: { label: 'Kurskarte anlegen', path: '/settings/karten' },
    showIf: 'always',
    participantMessageIf: 'hasPassProducts',
    participantMessage: {
      title: 'Neu bei {studio}: Kurskarten',
      body:
        'Bei uns gibt es jetzt Kurskarten. Sprich uns beim nächsten Kurs an — wir zeigen dir gern die Möglichkeiten.',
    },
  },
  {
    id: '2026-10-rechtstexte',
    date: '2026-10-15',
    title: 'Deine Rechtstexte',
    body:
      'Omlify erstellt dir Impressum, AGB und Datenschutzerklärung aus deinen Angaben. Prüfe sie unter Einstellungen › Rechtliches und gib sie frei.',
    cta: { label: 'Zu Rechtliches', path: '/settings/rechtliches' },
    showIf: 'always',
  },
  {
    id: '2026-10-online-bezahlen',
    date: '2026-10-15',
    title: 'Online bezahlen',
    body:
      'Deine Teilnehmenden können jetzt direkt bei der Buchung online bezahlen — mit Karte, Apple Pay oder Google Pay. Sag ihnen Bescheid!',
    showIf: 'onlinePaymentsActive',
    participantMessage: {
      title: 'Neu bei {studio}: Du kannst jetzt online bezahlen',
      body:
        'Hallo du,\n\n' +
        'ich hab eine Neuigkeit für dich: Ab sofort kannst du deine Stunden bei {studio} direkt beim Buchen in der App bezahlen, ganz einfach mit Apple Pay, Google Pay oder Kreditkarte. Dann musst du vor der Stunde an nichts mehr denken, kommst einfach an und rollst deine Matte aus.\n\n' +
        '{onsite}' +
        'Die Zahlung läuft sicher über Stripe. Und falls dir mal etwas dazwischenkommt und du rechtzeitig absagst, bekommst du dein Geld automatisch zurück.\n\n' +
        'Probier es gern aus, und wenn irgendwas hakt oder du eine Idee hast, sag mir einfach Bescheid. Ich freu mich, dich bald wieder auf der Matte zu sehen!',
      onsiteSuffix:
        'Und keine Sorge: Wenn du lieber wie bisher vor Ort zahlst, ist das natürlich völlig in Ordnung. Du kannst bei jeder Buchung selbst entscheiden.\n\n',
    },
  },
];
