import SwiftUI
import GoogleSignIn

@main
struct LectureApp: App {
    @StateObject private var authService = AuthService.shared
    @StateObject private var transcriptionStore = TranscriptionStore()
    @StateObject private var onboardingManager = OnboardingManager.shared
    
    var body: some Scene {
        WindowGroup {
            Group {
                if authService.isLoading {
                    // Show loading while checking auth state
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(.systemGroupedBackground))
                } else if authService.isAuthenticated {
                    // User is signed in - show main app
                    ContentView()
                        .environmentObject(transcriptionStore)
                        .environmentObject(onboardingManager)
                        .environmentObject(authService)
                        .fullScreenCover(isPresented: $onboardingManager.shouldShowOnboarding) {
                            OnboardingView(isPresented: $onboardingManager.shouldShowOnboarding)
                        }
                } else {
                    // User is not signed in - show sign in view
                    SignInView()
                        .environmentObject(authService)
                }
            }
            .task {
                // Check for existing session on app launch
                await authService.checkSession()
            }
            .onOpenURL { url in
                // Handle Google Sign-In callback URL
                _ = authService.handleURL(url)
            }
        }
    }
}
