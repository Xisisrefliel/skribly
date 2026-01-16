import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TranscriptionCacheProvider } from '@/contexts/TranscriptionCacheContext';
import { Layout, PublicLayout } from '@/components/Layout';

const HomePage = lazy(async () => {
  const module = await import('@/pages/HomePage');
  return { default: module.HomePage };
});

const AuthenticatedHome = lazy(async () => {
  const module = await import('@/pages/AuthenticatedHome');
  return { default: module.AuthenticatedHome };
});

const UploadPage = lazy(async () => {
  const module = await import('@/pages/UploadPage');
  return { default: module.UploadPage };
});

const TranscriptionPage = lazy(async () => {
  const module = await import('@/pages/TranscriptionPage');
  return { default: module.TranscriptionPage };
});

const PrivacyPolicyPage = lazy(async () => {
  const module = await import('@/pages/PrivacyPolicyPage');
  return { default: module.PrivacyPolicyPage };
});

const TermsOfServicePage = lazy(async () => {
  const module = await import('@/pages/TermsOfServicePage');
  return { default: module.TermsOfServicePage };
});

const SignInPage = lazy(async () => {
  const module = await import('@clerk/clerk-react');
  return { default: module.SignIn };
});

const SignUpPage = lazy(async () => {
  const module = await import('@clerk/clerk-react');
  return { default: module.SignUp };
});

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  if (!CLERK_PUBLISHABLE_KEY) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY environment variable');
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/app"
      afterSignUpUrl="/app"
      afterSignOutUrl="/"
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />;
  }

  return <Layout />;
}

function AppShell() {
  return (
    <TranscriptionCacheProvider>
      <ProtectedLayout />
    </TranscriptionCacheProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ClerkRoot>
          <AuthProvider>
            <Suspense
              fallback={(
                <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
                  Loading…
                </div>
              )}
            >
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsOfServicePage />} />
                </Route>
                <Route path="/sign-in/*" element={
                  <div className="min-h-screen flex items-center justify-center">
                    <SignInPage routing="path" path="/sign-in" />
                  </div>
                } />
                <Route path="/sign-up/*" element={
                  <div className="min-h-screen flex items-center justify-center">
                    <SignUpPage routing="path" path="/sign-up" />
                  </div>
                } />
                <Route element={<AppShell />}>
                  <Route path="/app" element={<AuthenticatedHome />} />
                  <Route path="/upload" element={<UploadPage />} />
                  <Route path="/transcription/:id" element={<TranscriptionPage />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </ClerkRoot>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
