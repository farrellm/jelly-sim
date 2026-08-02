import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@jelly/shared';
import { ApiRequestError, api } from './api/client.js';

export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * Who is signed in, according to the server.
 *
 * There is no token in localStorage and no "am I logged in" flag in the client — the
 * session is an HttpOnly cookie the JavaScript cannot read, so the only honest answer
 * comes from asking. That is also what makes "stays signed in across app restarts" work
 * without any code: the cookie outlives the tab.
 */
export function useSession(): UseQueryResult<MeResponse | null> {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        // Not signed in is an answer, not a failure.
        if (err instanceof ApiRequestError && err.code === 'UNAUTHENTICATED') return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 30_000,
  });
}

export function useSetSession() {
  const queryClient = useQueryClient();
  return (me: MeResponse | null) => queryClient.setQueryData(SESSION_QUERY_KEY, me);
}
