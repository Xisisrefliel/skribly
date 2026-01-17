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

    enum TranscriptionMode: String, CaseIterable {
        case fast = "Fast"
        case quality = "Quality"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.05, green: 0.05, blue: 0.1, alpha: 1) : UIColor(red: 0.98, green: 0.98, blue: 1, alpha: 1) }),
                        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.08, green: 0.06, blue: 0.15, alpha: 1) : UIColor(red: 0.95, green: 0.96, blue: 1, alpha: 1) })
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                if isBillingLoading {
                    ProgressView()
                        .scaleEffect(1.5)
                } else if let billingStatus = billingStatus, !billingStatus.isActive, !debugBypassBilling {
                    subscriptionRequiredView
                } else {
                    uploadContentView
                }
            }
            .navigationTitle("Upload Recording")
            .navigationBarTitleDisplayMode(.inline)
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
        .alert("Upload Error", isPresented: $showError) {
            Button("OK", role: .cancel) { }
        } message: {
            if let error = error {
                Text(error)
            }
        }
        .alert("Confirm Upload", isPresented: $showUploadConfirmation) {
            Button("Cancel", role: .cancel) {
                selectedFileURL = nil
                selectedFileName = ""
            }
            Button("Upload") {
                uploadFile()
            }
        } message: {
            Text("Upload \(selectedFileName) as \"\(uploadTitle.isEmpty ? "Untitled Recording" : uploadTitle)\"?")
        }
    }

    // MARK: - Subscription Required View
    private var subscriptionRequiredView: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "lock.circle.fill")
                    .font(.system(size: 64))
                    .foregroundColor(.blue)
                    .opacity(0.8)

                VStack(spacing: 8) {
                    Text("Notism Pro")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("You've used your 3 free transcriptions")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.vertical, 20)

            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Unlimited transcriptions")
                            .font(.subheadline)
                    }

                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("AI-powered study notes")
                            .font(.subheadline)
                    }

                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("Quiz & flashcard generation")
                            .font(.subheadline)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .background(Color.white.opacity(0.5))
                .cornerRadius(16)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
            }

            VStack(spacing: 12) {
                VStack(spacing: 4) {
                    Text("$4.99")
                        .font(.system(size: 42, weight: .bold, design: .default))

                    Text("per month")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                NavigationLink(destination: EmptyView()) {
                    HStack(spacing: 8) {
                        Image(systemName: "creditcard.fill")
                        Text("Subscribe Now")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundColor(.white)
                    .background(Color.black)
                    .cornerRadius(12)
                    .shadow(color: Color.black.opacity(0.3), radius: 8, x: 0, y: 4)
                }
            }
            .padding(.horizontal)

            Spacer()
        }
        .padding(.vertical, 24)
    }

    // MARK: - Upload Content View
    private var uploadContentView: some View {
        ZStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 12) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .foregroundColor(.blue)
                                .opacity(0.8)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("Add Recording")
                                    .font(.headline)
                                    .foregroundColor(.primary)

                                Text("Upload audio, video, or documents")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()
                        }
                        .padding(16)
                        .background(Color.white.opacity(0.4))
                        .cornerRadius(14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color.white.opacity(0.3), lineWidth: 1)
                        )
                    }

                    // Transcription Mode Toggle
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Transcription Mode")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)

                        HStack(spacing: 12) {
                            ForEach(TranscriptionMode.allCases, id: \.self) { mode in
                                Button(action: { transcriptionMode = mode }) {
                                    VStack(spacing: 6) {
                                        Image(systemName: mode == .fast ? "bolt.fill" : "sparkles")
                                            .font(.body)

                                        Text(mode.rawValue)
                                            .font(.caption)
                                            .fontWeight(.semibold)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 12)
                                    .foregroundColor(transcriptionMode == mode ? .white : .secondary)
                                    .background(
                                        transcriptionMode == mode
                                            ? LinearGradient(
                                                gradient: Gradient(colors: [
                                                    mode == .fast ? Color.orange.opacity(0.7) : Color.blue.opacity(0.7),
                                                    mode == .fast ? Color.orange.opacity(0.5) : Color.blue.opacity(0.5)
                                                ]),
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                            : LinearGradient(
                                                gradient: Gradient(colors: [
                                                    Color.white.opacity(0.2),
                                                    Color.white.opacity(0.1)
                                                ]),
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                    )
                                    .cornerRadius(12)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .background(Color.white.opacity(0.4))
                    .cornerRadius(14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.white.opacity(0.3), lineWidth: 1)
                    )

                    // File Selection Area
                    Button(action: { showFilePicker = true }) {
                        VStack(spacing: 12) {
                            if let fileName = selectedFileName.split(separator: "/").last {
                                HStack(spacing: 10) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.title3)
                                        .foregroundColor(.green)

                                    Text(String(fileName))
                                        .lineLimit(1)
                                        .font(.subheadline)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.primary)

                                    Spacer()
                                }
                                .padding(14)
                                .background(Color.green.opacity(0.1))
                                .cornerRadius(12)
                            } else {
                                VStack(spacing: 12) {
                                    Image(systemName: "arrow.down.doc")
                                        .font(.system(size: 36))
                                        .foregroundColor(.blue)
                                        .opacity(0.6)

                                    VStack(spacing: 4) {
                                        Text("Drop files or tap to browse")
                                            .font(.subheadline)
                                            .fontWeight(.semibold)

                                        Text("Supports audio, video & documents")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }

                                    HStack(spacing: 6) {
                                        ForEach(["MP3", "WAV", "MP4", "PDF"], id: \.self) { format in
                                            Text(format)
                                                .font(.caption2)
                                                .fontWeight(.medium)
                                                .foregroundColor(.secondary)
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 4)
                                                .background(Color.white.opacity(0.3))
                                                .cornerRadius(6)
                                        }
                                        Spacer()
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 20)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(16)
                        .background(Color.white.opacity(0.3))
                        .cornerRadius(14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(style: StrokeStyle(lineWidth: 1.5, dash: [6]))
                                .foregroundColor(Color.white.opacity(0.4))
                        )
                    }

                    // Title Input
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Title")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)

                        TextField("Enter title for your recording", text: $uploadTitle)
                            .font(.body)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.4))
                            .cornerRadius(10)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                            )
                    }
                    .padding(16)
                    .background(Color.white.opacity(0.3))
                    .cornerRadius(14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.white.opacity(0.3), lineWidth: 1)
                    )

                    // Upload Button
                    Button(action: {
                        guard selectedFileURL != nil else {
                            error = "Please select a file to upload"
                            showError = true
                            return
                        }

                        if uploadTitle.trimmingCharacters(in: .whitespaces).isEmpty {
                            error = "Please enter a title for your recording"
                            showError = true
                            return
                        }

                        showUploadConfirmation = true
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.up")
                            Text("Generate Notes")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .foregroundColor(.white)
                        .background(
                            selectedFileURL != nil && !uploadTitle.isEmpty
                                ? LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color.blue.opacity(0.8),
                                        Color.blue.opacity(0.6)
                                    ]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                                : LinearGradient(
                                    gradient: Gradient(colors: [
                                        Color.gray.opacity(0.4),
                                        Color.gray.opacity(0.3)
                                    ]),
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                        )
                        .cornerRadius(12)
                        .shadow(color: Color.blue.opacity(0.3), radius: 8, x: 0, y: 4)
                    }
                    .disabled(selectedFileURL == nil || uploadTitle.isEmpty)
                    .padding(16)
                    .background(Color.white.opacity(0.3))
                    .cornerRadius(14)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.white.opacity(0.3), lineWidth: 1)
                    )

                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 20)
            }

            // Upload Progress Overlay
            if store.isUploading {
                ZStack {
                    Color.black.opacity(0.3)
                        .ignoresSafeArea()

                    VStack(spacing: 16) {
                        ProgressView(value: store.uploadProgress)
                            .tint(.blue)

                        VStack(spacing: 4) {
                            Text("Generating notes...")
                                .font(.subheadline)
                                .fontWeight(.semibold)

                            Text("\(Int(store.uploadProgress * 100))%")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(20)
                    .background(Color.white.opacity(0.9))
                    .cornerRadius(16)
                    .shadow(color: Color.black.opacity(0.2), radius: 12, x: 0, y: 8)
                    .padding()
                }
            }
        }
    }

    // MARK: - Methods
    private func fetchBillingStatus() async {
        do {
            billingStatus = try await APIClient.shared.getBillingStatus()
        } catch {
            print("Failed to fetch billing status: \(error)")
        }
        isBillingLoading = false
    }

    private func handleFileSelection(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard let fileURL = urls.first else { return }

            guard fileURL.startAccessingSecurityScopedResource() else {
                error = "Unable to access the selected file"
                showError = true
                return
            }

            defer { fileURL.stopAccessingSecurityScopedResource() }

            selectedFileURL = fileURL
            selectedFileName = fileURL.lastPathComponent

            if uploadTitle.isEmpty {
                uploadTitle = fileURL.deletingPathExtension().lastPathComponent
            }
        } catch {
            self.error = "Failed to select file: \(error.localizedDescription)"
            showError = true
        }
    }

    private func uploadFile() {
        guard let fileURL = selectedFileURL else { return }

        let title = uploadTitle.trimmingCharacters(in: .whitespaces)

        Task {
            do {
                _ = try await store.uploadAudio(fileURL: fileURL, title: title)

                selectedFileURL = nil
                selectedFileName = ""
                uploadTitle = ""
                transcriptionMode = .quality
            } catch {
                self.error = error.localizedDescription
                showError = true
            }
        }
    }
}

#Preview {
    UploadView()
        .environmentObject(TranscriptionStore())
}
