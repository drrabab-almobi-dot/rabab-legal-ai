import { useQuery } from '@tanstack/react-query';

export interface HealthzResponse {
  status?: string;
  version?: string;
  uptime?: number;
  [key: string]: any;
}

export function useHealthz() {
  return useQuery<HealthzResponse>({
    queryKey: ['healthz'],
    queryFn: async () => {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/')
        ? import.meta.env.BASE_URL
        : `${import.meta.env.BASE_URL}/`;
      const res = await fetch(`${baseUrl}healthz`, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error('Health check failed');
      }
      return await res.json();
    },
    refetchInterval: 15000,
    retry: 1,
  });
}
