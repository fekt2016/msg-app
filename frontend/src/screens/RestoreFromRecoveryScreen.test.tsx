import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as recoverySession from '../e2ee/recoverySession';
import * as recovery from '../e2ee/recovery';
import { RestoreFromRecoveryScreen } from './RestoreFromRecoveryScreen';

jest.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../e2ee/recoverySession', () => ({
  restoreFromRecoveryPhrase: jest.fn(),
  enableRecoveryBackup: jest.fn(),
  disableRecoveryBackup: jest.fn(),
  getRecoveryBackupStatus: jest.fn(),
}));

jest.mock('../e2ee/recovery', () => ({
  isValidRecoveryPhrase: jest.fn(() => true),
  RecoveryPhraseError: class RecoveryPhraseError extends Error {},
}));

const mockSession = recoverySession as jest.Mocked<typeof recoverySession>;
const mockRecovery = recovery as jest.Mocked<typeof recovery>;

async function renderScreen(navigation: { goBack: jest.Mock }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <RestoreFromRecoveryScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('RestoreFromRecoveryScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restores the identity from a valid phrase', async () => {
    mockRecovery.isValidRecoveryPhrase.mockReturnValue(true);
    mockSession.restoreFromRecoveryPhrase.mockResolvedValue(undefined);
    const navigation = { goBack: jest.fn() };
    await renderScreen(navigation);

    await fireEvent.changeText(
      screen.getByLabelText('24-word recovery phrase'),
      'alpha bravo charlie',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from recovery phrase' }));

    await waitFor(() =>
      expect(mockSession.restoreFromRecoveryPhrase).toHaveBeenCalledWith(
        'user-1',
        'alpha bravo charlie',
      ),
    );
    expect(await screen.findByText(/identity was restored/)).toBeOnTheScreen();
  });

  it('shows a mismatch message when the phrase does not match the backup', async () => {
    mockRecovery.isValidRecoveryPhrase.mockReturnValue(true);
    mockSession.restoreFromRecoveryPhrase.mockRejectedValue(new recovery.RecoveryPhraseError());
    await renderScreen({ goBack: jest.fn() });

    await fireEvent.changeText(screen.getByLabelText('24-word recovery phrase'), 'wrong phrase');
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from recovery phrase' }));

    expect(await screen.findByText(/does not match your backup/)).toBeOnTheScreen();
  });

  it('disables restore for an invalid phrase', async () => {
    mockRecovery.isValidRecoveryPhrase.mockReturnValue(false);
    await renderScreen({ goBack: jest.fn() });

    await fireEvent.changeText(screen.getByLabelText('24-word recovery phrase'), 'nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from recovery phrase' }));

    expect(mockSession.restoreFromRecoveryPhrase).not.toHaveBeenCalled();
  });
});
