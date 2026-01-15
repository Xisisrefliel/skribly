import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TranscriptionCacheProvider } from '@/contexts/TranscriptionCacheContext';
import { Layout } from '@/components/Layout';

const HomePage = lazy(async () => {
  const module = await import('@/pages/HomePage');
  return { default: module.HomePage };
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

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TranscriptionCacheProvider>
          <BrowserRouter>
            <Suspense
              fallback={(
                <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
                  Loading…
                </div>
              )}
            >
              <Routes>
                <Route path="/sign-in/*" element={
                  <div className="min-h-screen flex items-center justify-center">
                    <SignIn routing="path" path="/sign-in" />
                  </div>
                } />
                <Route path="/sign-up/*" element={
                  <div className="min-h-screen flex items-center justify-center">
                    <SignUp routing="path" path="/sign-up" />
                  </div>
                } />
                <Route element={<Layout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/upload" element={<UploadPage />} />
                  <Route path="/transcription/:id" element={<TranscriptionPage />} />
                  <Route path="/privacy" element={<PrivacyPolicyPage />} />
                  <Route path="/terms" element={<TermsOfServicePage />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TranscriptionCacheProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
