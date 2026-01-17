import SwiftUI
import UniformTypeIdentifiers

struct UploadView: View {
    @EnvironmentObject var store: TranscriptionStore
    @State private var showFilePicker = false
    @State private var selectedFileURL: URL?
    @State private var selectedFileName = ""
    @State private var uploadTitle = ""
    @State private var transcriptionMode: TranscriptionMode = .quality
    @State private var showUploadConfirmation = false
    @State private var error: String?
    @State private var showError = false
    @State private var billingStatus: BillingStatusResponse?
    @State private var isBillingLoading = true
    @State private var debugBypassBilling = false
    @State private var hasSecurityScopedAccess = false

    enum TranscriptionMode: String, CaseIterable {
        case fast = "Fast"
        case quality = "Quality"
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
            allowedContentTypes: [
                .audio, .mpeg4Audio, .mp3, .wav, .aiff,
                .movie, .video, .mpeg4Movie, .quickTimeMovie, .avi,
                UTType(filenameExtension: "mkv") ?? .movie
            ],
            allowsMultipleSelection: false
        ) { result in
            handleFileSelection(result)
        }
        .alert("Error", isPresented: $showError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(error ?? "Unknown error")
        }
        .alert("Confirm Upload", isPresented: $showUploadConfirmation) {
            Button("Cancel", role: .cancel) {
                cleanupFileAccess()
            }
            Button("Upload") {
                uploadFile()
            }
        } message: {
            Text("Upload \"\(selectedFileName)\"?")
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
                    Text("File")
                        .font(.headline)
                        .foregroundColor(.white)

                    Button(action: { showFilePicker = true }) {
                        HStack {
                            Image(systemName: selectedFileURL != nil ? "doc.fill" : "plus")
                                .foregroundColor(selectedFileURL != nil ? .green : .gray)

                            Text(selectedFileURL != nil ? selectedFileName : "Select file...")
                                .foregroundColor(selectedFileURL != nil ? .white : .gray)
                                .lineLimit(1)

                            Spacer()

                            if selectedFileURL != nil {
                                Button(action: { clearSelection() }) {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundColor(.gray)
                                }
                            }
                        }
                        .padding()
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(12)
                    }
                }

                // Title Input
                VStack(alignment: .leading, spacing: 12) {
                    Text("Title")
                        .font(.headline)
                        .foregroundColor(.white)

                    TextField("Enter title", text: $uploadTitle)
                        .textFieldStyle(.plain)
                        .padding()
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(12)
                        .foregroundColor(.white)
                }

                // Upload Button
                Button(action: {
                    if selectedFileURL == nil {
                        error = "Please select a file"
                        showError = true
                        return
                    }
                    if uploadTitle.trimmingCharacters(in: .whitespaces).isEmpty {
                        error = "Please enter a title"
                        showError = true
                        return
                    }
                    showUploadConfirmation = true
                }) {
                    Text("Upload")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canUpload ? Color.white : Color.white.opacity(0.3))
                        .foregroundColor(.black)
                        .cornerRadius(12)
                }
                .disabled(!canUpload)

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
        selectedFileURL != nil && !uploadTitle.trimmingCharacters(in: .whitespaces).isEmpty
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
            guard let fileURL = urls.first else { return }

            guard fileURL.startAccessingSecurityScopedResource() else {
                error = "Cannot access file"
                showError = true
                return
            }

            hasSecurityScopedAccess = true
            selectedFileURL = fileURL
            selectedFileName = fileURL.lastPathComponent

            if uploadTitle.isEmpty {
                uploadTitle = fileURL.deletingPathExtension().lastPathComponent
            }
        } catch {
            self.error = error.localizedDescription
            showError = true
        }
    }

    private func clearSelection() {
        cleanupFileAccess()
        selectedFileURL = nil
        selectedFileName = ""
    }

    private func cleanupFileAccess() {
        if hasSecurityScopedAccess, let url = selectedFileURL {
            url.stopAccessingSecurityScopedResource()
            hasSecurityScopedAccess = false
        }
    }

    private func uploadFile() {
        guard let fileURL = selectedFileURL else { return }
        let title = uploadTitle.trimmingCharacters(in: .whitespaces)

        Task {
            do {
                _ = try await store.uploadAudio(fileURL: fileURL, title: title)
                cleanupFileAccess()
                selectedFileURL = nil
                selectedFileName = ""
                uploadTitle = ""
            } catch {
                self.error = error.localizedDescription
                showError = true
                cleanupFileAccess()
            }
        }
    }
}

#Preview {
    UploadView()
        .environmentObject(TranscriptionStore())
}
