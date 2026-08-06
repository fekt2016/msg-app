import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as recoverySession from '../e2ee/recoverySession';
import { RecoveryKeySetupScreen } from './RecoveryKeySetupScreen';

// Self-contained factory (CLAUDE.md §10). NoLocalIdentityError is a real class
// so the screen's instanceof check behaves.
jest.mock('../e2ee/recoverySession', () => ({
  newRecoveryPhrase: jest.fn(),
  enableRecoveryBackup: jest.fn(),
  disableRecoveryBackup: jest.fn(),
  getRecoveryBackupStatus: jest.fn(),
  NoLocalIdentityError: class NoLocalIdentityError extends Error {},
}));

const mockSession = recoverySession as jest.Mocked<typeof recoverySession>;

const PHRASE =
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima ' +
  'mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray';

async function renderScreen(navigation: { goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <RecoveryKeySetupScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('RecoveryKeySetupScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('generates a phrase, requires confirmation, then creates the backup', async () => {
    mockSession.getRecoveryBackupStatus.mockResolvedValue({ exists: false, updatedAt: null });
    mockSession.newRecoveryPhrase.mockReturnValue(PHRASE);
    mockSession.enableRecoveryBackup.mockResolvedValue(undefined);
    const navigation = { goBack: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.press(screen.getByRole('button', { name: 'Generate recovery phrase' }));

    // The 24 words are shown.
    expect(screen.getByText('alpha')).toBeOnTheScreen();
    expect(screen.getByText('xray')).toBeOnTheScreen();

    // Create is gated on confirming the phrase was saved.
    await fireEvent.press(screen.getByRole('button', { name: 'Create backup' }));
    expect(mockSession.enableRecoveryBackup).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'I have written down my recovery phrase' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create backup' }));

    await waitFor(() => expect(mockSession.enableRecoveryBackup).toHaveBeenCalledWith(PHRASE));
    expect(await screen.findByText(/Backup saved/)).toBeOnTheScreen();
  });

  it('surfaces a friendly error when the device has no identity yet', async () => {
    mockSession.getRecoveryBackupStatus.mockResolvedValue({ exists: false, updatedAt: null });
    mockSession.newRecoveryPhrase.mockReturnValue(PHRASE);
    mockSession.enableRecoveryBackup.mockRejectedValue(new recoverySession.NoLocalIdentityError());
    await renderScreen({ goBack: jest.fn() });

    await fireEvent.press(screen.getByRole('button', { name: 'Generate recovery phrase' }));
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'I have written down my recovery phrase' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Create backup' }));

    expect(await screen.findByText(/no encryption identity yet/)).toBeOnTheScreen();
  });

  it('shows an active-backup state with a disable option', async () => {
    mockSession.getRecoveryBackupStatus.mockResolvedValue({
      exists: true,
      updatedAt: '2026-01-01',
    });
    mockSession.disableRecoveryBackup.mockResolvedValue(undefined);
    await renderScreen({ goBack: jest.fn() });

    expect(await screen.findByText('✓ Backup active')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Disable backup' }));
    await waitFor(() => expect(mockSession.disableRecoveryBackup).toHaveBeenCalled());
  });
});
