import Foundation
import GoogleSignIn
import SwiftUI

/// User info stored after successful authentication
struct AuthUser: Codable {
    let id: String
    let name: String
    let email: String
    let image: String?
}

/// Authentication service using Google Sign-In with better-auth backend
@MainActor
class AuthService: ObservableObject {
    static let shared = AuthService()
    
    /// Current authenticated user (nil if not signed in)
    @Published private(set) var currentUser: AuthUser?
    
    /// Whether the auth state is being loaded
    @Published private(set) var isLoading = true
    
    /// Error message to display
    @Published var errorMessage: String?
    
    /// Whether user is authenticated
    var isAuthenticated: Bool {
        currentUser != nil
    }
    
    // Backend URL
    #if DEBUG
    private let baseURL = "http://192.168.178.19:3000"
    #else
    private let baseURL = "https://your-server.fly.dev"
    #endif
    
    // Google Client ID for iOS
    private let googleClientID = "409393189725-2hv6dtkilq1he2c92iseoqhpv448kovj.apps.googleusercontent.com"
    
    // URLSession configured to handle cookies
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = .shared
        return URLSession(configuration: config)
    }()
    
    private init() {}
    
    // MARK: - Session Management
    
    /// Check if user has an active session on app launch
    func checkSession() async {
        isLoading = true
        defer { isLoading = false }
        
        // First try to restore Google Sign-In state
        GIDSignIn.sharedInstance.restorePreviousSignIn { [weak self] user, error in
            Task { @MainActor in
                guard let self = self else { return }
                
                if user != nil {
                    // Google session exists, validate with backend
                    await self.validateSession()
                } else {
                    // No Google session
                    self.currentUser = nil
                }
            }
        }
    }
    
    /// Validate session with backend
    private func validateSession() async {
        do {
            guard let url = URL(string: "\(baseURL)/api/auth/get-session") else { return }
            
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            
            let (data, response) = try await session.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                currentUser = nil
                return
            }
            
            // Parse session response
            struct SessionResponse: Codable {
                let user: AuthUser?
            }
            
            let sessionResponse = try JSONDecoder().decode(SessionResponse.self, from: data)
            currentUser = sessionResponse.user
        } catch {
            print("Session validation failed: \(error)")
            currentUser = nil
        }
    }
    
    // MARK: - Sign In
    
    /// Sign in with Google
    func signInWithGoogle(presenting viewController: UIViewController) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        
        do {
            // Configure Google Sign-In
            let config = GIDConfiguration(clientID: googleClientID)
            GIDSignIn.sharedInstance.configuration = config
            
            // Start Google Sign-In flow
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: viewController)
            
            // Get the ID token
            guard let idToken = result.user.idToken?.tokenString else {
                throw AuthError.noIdToken
            }
            
            // Send ID token to backend
            try await authenticateWithBackend(idToken: idToken)
            
        } catch let error as GIDSignInError {
            if error.code == .canceled {
                // User canceled, not an error
                return
            }
            throw AuthError.googleSignInFailed(error.localizedDescription)
        } catch {
            throw error
        }
    }
    
    /// Authenticate with backend using Google ID token
    private func authenticateWithBackend(idToken: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/auth/ios/google") else {
            throw AuthError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Send the ID token to our iOS-specific endpoint
        let body: [String: Any] = [
            "idToken": idToken
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
            // Parse user info from response
            struct SignInResponse: Codable {
                let user: AuthUser
            }
            
            let signInResponse = try JSONDecoder().decode(SignInResponse.self, from: data)
            currentUser = signInResponse.user
        } else {
            // Try to parse error message
            if let errorResponse = try? JSONDecoder().decode([String: String].self, from: data),
               let message = errorResponse["message"] {
                throw AuthError.serverError(message)
            }
            throw AuthError.serverError("Authentication failed with status \(httpResponse.statusCode)")
        }
    }
    
    // MARK: - Sign Out
    
    /// Sign out from both Google and backend
    func signOut() async {
        // Sign out from Google
        GIDSignIn.sharedInstance.signOut()
        
        // Sign out from backend
        do {
            guard let url = URL(string: "\(baseURL)/api/auth/sign-out") else { return }
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            
            let _ = try await session.data(for: request)
        } catch {
            print("Backend sign out failed: \(error)")
        }
        
        // Clear local state
        currentUser = nil
        
        // Clear cookies
        if let cookies = HTTPCookieStorage.shared.cookies(for: URL(string: baseURL)!) {
            for cookie in cookies {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
    }
    
    // MARK: - URL Handling
    
    /// Handle URL callback from Google Sign-In
    func handleURL(_ url: URL) -> Bool {
        return GIDSignIn.sharedInstance.handle(url)
    }
}

// MARK: - Auth Errors

enum AuthError: LocalizedError {
    case noIdToken
    case googleSignInFailed(String)
    case invalidURL
    case invalidResponse
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .noIdToken:
            return "Failed to get authentication token from Google"
        case .googleSignInFailed(let message):
            return "Google Sign-In failed: \(message)"
        case .invalidURL:
            return "Invalid server URL"
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let message):
            return message
        }
    }
}
