import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case noData
    case decodingError(Error)
    case serverError(String)
    case networkError(Error)
    case uploadFailed(String)
    case unauthorized
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .noData:
            return "No data received"
        case .decodingError(let error):
            return "Decoding error: \(error.localizedDescription)"
        case .serverError(let message):
            return message
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .uploadFailed(let message):
            return "Upload failed: \(message)"
        case .unauthorized:
            return "Authentication required"
        }
    }
}

class APIClient {
    static let shared = APIClient()
    
    // IMPORTANT: Update this to your server URL
    // - For simulator: use "http://localhost:3000"
    // - For real device: use your Mac's IP like "http://192.168.1.100:3000"
    // - For production: use your deployed server URL
    #if DEBUG
        private let baseURL = "http://192.168.178.19:3000"
    #else
    private let baseURL = "https://your-server.fly.dev"
    #endif
    
    private let session: URLSession
    private let decoder: JSONDecoder
    
    private init() {
        // Configure session to handle cookies automatically
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        // Enable cookie handling for session-based auth
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.httpCookieStorage = .shared
        session = URLSession(configuration: config)
        decoder = JSONDecoder()
    }
    
    // MARK: - API Methods
    
    func fetchTranscriptions() async throws -> [Transcription] {
        let url = try buildURL(path: "/api/transcriptions")
        let request = URLRequest(url: url)
        // No need to add auth header - cookies are sent automatically
        
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        
        let result = try decoder.decode(TranscriptionListResponse.self, from: data)
        return result.transcriptions
    }
    
    func fetchTranscription(id: String) async throws -> Transcription {
        let url = try buildURL(path: "/api/transcription/\(id)")
        let request = URLRequest(url: url)
        
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        
        let result = try decoder.decode(TranscriptionDetailResponse.self, from: data)
        return result.transcription
    }
    
    func uploadAudio(fileURL: URL, title: String, progressHandler: @escaping (Double) -> Void) async throws -> UploadResponse {
        let url = try buildURL(path: "/api/upload")
        
        // Prepare multipart data on background thread to avoid blocking UI
        let (body, boundary) = try await Task.detached(priority: .userInitiated) {
            // Read file data
            let fileData = try Data(contentsOf: fileURL)
            let fileName = fileURL.lastPathComponent
            let mimeType = self.mimeType(for: fileURL)
            
            // Create multipart form data
            let boundary = UUID().uuidString
            var body = Data()
            
            // Add title field
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"title\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(title)\r\n".data(using: .utf8)!)
            
            // Add audio file
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(fileData)
            body.append("\r\n".data(using: .utf8)!)
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)
            
