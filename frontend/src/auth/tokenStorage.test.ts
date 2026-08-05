import * as SecureStore from 'expo-secure-store';
import { tokenStorage } from './tokenStorage';

const mockStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};

describe('tokenStorage', () => {
  beforeEach(() => {
    mockStore.getItemAsync.mockClear();
    mockStore.setItemAsync.mockClear();
    mockStore.deleteItemAsync.mockClear();
  });

  it('stores access token, refresh token, and user', async () => {
    await tokenStorage.set('at', 'rt', { id: 'u1', displayName: 'A', role: 'USER' });
    expect(mockStore.setItemAsync).toHaveBeenCalledWith('eaz_access_token', 'at');
    expect(mockStore.setItemAsync).toHaveBeenCalledWith('eaz_refresh_token', 'rt');
    expect(mockStore.setItemAsync).toHaveBeenCalledWith(
      'eaz_user',
      expect.stringContaining('"displayName":"A"'),
    );
  });

  it('reads back stored values', async () => {
    mockStore.getItemAsync.mockImplementation((key: string) => {
      if (key === 'eaz_access_token') return Promise.resolve('at');
      if (key === 'eaz_refresh_token') return Promise.resolve('rt');
      if (key === 'eaz_user') return Promise.resolve('{"id":"u1","displayName":"A","role":"USER"}');
      return Promise.resolve(null);
    });
    expect(await tokenStorage.getAccessToken()).toBe('at');
    expect(await tokenStorage.getRefreshToken()).toBe('rt');
    expect(await tokenStorage.getUser()).toEqual({ id: 'u1', displayName: 'A', role: 'USER' });
  });

  it('returns null for a corrupt stored user', async () => {
    mockStore.getItemAsync.mockResolvedValue('not-json');
    expect(await tokenStorage.getUser()).toBeNull();
  });

  it('updates just the access token', async () => {
    await tokenStorage.updateAccessToken('at2');
    expect(mockStore.setItemAsync).toHaveBeenCalledWith('eaz_access_token', 'at2');
  });

  it('updates both tokens', async () => {
    await tokenStorage.updateTokens('at3', 'rt3');
    expect(mockStore.setItemAsync).toHaveBeenCalledWith('eaz_access_token', 'at3');
    expect(mockStore.setItemAsync).toHaveBeenCalledWith('eaz_refresh_token', 'rt3');
  });

  it('clears all stored values', async () => {
    await tokenStorage.clear();
    expect(mockStore.deleteItemAsync).toHaveBeenCalledWith('eaz_access_token');
    expect(mockStore.deleteItemAsync).toHaveBeenCalledWith('eaz_refresh_token');
    expect(mockStore.deleteItemAsync).toHaveBeenCalledWith('eaz_user');
  });
});
