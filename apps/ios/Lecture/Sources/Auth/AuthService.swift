import Foundation
import Clerk
import SwiftUI

/// User info stored after successful authentication
struct AuthUser {
    let id: String
    let name: String
    let email: String
    let image: String?

    init?(from clerkUser: User?) {
        guard let user = clerkUser else { return nil }
        self.id = user.id
        // Construct name from firstName and lastName
        let firstName = user.firstName ?? ""
        let lastName = user.lastName ?? ""
        let constructedName = [firstName, lastName].filter { !$0.isEmpty }.joined(separator: " ")
        self.name = constructedName.isEmpty ? "User" : constructedName
        self.email = user.primaryEmailAddress?.emailAddress ?? ""
        self.image = user.imageUrl
    }
}

/// Authentication service wrapping Clerk SDK
@MainActor
class AuthService: ObservableObject {
    static let shared = AuthService()

    /// Current authenticated user (derived from Clerk)
    var currentUser: AuthUser? {
        AuthUser(from: Clerk.shared.user)
    }

    /// Whether user is authenticated
    var isAuthenticated: Bool {
        Clerk.shared.user != nil
    }

    /// Whether Clerk is loaded
    var isLoaded: Bool {
        Clerk.shared.isLoaded
    }

    /// Error message to display
    @Published var errorMessage: String?

    private init() {}

    // MARK: - Token Management

    /// Get the current session token for API requests
    func getToken() async throws -> String? {
        guard let session = Clerk.shared.session else {
            return nil
        }
        let token = try await session.getToken()
        return token?.jwt
    }

    // MARK: - Sign Out

    /// Sign out from Clerk
    func signOut() async {
        do {
            try await Clerk.shared.signOut()
        } catch {
            print("Sign out failed: \(error)")
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Auth Errors

enum AuthError: LocalizedError {
    case noToken
    case noSession
    case signOutFailed(String)

    var errorDescription: String? {
        switch self {
        case .noToken:
            return "Failed to get authentication token"
        case .noSession:
            return "No active session"
        case .signOutFailed(let message):
            return "Sign out failed: \(message)"
        }
    }
}
