import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders the welcome screen', async () => {
    await render(<App />);

    expect(screen.getByText(/Together,/)).toBeOnTheScreen();
    expect(screen.getByText('Get started')).toBeOnTheScreen();
    expect(screen.getByText('Log in')).toBeOnTheScreen();
  });
});
