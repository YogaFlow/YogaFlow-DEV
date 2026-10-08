/** B2 / RT-2: aktuelle Rechtsdokument-Versionen (Build-Konstanten aus derselben MD-Quelle). */
import {
  GENERATED_AVV_CONTENT_HASH,
  GENERATED_AVV_VERSION,
  GENERATED_PRIVACY_CONTENT_HASH,
  GENERATED_PRIVACY_VERSION,
  GENERATED_TERMS_CONTENT_HASH,
  GENERATED_TERMS_VERSION,
} from '../generated/legalDocuments.ts';

export const AVV_VERSION = GENERATED_AVV_VERSION ?? '2026-10-04';

/** SHA-256 des normalisierten AVV-Markdown (Stand AVV_VERSION). */
export const AVV_CONTENT_HASH =
  GENERATED_AVV_CONTENT_HASH ??
  'b90051caf84bc2deb99535bff2218eec4067d61209ba70d5294c04c20cd5e1d3';

export const TERMS_VERSION = GENERATED_TERMS_VERSION ?? '2026-10-08';

export const TERMS_CONTENT_HASH =
  GENERATED_TERMS_CONTENT_HASH ??
  '4b9d13096b488d3d92142e58b041a2727ffc163c77449eff4912d23f6dc55f96';

export const PRIVACY_VERSION = GENERATED_PRIVACY_VERSION ?? '2026-10-08';

export const PRIVACY_CONTENT_HASH =
  GENERATED_PRIVACY_CONTENT_HASH ??
  '17cdc32a2d38d6871050a29354857c8e5d24a8e1cc80013e2f6012b57f2f352d';

export const AVV_ATTENTION =
  'Bitte bestätige den Vertrag zur Auftragsverarbeitung.';

export const TERMS_ATTENTION = 'Bitte bestätige die aktualisierten AGB.';

export const CONTRACT_UPDATE_ATTENTION =
  'Aktualisierte Vertragsunterlagen';

export const AVV_ACCEPT_LABEL = 'AVV abschließen';

export const TERMS_ACCEPT_LABEL = 'AGB zustimmen';

export const CONTRACT_ACCEPT_LABEL = 'Zustimmen';

export const AVV_CHECKBOX_LABEL =
  'Ich schließe den Vertrag zur Auftragsverarbeitung ab';
