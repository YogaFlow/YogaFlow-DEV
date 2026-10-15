/** Omlify-Neuigkeiten für Owner/Admin („Neu für dich"). Gehen mit dem Deploy live. */

export type UpdateShowIf = 'always' | 'onlinePaymentsActive' | 'hasPassProducts';

export type StudioUpdateCta = {
  label: string;
  path: string;
};

export type StudioUpdateParticipantMessage = {
  title: string;
  body: string;
  /** Letzter Satz nur anhängen, wenn vor Ort (Bar) aktiv ist. */
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
      title: 'Neu bei {studio}: online bezahlen',
      body:
        'Ab sofort kannst du deine Kurse bei {studio} direkt bei der Buchung online bezahlen — mit Karte, Apple Pay oder Google Pay.',
      onsiteSuffix: ' Bar vor Ort geht natürlich weiterhin.',
    },
  },
];
