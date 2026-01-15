import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBillingStatus } from '@/hooks/useBillingStatus';
import { api } from '@/lib/api';
import { SignInButton } from '@clerk/clerk-react';
import { CreditCard, LogOut, Moon, Sun, Upload } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const COOKIE_CONSENT_KEY = 'notism-cookie-consent';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      className="neu-button-subtle transition-transform hover:scale-105"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className="sr-only">Toggle theme</span>
      {theme === 'light' ? (
        <Moon className="h-4 w-4 transition-transform" />
      ) : (
        <Sun className="h-4 w-4 transition-transform" />
      )}
    </Button>
  );
}

interface UserMenuProps {
  hasActivePlan: boolean;
  isPortalLoading: boolean;
  isCheckoutLoading: boolean;
  onManageSubscription: () => void;
  onUpgrade: () => void;
}

function UserMenu({
  hasActivePlan,
  isPortalLoading,
  isCheckoutLoading,
  onManageSubscription,
  onUpgrade
}: UserMenuProps) {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="neu-button-subtle">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image} alt={user.name} />
            <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {hasActivePlan ? (
          <DropdownMenuItem
            onClick={onManageSubscription}
            disabled={isPortalLoading}
            className="cursor-pointer"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {isPortalLoading ? 'Opening portal...' : 'Manage subscription'}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={onUpgrade}
            disabled={isCheckoutLoading}
            className="cursor-pointer"
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {isCheckoutLoading ? 'Opening checkout...' : 'Upgrade to Pro'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout() {
  const { isAuthenticated } = useAuth();
  const { billingStatus } = useBillingStatus();
  const location = useLocation();
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [hasCookieConsent, setHasCookieConsent] = useState(false);

  useEffect(() => {
    const storedConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
    setHasCookieConsent(storedConsent === 'accepted');
  }, []);

  const handleUpgrade = async () => {
    setIsCheckoutLoading(true);
    try {
      const response = await api.createBillingCheckout();
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to start checkout:', error);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsPortalLoading(true);
    try {
      const response = await api.createBillingPortal();
      window.location.href = response.url;
    } catch (error) {
      console.error('Failed to open customer portal:', error);
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleAcceptCookies = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setHasCookieConsent(true);
  };

  const isPolicyPage = location.pathname === '/privacy' || location.pathname === '/terms';
  const isContentLocked = !hasCookieConsent && !isPolicyPage;
  const shouldShowFooter = isAuthenticated || location.pathname !== '/';

  return (
    <div className="min-h-screen bg-background relative flex flex-col">
      {/* Noise texture overlay - disabled for performance, causes GPU flicker on long pages */}
      {/* <div className="noise-overlay" aria-hidden="true" /> */}

      {/* Floating pill navigation */}
      <header className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] max-w-2xl ${isContentLocked ? 'pointer-events-none select-none opacity-60' : ''}`}>
        <nav
          className="neu-pill px-4 py-2 flex items-center justify-between"
          role="navigation"
          aria-label="Main navigation"
        >
          <Link
            to="/"
            className="flex items-center space-x-2 group outline-none rounded-lg p-1 -m-1"
            aria-label="Notism - Go to home"
          >
            <span className="font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Notism
            </span>
          </Link>

          <div className="flex items-center space-x-2">
            <ThemeToggle />

            {isAuthenticated ? (
              <>
                {billingStatus?.isActive && (
                  <span className="inline-flex items-center rounded-full bg-status-success/20 px-3 py-1 text-xs font-semibold text-status-success">
                    Pro
                  </span>
                )}
                <Link to="/upload" className="hidden sm:block">
                  <Button variant="outline" size="sm" className="neu-button">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </Link>
                <Link to="/upload" className="sm:hidden">
                  <Button variant="outline" size="icon-sm" className="neu-button" aria-label="Upload file">
                    <Upload className="h-4 w-4" />
                  </Button>
                </Link>
                <UserMenu
                  hasActivePlan={billingStatus?.isActive ?? false}
                  isPortalLoading={isPortalLoading}
                  isCheckoutLoading={isCheckoutLoading}
                  onManageSubscription={handleManageSubscription}
                  onUpgrade={handleUpgrade}
                />
              </>
            ) : (
              <SignInButton mode="modal">
                <Button size="sm" className="neu-button-primary">
                  Sign in
                </Button>
              </SignInButton>
            )}
          </div>
        </nav>
      </header>

      {/* Main content with top padding for floating nav */}
      <main className={`container mx-auto px-4 pt-24 pb-8 flex-1 ${isContentLocked ? 'pointer-events-none select-none opacity-60' : ''}`}>
        <Outlet />
      </main>

      {shouldShowFooter && (
        <footer className="container mx-auto mt-auto px-4 pb-6 text-[0.7rem] text-muted-foreground flex flex-row flex-wrap items-center justify-between gap-3 sm:text-xs">
          <span>© 2026 Notism</span>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <a
              href="mailto:info@notism.one"
              className="hover:text-foreground transition-colors"
            >
              Report a bug
            </a>
          </div>
        </footer>
      )}

      {!hasCookieConsent && (
        <div className="fixed inset-x-0 bottom-4 z-50 px-4" role="dialog" aria-live="polite">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 backdrop-blur neu-panel px-4 py-3 shadow-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              We use essential cookies to keep Notism secure and running. Please accept to continue. Read our{' '}
              <Link to="/privacy" className="text-foreground hover:underline">Privacy Policy</Link>{' '}and{' '}
              <Link to="/terms" className="text-foreground hover:underline">Terms of Service</Link>.
            </p>
            <Button size="sm" className="neu-button-primary" onClick={handleAcceptCookies}>
              Accept
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
