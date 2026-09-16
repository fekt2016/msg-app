import { by, device, element, expect } from 'detox';

/**
 * Smoke test — verifies the whole Detox chain end to end: the app builds,
 * installs, launches on the emulator/simulator, mounts the navigation shell,
 * and responds to a tap. It deliberately asserts only on the unauthenticated
 * Welcome screen so it needs no backend, no seeded account, and no network.
 */
describe('Eaz Community — smoke', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('shows the Welcome screen on a fresh launch', async () => {
    await expect(element(by.id('welcome-screen'))).toBeVisible();
    await expect(element(by.id('welcome-get-started'))).toBeVisible();
    await expect(element(by.id('welcome-log-in'))).toBeVisible();
  });

  it('navigates to the Login screen', async () => {
    await element(by.id('welcome-log-in')).tap();
    await expect(element(by.text('Welcome back.'))).toBeVisible();
  });
});
