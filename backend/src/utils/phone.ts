export function normalizePhoneNumber(raw: string): string {
  let digits = raw.replace(/\D+/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    digits = `233${digits.slice(1)}`;
  }
  return digits;
}
