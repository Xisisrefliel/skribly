import Foundation

enum TranscriptionStatus: String, Codable {
    case pending = "pending"
    case processing = "processing"
    case structuring = "structuring"
    case completed = "completed"
    case error = "error"
}

struct Transcription: Codable, Identifiable {
    let id: String
    let deviceId: String
    let title: String
    let audioUrl: String?
    let audioDuration: Double?
    let transcriptionText: String?
    let structuredText: String?
    let status: TranscriptionStatus
    let progress: Double
    let errorMessage: String?
    let pdfKey: String?
    let pdfGeneratedAt: String?
    let createdAt: String
    let updatedAt: String
    
    var createdAtDate: Date? {
        ISO8601DateFormatter().date(from: createdAt)
    }
    
    var formattedDuration: String {
        guard let duration = audioDuration else { return "--:--" }
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
    
    var progressPercentage: Int {
        Int(progress * 100)
    }
    
    var previewText: String {
        // Prefer structured text for preview if available
        let text = structuredText ?? transcriptionText
        guard let text = text, !text.isEmpty else {
            return "No transcription yet"
        }
        // Strip markdown for preview
        let cleanText = text
            .replacingOccurrences(of: #"#{1,6}\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\*\*([^*]+)\*\*"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: #"\*([^*]+)\*"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: #"^[-*]\s+"#, with: "", options: .regularExpression)
        let preview = String(cleanText.prefix(150))
        return cleanText.count > 150 ? preview + "..." : preview
    }
    
    var hasStructuredText: Bool {
        guard let text = structuredText else { return false }
        return !text.isEmpty
    }
    
    var isProcessing: Bool {
        status == .processing || status == .structuring || status == .pending
    }
}

// MARK: - API Response Types

struct UploadResponse: Codable {
    let id: String
    let message: String
}

struct TranscribeResponse: Codable {
    let id: String
    let status: TranscriptionStatus
    let message: String
}

struct TranscriptionListResponse: Codable {
    let transcriptions: [Transcription]
}

struct TranscriptionDetailResponse: Codable {
    let transcription: Transcription
}

struct ErrorResponse: Codable {
    let error: String
    let message: String
}

struct PDFResponse: Codable {
    let pdfUrl: String
    let message: String
}
