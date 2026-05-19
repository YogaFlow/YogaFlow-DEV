import type { User } from '../types';

type AddressFields = Pick<User, 'street' | 'house_number' | 'postal_code' | 'city'>;

/** Formatiert Straße und PLZ/Ort; null wenn keine Adressdaten vorhanden. */
export function formatUserAddress(user: AddressFields): string | null {
  const streetLine = [user.street, user.house_number].filter(Boolean).join(' ');
  const cityLine = [user.postal_code, user.city].filter(Boolean).join(' ');
  const parts = [streetLine, cityLine].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}
