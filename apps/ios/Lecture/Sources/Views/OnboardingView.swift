import SwiftUI

struct OnboardingPage: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let description: String
    let color: Color
}

struct OnboardingView: View {
    @Binding var isPresented: Bool
    @State private var currentPage = 0
    
    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "waveform.circle.fill",
            title: "Welcome to Lecture",
            description: "Transform your lectures, recordings, and documents into structured, readable notes with the power of AI.",
            color: .blue
        ),
        OnboardingPage(
            icon: "doc.badge.plus",
            title: "Select Your File",
            description: "Tap the + button to import audio, video, or documents. We support MP3, M4A, MP4, PDF, PPTX, and more.",
            color: .green
        ),
        OnboardingPage(
            icon: "sparkles",
            title: "AI-Powered Transcription",
            description: "Your content is automatically processed and structured into organized notes with headers, bullet points, and key takeaways.",
            color: .purple
        ),
        OnboardingPage(
            icon: "square.and.arrow.up",
            title: "Export & Share",
            description: "Export your transcriptions as beautifully formatted PDFs. Share them with classmates, colleagues, or save for later reference.",
            color: .orange
        )
    ]
    
    var body: some View {
        VStack(spacing: 0) {
            // Skip button
            HStack {
                Spacer()
                Button("Skip") {
                    completeOnboarding()
                }
                .foregroundStyle(.secondary)
                .padding()
                .opacity(currentPage < pages.count - 1 ? 1 : 0)
            }
            
            // Page content
            TabView(selection: $currentPage) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { index, page in
                    OnboardingPageView(page: page)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            
            // Page indicators
            HStack(spacing: 8) {
                ForEach(0..<pages.count, id: \.self) { index in
                    Circle()
                        .fill(index == currentPage ? pages[currentPage].color : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.bottom, 32)
            .animation(.easeInOut(duration: 0.25), value: currentPage)
            
            // Action button
            Button(action: {
                if currentPage < pages.count - 1 {
                    withAnimation {
                        currentPage += 1
                    }
                } else {
                    completeOnboarding()
                }
            }) {
                Text(currentPage < pages.count - 1 ? "Continue" : "Get Started")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(pages[currentPage].color)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .animation(.easeInOut(duration: 0.25), value: currentPage)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 48)
        }
        .background(.background)
    }
    
    private func completeOnboarding() {
        OnboardingManager.shared.markOnboardingComplete()
        isPresented = false
    }
}

struct OnboardingPageView: View {
    let page: OnboardingPage
    
    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            // Icon with background
            ZStack {
                Circle()
                    .fill(page.color.opacity(0.15))
                    .frame(width: 160, height: 160)
                
                Image(systemName: page.icon)
                    .font(.system(size: 72))
                    .foregroundStyle(page.color)
            }
            
            VStack(spacing: 16) {
                Text(page.title)
                    .font(.title)
                    .fontWeight(.bold)
                    .multilineTextAlignment(.center)
                
                Text(page.description)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 32)
            
            Spacer()
            Spacer()
        }
    }
}

// MARK: - Onboarding Manager

class OnboardingManager: ObservableObject {
    static let shared = OnboardingManager()
    
    private let hasSeenOnboardingKey = "hasSeenOnboarding"
    
    @Published var shouldShowOnboarding: Bool
    
    private init() {
        self.shouldShowOnboarding = !UserDefaults.standard.bool(forKey: hasSeenOnboardingKey)
    }
    
    func markOnboardingComplete() {
        UserDefaults.standard.set(true, forKey: hasSeenOnboardingKey)
        shouldShowOnboarding = false
    }
    
    func resetOnboarding() {
        UserDefaults.standard.set(false, forKey: hasSeenOnboardingKey)
        shouldShowOnboarding = true
    }
}

#Preview {
    OnboardingView(isPresented: .constant(true))
}
