import { useAuth } from '@clerk/clerk-react';
import { API_BASE } from '@/lib/auth-client';

export function useApi() {
  const { getToken } = useAuth();

  const fetchWithAuth = async (path: string, options: RequestInit = {}) => {
    const token = await getToken();
    
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  return { fetchWithAuth };
}
