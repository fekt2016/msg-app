import {
  Contact,
  ContactField,
  ContactsSortOrder,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-contacts';

export interface ContactPhone {
  id: string;
  name: string;
  number: string;
}

function normalizePhoneNumber(raw: string): string {
  let digits = raw.replace(/\D+/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    digits = `233${digits.slice(1)}`;
  }
  return digits;
}

export async function requestContactsPermission(): Promise<boolean> {
  const status = await getPermissionsAsync();
  if (status.granted) return true;
  if (status.canAskAgain) {
    const requested = await requestPermissionsAsync();
    return requested.granted;
  }
  return false;
}

export async function readContactPhones(): Promise<ContactPhone[]> {
  const details = await Contact.getAllDetails(
    [ContactField.GIVEN_NAME, ContactField.FAMILY_NAME, ContactField.PHONES],
    { sortOrder: ContactsSortOrder.GivenName },
  );

  const phones = new Map<string, ContactPhone>();
  for (const contact of details) {
    const name = [contact.givenName, contact.familyName]
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .trim();
    const numbers = (contact.phones ?? [])
      .map((p) => p?.number)
      .filter((n): n is string => typeof n === 'string' && normalizePhoneNumber(n).length > 0);

    for (const number of numbers) {
      const normalized = normalizePhoneNumber(number);
      const key = `${normalized}|${name}`;
      if (!phones.has(key)) {
        phones.set(key, { id: normalized, name: name || normalized, number });
      }
    }
  }

  return [...phones.values()];
}

export function extractPhoneNumbers(contacts: ContactPhone[]): string[] {
  return contacts.map((c) => c.number);
}
