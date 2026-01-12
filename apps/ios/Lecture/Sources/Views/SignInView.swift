import SwiftUI
import GoogleSignIn
import GoogleSignInSwift

struct SignInView: View {
    @EnvironmentObject private var authService: AuthService
    @State private var isSigningIn = false
    @State private var showError = false
    
    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            
            // Logo and title
            VStack(spacing: 16) {
                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(.blue)
                
                Text("Lecture")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Transform your lectures into structured notes")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }
            
            Spacer()
            
            // Google Sign in button
            VStack(spacing: 16) {
                Button {
                    signIn()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "g.circle.fill")
                            .font(.title2)
                        Text("Sign in with Google")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(isSigningIn)
                .padding(.horizontal, 24)
                
                if isSigningIn {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle())
                }
            }
            
            Spacer()
            
            // Terms and privacy
            VStack(spacing: 4) {
                Text("By signing in, you agree to our")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                
                HStack(spacing: 4) {
                    Link("Terms of Service", destination: URL(string: "https://example.com/terms")!)
                    Text("and")
                        .foregroundStyle(.secondary)
                    Link("Privacy Policy", destination: URL(string: "https://example.com/privacy")!)
                }
                .font(.caption)
            }
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .alert("Sign In Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(authService.errorMessage ?? "An error occurred")
        }
        .onChange(of: authService.errorMessage) { _, newValue in
            showError = newValue != nil
        }
    }
    
    private func signIn() {
        isSigningIn = true
        
        Task {
            defer {
                Task { @MainActor in
                    isSigningIn = false
                }
            }
            
            // Get the root view controller for presenting Google Sign-In
            guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let rootViewController = windowScene.windows.first?.rootViewController else {
                authService.errorMessage = "Unable to present sign in"
                return
            }
            
            do {
                try await authService.signInWithGoogle(presenting: rootViewController)
            } catch {
                authService.errorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    SignInView()
        .environmentObject(AuthService.shared)
}
