/**
 * Invite links are shown and shared as a branded web-style URL rather than a
 * bare token, e.g. `https://eazcommunity.app/join/<token>`. There is no public
 * web host wired up yet, so the URL is a shareable display form; the app still
 * joins with the token alone. `parseInviteToken` accepts either the full URL or
 * a raw token so a user can paste whichever they were given.
 */
export const INVITE_URL_BASE = 'https://eazcommunity.app/join';

export function buildInviteUrl(token: string): string {
  return `${INVITE_URL_BASE}/${token}`;
}

/**
 * Extracts the invite token from user input. Handles a full invite URL (with or
 * without a trailing slash or query string) and a bare token pasted on its own.
 */
export function parseInviteToken(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('/')) {
    const withoutQuery = trimmed.split(/[?#]/)[0];
    const lastSegment = withoutQuery.replace(/\/+$/, '').split('/').pop();
    return lastSegment ?? '';
  }
  return trimmed;
}
