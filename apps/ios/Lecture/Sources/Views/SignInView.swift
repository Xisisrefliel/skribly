import SwiftUI
import Clerk

struct SignInView: View {
    @EnvironmentObject private var authService: AuthService
    @State private var authIsPresented = false

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

            // Sign in button
            VStack(spacing: 16) {
                Button {
                    authIsPresented = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "person.circle.fill")
                            .font(.title2)
                        Text("Sign In")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .padding(.horizontal, 24)
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
        .sheet(isPresented: $authIsPresented) {
            AuthView()
        }
    }
}

#Preview {
    SignInView()
        .environmentObject(AuthService.shared)
}
