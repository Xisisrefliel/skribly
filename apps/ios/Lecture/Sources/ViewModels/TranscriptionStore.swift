import Foundation
import Combine

@MainActor
class TranscriptionStore: ObservableObject {
    @Published var transcriptions: [Transcription] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var uploadProgress: Double = 0
    @Published var isUploading = false
    
    // Selection state for batch operations
    @Published var isSelectionMode = false
    @Published var selectedIds: Set<String> = []
    @Published var isBatchOperationInProgress = false
    
    private var pollingTask: Task<Void, Never>?
    private let api = APIClient.shared
    
    var processingCount: Int {
        transcriptions.filter { $0.isProcessing }.count
    }
    
    var hasProcessingItems: Bool {
        processingCount > 0
    }
    
    init() {
        Task {
            await fetchTranscriptions()
        }
    }
    
    func fetchTranscriptions() async {
        isLoading = true
        error = nil
        
        do {
            transcriptions = try await api.fetchTranscriptions()
            updatePolling()
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func uploadFile(fileURL: URL, title: String, mode: String = "quality") async throws {
        isUploading = true
        uploadProgress = 0
        error = nil

        do {
            // Upload the file
            let response = try await api.uploadAudio(fileURL: fileURL, title: title) { [weak self] progress in
                Task { @MainActor in
                    self?.uploadProgress = progress
                }
            }

            // Start transcription (don't wait for it to complete)
            _ = try await api.startTranscription(id: response.id, mode: mode)

            // Reset upload state
            isUploading = false
            uploadProgress = 0

            // Refresh list in background (don't block navigation)
            Task {
                await fetchTranscriptions()
            }
        } catch {
            isUploading = false
            uploadProgress = 0
            self.error = "Upload failed: \(error.localizedDescription)"
            print("Upload error: \(error)")
            throw error
        }
    }

    func uploadFilesBatch(fileURLs: [URL], title: String, mode: String = "quality") async throws {
        isUploading = true
        uploadProgress = 0
        error = nil

        do {
            // Upload multiple files as a batch
            let response = try await api.uploadFilesBatch(fileURLs: fileURLs, title: title) { [weak self] progress in
                Task { @MainActor in
                    self?.uploadProgress = progress
                }
            }

            // Start transcription
            _ = try await api.startTranscription(id: response.id, mode: mode)

            // Reset upload state
            isUploading = false
            uploadProgress = 0

            // Refresh list in background (don't block navigation)
            Task {
                await fetchTranscriptions()
            }
        } catch {
            isUploading = false
            uploadProgress = 0
            self.error = "Upload failed: \(error.localizedDescription)"
            print("Upload error: \(error)")
            throw error
        }
    }
    
    func deleteTranscription(id: String) async {
        // Optimistic update
        transcriptions.removeAll { $0.id == id }
        
        do {
            try await api.deleteTranscription(id: id)
        } catch {
            // Revert on failure
            await fetchTranscriptions()
            self.error = error.localizedDescription
        }
    }
    
    func refreshTranscription(id: String) async {
        do {
            let updated = try await api.fetchTranscription(id: id)
            if let index = transcriptions.firstIndex(where: { $0.id == id }) {
                transcriptions[index] = updated
            }
            updatePolling()
        } catch {
            self.error = error.localizedDescription
        }
    }
    
    private func updatePolling() {
        pollingTask?.cancel()
        
        if hasProcessingItems {
            pollingTask = Task {
                while !Task.isCancelled && hasProcessingItems {
                    try? await Task.sleep(nanoseconds: 3_000_000_000) // 3 seconds
                    if !Task.isCancelled {
                        await fetchTranscriptions()
                    }
                }
            }
        }
    }
    
    deinit {
        pollingTask?.cancel()
    }
    
    // MARK: - Selection Methods
    
    var selectedCount: Int {
        selectedIds.count
    }
    
    var selectedTranscriptions: [Transcription] {
        transcriptions.filter { selectedIds.contains($0.id) }
    }
    
    func toggleSelection(id: String) {
        if selectedIds.contains(id) {
            selectedIds.remove(id)
        } else {
            selectedIds.insert(id)
        }
    }
    
    func isSelected(id: String) -> Bool {
        selectedIds.contains(id)
    }
    
    func selectAll() {
        selectedIds = Set(transcriptions.map { $0.id })
    }
    
    func deselectAll() {
        selectedIds.removeAll()
    }
    
    func enterSelectionMode() {
        isSelectionMode = true
        selectedIds.removeAll()
    }
    
    func exitSelectionMode() {
        isSelectionMode = false
        selectedIds.removeAll()
    }
    
    // MARK: - Batch Operations
    
    func deleteSelectedTranscriptions() async {
        guard !selectedIds.isEmpty else { return }
        
        isBatchOperationInProgress = true
        let idsToDelete = selectedIds
        
        // Optimistic update
        transcriptions.removeAll { idsToDelete.contains($0.id) }
        selectedIds.removeAll()
        
        var failedCount = 0
        for id in idsToDelete {
            do {
                try await api.deleteTranscription(id: id)
            } catch {
                failedCount += 1
            }
        }
        
        if failedCount > 0 {
            self.error = "Failed to delete \(failedCount) lecture\(failedCount == 1 ? "" : "s")"
            await fetchTranscriptions()
        }
        
        isBatchOperationInProgress = false
        exitSelectionMode()
    }
    
    func generatePDFsForSelected(type: String) async -> [URL] {
        guard !selectedIds.isEmpty else { return [] }
        
        isBatchOperationInProgress = true
        
        // Capture the data we need before going off main actor
        let idsToProcess = Array(selectedIds)
        let titlesById: [String: String] = Dictionary(uniqueKeysWithValues: 
            transcriptions.map { ($0.id, $0.title) }
        )
        // For structured PDFs, also capture pdfGeneratedAt for cache validation
        let pdfGeneratedAtById: [String: String?] = Dictionary(uniqueKeysWithValues:
            transcriptions.map { ($0.id, $0.pdfGeneratedAt) }
        )
        
        // Run PDF generation on background thread to avoid blocking main actor
        let results: [(String, URL?)] = await Task.detached(priority: .userInitiated) { [api] in
            await withTaskGroup(of: (String, URL?).self) { group in
                for id in idsToProcess {
                    group.addTask {
                        do {
                            let title = titlesById[id] ?? id
                            let pdfGeneratedAt = type == "structured" ? pdfGeneratedAtById[id] ?? nil : nil
                            let pdfURL = try await api.generatePDF(id: id, type: type, title: title, pdfGeneratedAt: pdfGeneratedAt)
                            return (id, pdfURL)
                        } catch {
                            print("PDF generation failed for \(id): \(error)")
                            return (id, nil)
                        }
                    }
                }
                
                var results: [(String, URL?)] = []
                for await result in group {
                    results.append(result)
                }
                return results
            }
        }.value
        
        let pdfURLs = results.compactMap { $0.1 }
        let failedCount = results.filter { $0.1 == nil }.count
        
        if failedCount > 0 {
            self.error = "Failed to generate \(failedCount) PDF\(failedCount == 1 ? "" : "s")"
        }
        
        isBatchOperationInProgress = false
        return pdfURLs
    }
}
