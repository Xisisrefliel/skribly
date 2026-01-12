import { createContext, useContext, type ReactNode } from 'react';
import { useSession, signIn, signOut } from '@/lib/auth-client';

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
  // Use better-auth's useSession hook - handles all session management automatically
  const { data: session, isPending, refetch } = useSession();

  const user = session?.user as User | null;

  const handleSignIn = async () => {
    // better-auth handles the entire OAuth flow:
    // 1. Redirects to Google
    // 2. Handles callback
    // 3. Creates session
    // 4. Sets cookies
    // 5. Redirects back to callbackURL
    await signIn.social({
      provider: 'google',
      callbackURL: window.location.origin,
    });
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isPending,
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
