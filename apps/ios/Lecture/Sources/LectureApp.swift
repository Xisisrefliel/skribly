import SwiftUI
import Clerk

@main
struct LectureApp: App {
    @State private var clerk = Clerk.shared
    @StateObject private var authService = AuthService.shared
    @StateObject private var transcriptionStore = TranscriptionStore()
    @StateObject private var onboardingManager = OnboardingManager.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if !clerk.isLoaded {
                    // Show loading while Clerk is initializing
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color(.systemGroupedBackground))
                } else if clerk.user != nil {
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
            .environment(\.clerk, clerk)
            .task {
                // Configure and load Clerk
                clerk.configure(publishableKey: "pk_test_Z29yZ2VvdXMtZGFzc2llLTkyLmNsZXJrLmFjY291bnRzLmRldiQ")
                try? await clerk.load()
            }
        }
    }
}
