import Foundation
import Security

class KeychainService {
    static let shared = KeychainService()
    
    private let deviceIdKey = "com.lecture.deviceId"
    
    private init() {}
    
    var deviceId: String {
        if let existingId = getDeviceId() {
            return existingId
        }
        
        let newId = UUID().uuidString
        saveDeviceId(newId)
        return newId
    }
    
    private func getDeviceId() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceIdKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let id = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return id
    }
    
    private func saveDeviceId(_ id: String) {
        guard let data = id.data(using: .utf8) else { return }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: deviceIdKey,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        
        // Delete any existing item
        SecItemDelete(query as CFDictionary)
        
        // Add new item
        SecItemAdd(query as CFDictionary, nil)
    }
}
