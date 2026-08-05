import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useConversationMessages } from './useConversationMessages';
import * as messagesApi from '../api/messages';

jest.mock('../api/messages', () => ({
  listConversationMessages: jest.fn(),
}));

const mockApi = messagesApi as jest.Mocked<typeof messagesApi>;

const storedMessage = {
  id: 'm1',
  senderId: 'u1',
  recipientId: 'u2',
  ciphertext: 'ct',
  iv: 'iv',
  timestamp: 1000,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('fetches the conversation with a user', async () => {
  mockApi.listConversationMessages.mockResolvedValue({
    items: [storedMessage],
    total: 1,
    page: 1,
    pageSize: 20,
  });

  const { result } = await renderHook(() => useConversationMessages('u2'), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(mockApi.listConversationMessages).toHaveBeenCalledWith('u2');
  expect(result.current.data?.items).toEqual([storedMessage]);
});
