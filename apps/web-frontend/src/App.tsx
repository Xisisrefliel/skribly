import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TranscriptionCacheProvider } from '@/contexts/TranscriptionCacheContext';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/pages/HomePage';
import { UploadPage } from '@/pages/UploadPage';
import { TranscriptionPage } from '@/pages/TranscriptionPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TranscriptionCacheProvider>
          <BrowserRouter>
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
            </Route>
          </Routes>
          </BrowserRouter>
        </TranscriptionCacheProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