            return (body, boundary)
        }.value
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        // Cookies are sent automatically
        request.addValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        // Use uploadTask for progress tracking
        let (data, response) = try await uploadWithProgress(request: request, data: body, progressHandler: progressHandler)
        try validateResponse(response)
        
        return try decoder.decode(UploadResponse.self, from: data)
    }
    
    func startTranscription(id: String) async throws -> TranscribeResponse {
        let url = try buildURL(path: "/api/transcribe/\(id)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        
        return try decoder.decode(TranscribeResponse.self, from: data)
    }
    
    func deleteTranscription(id: String) async throws {
        let url = try buildURL(path: "/api/transcription/\(id)")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        
        let (_, response) = try await session.data(for: request)
        try validateResponse(response)
    }
    
    func generatePDF(id: String, type: String, title: String? = nil, pdfGeneratedAt: String? = nil) async throws -> URL {
        let displayTitle = title ?? id
        
        // Check for cached PDF first (only for structured PDFs with known generation time)
        if type == "structured", let generatedAt = pdfGeneratedAt {
            if let cachedURL = try? await getCachedPDF(id: id, type: type, title: displayTitle, generatedAt: generatedAt) {
                return cachedURL
            }
        }
        
        let url = try buildURL(path: "/api/transcription/\(id)/pdf")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["type": type]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: request)
        try validateResponse(response)
        
        let result = try decoder.decode(PDFResponse.self, from: data)
        guard let pdfURL = URL(string: result.pdfUrl) else {
            throw APIError.serverError("Invalid PDF URL returned")
        }
        
        // Download the PDF to a local file (off main thread)
        return try await downloadPDFToLocal(from: pdfURL, id: id, title: displayTitle, type: type, generatedAt: pdfGeneratedAt)
    }
    
    /// Check if we have a valid cached PDF locally
    private func getCachedPDF(id: String, type: String, title: String, generatedAt: String) async throws -> URL? {
        return try await Task.detached(priority: .userInitiated) {
            let cacheDir = self.pdfCacheDirectory()
            let cacheMetadataURL = cacheDir.appendingPathComponent("\(id)_\(type).meta")
            let cachedPDFURL = cacheDir.appendingPathComponent("\(id)_\(type).pdf")
            
            // Check if both metadata and PDF file exist
            guard FileManager.default.fileExists(atPath: cacheMetadataURL.path),
                  FileManager.default.fileExists(atPath: cachedPDFURL.path) else {
                return nil
            }
            
            // Read the cached generation timestamp
            let cachedGeneratedAt = try String(contentsOf: cacheMetadataURL, encoding: .utf8)
            
            // If the cached PDF matches the server's generation time, it's valid
            guard cachedGeneratedAt == generatedAt else {
                return nil
            }
            
            // Copy to temp directory for sharing (share sheet may need the file after cache is cleared)
            let sanitizedTitle = title
                .replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: ":", with: "-")
                .replacingOccurrences(of: "\\", with: "-")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let fileName = "\(sanitizedTitle)_\(type).pdf"
            let tempDir = FileManager.default.temporaryDirectory
            let shareURL = tempDir.appendingPathComponent(fileName)
            
            // Remove existing file if present
            if FileManager.default.fileExists(atPath: shareURL.path) {
                try FileManager.default.removeItem(at: shareURL)
            }
            
            // Copy cached PDF to temp location for sharing
            try FileManager.default.copyItem(at: cachedPDFURL, to: shareURL)
            
            return shareURL
        }.value
    }
    
    private func downloadPDFToLocal(from remoteURL: URL, id: String, title: String, type: String, generatedAt: String?) async throws -> URL {
        let (data, response) = try await session.data(from: remoteURL)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError("Failed to download PDF")
        }
        
        // Perform file I/O on a background thread to avoid blocking UI
        return try await Task.detached(priority: .userInitiated) {
            // Create a sanitized filename from the title
            let sanitizedTitle = title
                .replacingOccurrences(of: "/", with: "-")
                .replacingOccurrences(of: ":", with: "-")
                .replacingOccurrences(of: "\\", with: "-")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let fileName = "\(sanitizedTitle)_\(type).pdf"
            let tempDir = FileManager.default.temporaryDirectory
            let localURL = tempDir.appendingPathComponent(fileName)
            
            // Remove existing file if present
            if FileManager.default.fileExists(atPath: localURL.path) {
                try FileManager.default.removeItem(at: localURL)
            }
            
            // Write the PDF data to the local file for sharing
            try data.write(to: localURL, options: .atomic)
            
            // Also cache the PDF for future use (for structured PDFs with generation time)
            if type == "structured", let generatedAt = generatedAt {
                self.cachePDF(data: data, id: id, type: type, generatedAt: generatedAt)
            }
            
            return localURL
        }.value
    }
    
    /// Cache a downloaded PDF for future use
    private func cachePDF(data: Data, id: String, type: String, generatedAt: String) {
        do {
            let cacheDir = pdfCacheDirectory()
            let cacheMetadataURL = cacheDir.appendingPathComponent("\(id)_\(type).meta")
            let cachedPDFURL = cacheDir.appendingPathComponent("\(id)_\(type).pdf")
            
            // Write PDF data
            try data.write(to: cachedPDFURL, options: .atomic)
            
            // Write metadata (generation timestamp)
            try generatedAt.write(to: cacheMetadataURL, atomically: true, encoding: .utf8)
        } catch {
            // Cache failure is not critical, just log it
            print("Failed to cache PDF: \(error)")
        }
    }
    
    /// Get or create the PDF cache directory
    private func pdfCacheDirectory() -> URL {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PDFCache", isDirectory: true)
        
        if !FileManager.default.fileExists(atPath: cacheDir.path) {
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        }
        
        return cacheDir
    }
    
    // MARK: - Helpers
    
    private func buildURL(path: String) throws -> URL {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }
        return url
    }
    
    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.serverError("Invalid response")
        }
        
        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError("Server returned status \(httpResponse.statusCode)")
        }
    }
    
    private func mimeType(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        switch ext {
        // Audio formats
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/m4a"
        case "wav": return "audio/wav"
        case "ogg": return "audio/ogg"
        case "flac": return "audio/flac"
        case "aac": return "audio/aac"
        case "aiff", "aif": return "audio/aiff"
        // Video formats
        case "mp4": return "video/mp4"
        case "mov": return "video/quicktime"
        case "m4v": return "video/x-m4v"
        case "avi": return "video/x-msvideo"
        case "mkv": return "video/x-matroska"
        case "webm": return "video/webm"
        default: return "application/octet-stream"
        }
    }
    
    private func uploadWithProgress(request: URLRequest, data: Data, progressHandler: @escaping (Double) -> Void) async throws -> (Data, URLResponse) {
        return try await withCheckedThrowingContinuation { continuation in
            let delegate = UploadProgressDelegate(progressHandler: progressHandler) { result in
                continuation.resume(with: result)
            }
            
            // Create session with cookie support for uploads
            let config = URLSessionConfiguration.default
            config.httpCookieAcceptPolicy = .always
            config.httpShouldSetCookies = true
            config.httpCookieStorage = .shared
            let session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
            let task = session.uploadTask(with: request, from: data)
            delegate.task = task
            task.resume()
        }
    }
}

// MARK: - Upload Progress Delegate

private class UploadProgressDelegate: NSObject, URLSessionTaskDelegate, URLSessionDataDelegate {
    let progressHandler: (Double) -> Void
    let completion: (Result<(Data, URLResponse), Error>) -> Void
    var task: URLSessionTask?
    var receivedData = Data()
    var response: URLResponse?
    
    init(progressHandler: @escaping (Double) -> Void, completion: @escaping (Result<(Data, URLResponse), Error>) -> Void) {
        self.progressHandler = progressHandler
        self.completion = completion
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        let progress = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        DispatchQueue.main.async {
            self.progressHandler(progress)
        }
    }
    
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        receivedData.append(data)
    }
    
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        self.response = response
        completionHandler(.allow)
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            completion(.failure(error))
        } else if let response = response {
            completion(.success((receivedData, response)))
        } else {
            completion(.failure(APIError.noData))
        }
        session.invalidateAndCancel()
    }
}
