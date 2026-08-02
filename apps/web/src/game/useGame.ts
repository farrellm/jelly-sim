import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../api/client.js';
import { useBarkAudio } from '../audio/useBarkAudio.js';
import { useGameStore } from './store.js';
import { useGameTicker } from './ticker.js';

export const STATE_QUERY_KEY = ['state'] as const;

/**
 * Load the save into the store and keep it running.
 *
 * TanStack Query owns the fetch — retry, background refetch on focus — and the store owns
 * the game. The seam is `adopt`: the query result goes in, wholesale, and nothing comes
 * back out. Call this once, high up, so a screen change does not restart the simulation.
 */
export function useGame() {
  const query = useQuery({ queryKey: STATE_QUERY_KEY, queryFn: () => api.state() });
  const adopt = useGameStore((s) => s.adopt);

  useEffect(() => {
    if (query.data) adopt(query.data);
  }, [query.data, adopt]);

  useGameTicker();
  useBarkAudio();

  const view = useGameStore((s) => s.view);
  return { view, isPending: query.isPending && !view, isError: query.isError };
}
