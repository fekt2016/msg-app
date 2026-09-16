import { render, screen, fireEvent } from '@testing-library/react-native';
import { RecoveryBanner } from './RecoveryBanner';
import { useAuth } from '../auth/AuthContext';
import { useNavigation } from '@react-navigation/native';

jest.mock('../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseNavigation = useNavigation as jest.Mock;

function setup(recoveryPrompt: 'none' | 'backup' | 'restore') {
  const navigate = jest.fn();
  const dismissRecoveryPrompt = jest.fn();
  mockUseNavigation.mockReturnValue({ navigate });
  mockUseAuth.mockReturnValue({ recoveryPrompt, dismissRecoveryPrompt });
  return { navigate, dismissRecoveryPrompt };
}

describe('RecoveryBanner', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when there is no prompt', async () => {
    setup('none');
    await render(<RecoveryBanner />);
    expect(screen.queryByText('Back up your messages')).toBeNull();
    expect(screen.queryByText('Restore your messages')).toBeNull();
  });

  it('offers backup setup and routes to RecoveryKeySetup', async () => {
    const { navigate } = setup('backup');
    await render(<RecoveryBanner />);
    expect(screen.getByText('Back up your messages')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Set up'));
    expect(navigate).toHaveBeenCalledWith('RecoveryKeySetup');
  });

  it('offers restore and routes to RestoreRecovery', async () => {
    const { navigate } = setup('restore');
    await render(<RecoveryBanner />);
    expect(screen.getByText('Restore your messages')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Restore'));
    expect(navigate).toHaveBeenCalledWith('RestoreRecovery');
  });

  it('dismisses without navigating', async () => {
    const { navigate, dismissRecoveryPrompt } = setup('backup');
    await render(<RecoveryBanner />);
    await fireEvent.press(screen.getByLabelText('Dismiss'));
    expect(dismissRecoveryPrompt).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
