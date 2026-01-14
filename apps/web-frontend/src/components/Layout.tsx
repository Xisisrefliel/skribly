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
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { SignInButton } from '@clerk/clerk-react';
import { LogOut, Moon, Sun, Upload } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

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

function UserMenu() {
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

  return (
    <div className="min-h-screen bg-background relative">
      {/* Noise texture overlay - disabled for performance, causes GPU flicker on long pages */}
      {/* <div className="noise-overlay" aria-hidden="true" /> */}

      {/* Floating pill navigation */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] max-w-2xl">
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
                <UserMenu />
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
      <main className="container mx-auto px-4 pt-24 pb-8">
        <Outlet />
      </main>
    </div>
  );
}
