/**
 * Aktuelle Studio-Vorlagen-Version für Freigabe (pro Dokument).
 * Nicht STUDIO_LEGAL_TEMPLATE_VERSION — AGB und Datenschutz können auseinanderlaufen (BC-1).
 */
import { STUDIO_LEGAL_ACCEPTANCE_DOCS } from '../generated/studioLegalTemplates.ts';

export function studioLegalReleaseVersion(kind: 'terms' | 'privacy'): string {
  return STUDIO_LEGAL_ACCEPTANCE_DOCS[kind].version;
}
