/** Pfad -> Seitentitel für den Kopfbereich.
 *  Rein und ohne React: nimmt einen pathname, gibt einen Titel. */

const TITLES: Record<string, string | undefined> = {
  '/dashboard': 'Übersicht',
  '/courses': 'Kurse',
  '/my-courses': 'Kurse verwalten',
  '/my-registrations': 'Meine Anmeldungen',
  '/participants': 'Teilnehmer',
  '/messages': 'Nachrichten',
  '/profile': 'Profil',
  '/users': 'Nutzerverwaltung',
  '/settings': 'Einstellungen',
  '/create-course': 'Neuer Kurs',
};

function withoutTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** `/course/:id/edit` bzw. `/course/:id/participants` ohne Regex: ein Segment in der Mitte. */
function courseSegmentTitle(pathname: string): string {
  const prefix = '/course/';
  if (!pathname.startsWith(prefix)) return '';

  const rest = pathname.slice(prefix.length);
  const editSuffix = '/edit';
  if (rest.endsWith(editSuffix)) {
    const id = rest.slice(0, rest.length - editSuffix.length);
    return id.length > 0 && !id.includes('/') ? 'Kurs bearbeiten' : '';
  }

  const participantsSuffix = '/participants';
  if (rest.endsWith(participantsSuffix)) {
    const id = rest.slice(0, rest.length - participantsSuffix.length);
    return id.length > 0 && !id.includes('/') ? 'Teilnehmer' : '';
  }

  return '';
}

export function titleForPath(pathname: string): string {
  const path = withoutTrailingSlash(pathname);
  return TITLES[path] ?? courseSegmentTitle(path);
}
