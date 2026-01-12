import { Link, Outlet } from 'react-router-dom';
import { Sun, Moon, Mic, Upload, LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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

export function Layout() {
  const { user, isAuthenticated, signIn, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background relative">
      {/* Noise texture overlay */}
      <div className="noise-overlay" aria-hidden="true" />
      
      {/* Floating pill navigation */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] max-w-2xl">
        <nav 
          className="neu-pill backdrop-blur-xl px-4 py-2 flex items-center justify-between"
          role="navigation"
          aria-label="Main navigation"
        >
          <Link 
            to="/" 
            className="flex items-center space-x-2 group outline-none rounded-lg p-1 -m-1"
            aria-label="Lecture - Go to home"
          >
            <div className="neu-icon-container p-1.5 rounded-lg transition-transform group-hover:scale-105">
              <Mic className="h-5 w-5 text-primary" />
            </div>
            <span className="font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Lecture
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="relative h-8 w-8 rounded-full neu-avatar"
                      aria-label="User menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.image} alt={user?.name || 'User avatar'} />
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/40 text-primary font-medium">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 neu-dropdown">
                    <div className="flex items-center gap-3 p-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user?.image} alt="" />
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/40 text-primary">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col space-y-0.5 leading-none overflow-hidden">
                        <p className="font-medium truncate">{user?.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/" className="flex items-center cursor-pointer">
                        <User className="h-4 w-4 mr-2" />
                        My Transcriptions
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={signOut} 
                      className="cursor-pointer text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button onClick={signIn} size="sm" className="neu-button-primary">
                Sign in
              </Button>
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
