import { buildInviteUrl, parseInviteToken, INVITE_URL_BASE } from './inviteLink';

describe('buildInviteUrl', () => {
  it('renders a token as a branded web-style URL', () => {
    expect(buildInviteUrl('tok-abc')).toBe(`${INVITE_URL_BASE}/tok-abc`);
  });
});

describe('parseInviteToken', () => {
  it('returns a bare token unchanged', () => {
    expect(parseInviteToken('tok-abc')).toBe('tok-abc');
  });

  it('trims surrounding whitespace', () => {
    expect(parseInviteToken('  tok-abc  ')).toBe('tok-abc');
  });

  it('extracts the token from a full invite URL', () => {
    expect(parseInviteToken('https://eazcommunity.app/join/tok-abc')).toBe('tok-abc');
  });

  it('handles a trailing slash and query string', () => {
    expect(parseInviteToken('https://eazcommunity.app/join/tok-abc/?ref=x')).toBe('tok-abc');
  });

  it('returns an empty string for empty input', () => {
    expect(parseInviteToken('   ')).toBe('');
  });
});
