import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider, getDatabase } from './src/db';
import { AuthProvider } from './src/auth/AuthContext';
import { RealtimeProvider } from './src/realtime/RealtimeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

const database = getDatabase();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

export default function App() {
  return (
    <DatabaseProvider database={database}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AuthProvider>
            <RealtimeProvider>
              <RootNavigator />
            </RealtimeProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </DatabaseProvider>
  );
}
