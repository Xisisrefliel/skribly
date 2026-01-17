import SwiftUI
import UniformTypeIdentifiers

struct SelectedFile: Identifiable {
    let id = UUID()
    let originalName: String
    let tempURL: URL
}

struct UploadView: View {
    @EnvironmentObject var store: TranscriptionStore
    @Binding var selectedTab: AppTab
    @State private var showFilePicker = false
    @State private var selectedFiles: [SelectedFile] = []
    @State private var title = ""
    @State private var transcriptionMode: TranscriptionMode = .quality
    @State private var error: String?
    @State private var showError = false
    @State private var billingStatus: BillingStatusResponse?
    @State private var isBillingLoading = true
    @State private var debugBypassBilling = false

    private let maxBatchFiles = 5

    enum TranscriptionMode: String, CaseIterable {
        case fast = "Fast"
        case quality = "Quality"

        var apiValue: String {
            switch self {
            case .fast: return "fast"
            case .quality: return "quality"
            }
        }
    }

    // Supported file types
    private var allowedContentTypes: [UTType] {
        [
            // Audio formats
            .audio, .mpeg4Audio, .mp3, .wav, .aiff,
            // Video formats
            .movie, .video, .mpeg4Movie, .quickTimeMovie, .avi,
            UTType(filenameExtension: "mkv") ?? .movie,
            // Document formats
            .pdf,
            UTType("com.microsoft.powerpoint.pptx") ?? .data,
            UTType("com.microsoft.powerpoint.ppt") ?? .data,
            UTType("org.openxmlformats.presentationml.presentation") ?? .data,
            UTType("org.openxmlformats.wordprocessingml.document") ?? .data
        ]
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                if isBillingLoading {
                    ProgressView()
                        .tint(.white)
                } else if let billing = billingStatus, !billing.isActive, !debugBypassBilling {
                    subscriptionView
                } else {
                    uploadForm
                }

                if store.isUploading {
                    progressOverlay
                }
            }
            .navigationTitle("Upload")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                #if DEBUG
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { debugBypassBilling.toggle() }) {
                        Image(systemName: debugBypassBilling ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(debugBypassBilling ? .green : .gray)
                    }
                }
                #endif
            }
            .task {
                await fetchBillingStatus()
            }
        }
        .preferredColorScheme(.dark)
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: allowedContentTypes,
            allowsMultipleSelection: true
        ) { result in
            handleFileSelection(result)
        }
        .alert("Error", isPresented: $showError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(error ?? "Unknown error")
        }
    }

    // MARK: - Subscription View
    private var subscriptionView: some View {
        VStack(spacing: 32) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.gray)

                Text("Subscription Required")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                Text("You've used your 3 free transcriptions")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }

            VStack(alignment: .leading, spacing: 12) {
                Label("Unlimited transcriptions", systemImage: "checkmark")
                Label("AI-powered notes", systemImage: "checkmark")
                Label("Quizzes & flashcards", systemImage: "checkmark")
            }
            .font(.subheadline)
            .foregroundColor(.white)
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)

            VStack(spacing: 8) {
                Text("$4.99/month")
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundColor(.white)

                Button(action: {}) {
                    Text("Subscribe")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.white)
                        .foregroundColor(.black)
                        .cornerRadius(12)
                }
                .padding(.horizontal)
            }

            Spacer()
        }
    }

    // MARK: - Upload Form
    private var uploadForm: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Mode Selection
                VStack(alignment: .leading, spacing: 12) {
                    Text("Mode")
                        .font(.headline)
                        .foregroundColor(.white)

                    Picker("Mode", selection: $transcriptionMode) {
                        ForEach(TranscriptionMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // File Selection
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Files")
                            .font(.headline)
                            .foregroundColor(.white)

                        Spacer()

                        if !selectedFiles.isEmpty {
                            Button("Clear All") {
                                clearSelection()
                            }
                            .font(.subheadline)
                            .foregroundColor(.gray)
                        }
                    }

                    Button(action: { showFilePicker = true }) {
                        HStack {
                            Image(systemName: "plus")
                                .foregroundColor(.gray)

                            Text(selectedFiles.isEmpty ? "Select files..." : "Add more files...")
                                .foregroundColor(.gray)

                            Spacer()
                        }
                        .padding()
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(12)
                    }

                    // Show selected files
                    ForEach(selectedFiles) { file in
                        HStack {
                            Image(systemName: iconForFile(file.originalName))
                                .foregroundColor(.green)

                            Text(file.originalName)
                                .foregroundColor(.white)
                                .lineLimit(1)

                            Spacer()

                            Button {
                                removeFile(file)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.gray)
                            }
                        }
                        .padding()
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(12)
                    }

                    Text("Supported: MP3, M4A, WAV, MP4, PDF, PPTX, DOCX")
                        .font(.caption)
                        .foregroundColor(.gray)
                }

                // Title Input
                VStack(alignment: .leading, spacing: 12) {
                    Text("Title")
                        .font(.headline)
                        .foregroundColor(.white)

                    TextField("Enter a title", text: $title)
                        .textFieldStyle(.plain)
                        .padding()
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(12)
                        .foregroundColor(.white)
                }

                // Upload Button
                Button(action: {
                    uploadFiles()
                }) {
                    Text(uploadButtonText)
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canUpload && !store.isUploading ? Color.white : Color.white.opacity(0.3))
                        .foregroundColor(.black)
                        .cornerRadius(12)
                }
                .disabled(!canUpload || store.isUploading)

                Spacer()
            }
            .padding()
        }
    }

    // MARK: - Progress Overlay
    private var progressOverlay: some View {
        ZStack {
            Color.black.opacity(0.8).ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView(value: store.uploadProgress)
                    .tint(.white)

                Text("Uploading... \(Int(store.uploadProgress * 100))%")
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(Color.white.opacity(0.1))
            .cornerRadius(16)
        }
    }

    // MARK: - Helpers
    private var canUpload: Bool {
        !selectedFiles.isEmpty && !title.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var uploadButtonText: String {
        if selectedFiles.isEmpty {
            return "Select Files"
        } else if selectedFiles.count == 1 {
            return "Generate Notes"
        } else {
            return "Generate Notes for \(selectedFiles.count) Files"
        }
    }

    private func iconForFile(_ name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased()
        switch ext {
        case "pdf", "pptx", "ppt", "docx":
            return "doc.fill"
        case "mp4", "mov", "avi", "mkv":
            return "video.fill"
        default:
            return "music.note"
        }
    }

    private func fetchBillingStatus() async {
        do {
            billingStatus = try await APIClient.shared.getBillingStatus()
        } catch {
            print("Billing fetch failed: \(error)")
        }
        isBillingLoading = false
    }

    private func handleFileSelection(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard !urls.isEmpty else { return }

            // Check if adding these would exceed the limit
            let remainingSlots = maxBatchFiles - selectedFiles.count
            if urls.count > remainingSlots {
                self.error = "You can upload up to \(maxBatchFiles) files per batch."
                showError = true
            }

            let urlsToProcess = Array(urls.prefix(remainingSlots))

            for fileURL in urlsToProcess {
                let didStartAccess = fileURL.startAccessingSecurityScopedResource()
                print("[Upload] Started security access: \(didStartAccess) for \(fileURL.lastPathComponent)")

                // Copy file to temp directory
                let tempDir = FileManager.default.temporaryDirectory
                let fileExtension = fileURL.pathExtension
                let safeFileName = "\(UUID().uuidString).\(fileExtension)"
                let tempURL = tempDir.appendingPathComponent(safeFileName)

                // Remove existing temp file if present
                if FileManager.default.fileExists(atPath: tempURL.path) {
                    try FileManager.default.removeItem(at: tempURL)
                }

                // Copy the file while we have security-scoped access
                try FileManager.default.copyItem(at: fileURL, to: tempURL)

                // Release security-scoped access
                if didStartAccess {
                    fileURL.stopAccessingSecurityScopedResource()
                }

                let selectedFile = SelectedFile(
                    originalName: fileURL.lastPathComponent,
                    tempURL: tempURL
                )
                selectedFiles.append(selectedFile)
            }

            // Set default title if empty
            if title.isEmpty && !selectedFiles.isEmpty {
                if selectedFiles.count == 1 {
                    title = (selectedFiles[0].originalName as NSString).deletingPathExtension
                } else {
                    title = (selectedFiles[0].originalName as NSString).deletingPathExtension + " and others"
                }
            }
        } catch {
            print("[Upload] Error: \(error)")
            self.error = error.localizedDescription
            showError = true
        }
    }

    private func removeFile(_ file: SelectedFile) {
        try? FileManager.default.removeItem(at: file.tempURL)
        selectedFiles.removeAll { $0.id == file.id }
    }

    private func clearSelection() {
        for file in selectedFiles {
            try? FileManager.default.removeItem(at: file.tempURL)
        }
        selectedFiles.removeAll()
        title = ""
    }

    private func uploadFiles() {
        guard !selectedFiles.isEmpty, !store.isUploading else { return }
        let uploadTitle = title.trimmingCharacters(in: .whitespaces)
        guard !uploadTitle.isEmpty else {
            self.error = "Please enter a title"
            showError = true
            return
        }

        let mode = transcriptionMode.apiValue
        let filesToUpload = selectedFiles
        let fileURLs = filesToUpload.map { $0.tempURL }

        // Clear UI state immediately to prevent double submissions
        selectedFiles.removeAll()
        title = ""

        Task { @MainActor in
            do {
                print("[Upload] Starting upload for \(fileURLs.count) file(s)")

                if fileURLs.count == 1 {
                    // Single file upload - just upload and start, don't wait for fetch
                    try await store.uploadFile(fileURL: fileURLs[0], title: uploadTitle, mode: mode)
                } else {
                    // Batch upload
                    try await store.uploadFilesBatch(fileURLs: fileURLs, title: uploadTitle, mode: mode)
                }

                print("[Upload] Upload completed, navigating to home")

                // Clean up temp files
                for file in filesToUpload {
                    try? FileManager.default.removeItem(at: file.tempURL)
                }

                // Navigate to home immediately
                withAnimation {
                    selectedTab = .home
                }

            } catch let uploadError {
                print("[Upload] Upload error: \(uploadError)")
                // Restore files on error so user can retry
                selectedFiles = filesToUpload
                title = uploadTitle
                self.error = uploadError.localizedDescription
                showError = true
            }
        }
    }
}

#Preview {
    UploadView(selectedTab: .constant(.upload))
        .environmentObject(TranscriptionStore())
}
