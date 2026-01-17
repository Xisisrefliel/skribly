import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';

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
  signIn: () => void;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { signOut: clerkSignOut, getToken } = useClerkAuth();

  // Set the token getter for the API client
  // This runs on every render to ensure the latest getToken is used
  useEffect(() => {
    api.setTokenGetter(getToken);
  }, [getToken]);

  const user: User | null = clerkUser ? {
    id: clerkUser.id,
    name: clerkUser.fullName || clerkUser.firstName || '',
    email: clerkUser.primaryEmailAddress?.emailAddress || '',
    image: clerkUser.imageUrl,
  } : null;

  const handleSignIn = () => {
    window.location.href = '/sign-in';
  };

  const handleSignOut = async () => {
    await clerkSignOut({ redirectUrl: '/' });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: !isLoaded,
        isAuthenticated: !!isSignedIn,
        signIn: handleSignIn,
        signOut: handleSignOut,
        getToken,
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
