import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes.js';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server is authoritative and the client never merges (§10.3), so a refetch is
      // always safe and always correct.
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Opt in to the v7 transition behaviour now, while there are eight routes to
          break rather than forty. */}
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </QueryClientProvider>
  </StrictMode>,
);
