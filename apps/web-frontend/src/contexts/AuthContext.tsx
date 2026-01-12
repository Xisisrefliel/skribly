import { signIn, signOut, useSession, setSessionToken, clearSessionToken } from '@/lib/auth-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending, refetch } = useSession();
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);
  const user = session?.user as User | null;

  // Handle OAuth callback - extract token from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      setIsProcessingCallback(true);
      // Store the token
      setSessionToken(token);
      
      // Clean up URL
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      
      // Refetch session with the new token
      setTimeout(() => {
        refetch();
        setIsProcessingCallback(false);
      }, 100);
    }
  }, [refetch]);

  const handleSignIn = async () => {
    await signIn.social({
      provider: 'google',
      callbackURL: window.location.origin,
    });
  };

  const handleSignOut = async () => {
    await signOut();
    clearSessionToken();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isPending || isProcessingCallback,
        isAuthenticated: !!user,
        signIn: handleSignIn,
        signOut: handleSignOut,
        refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
