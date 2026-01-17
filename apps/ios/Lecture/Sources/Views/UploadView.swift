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

    enum TranscriptionMode: String, CaseIterable {
        case fast = "Fast"
        case quality = "Quality"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ScrollView {
                    VStack(spacing: 16) {
                        // Header
                        headerSection

                        // Transcription Mode Toggle
                        modeToggleSection

                        // File Selection Area
                        fileSelectionArea

                        // Title Input
                        titleInputSection

                        // Upload Button
                        uploadButtonSection

                        Spacer()
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 20)
                }

                // Upload Progress Overlay
                if store.isUploading {
                    uploadProgressOverlay
                }
            }
            .navigationTitle("Upload Recording")
            .navigationBarTitleDisplayMode(.inline)
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

    // MARK: - Header Section
    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundColor(.status(.purple))
                    .frame(width: 40, height: 40)
                    .background(Color.status(.purpleSoft))
                    .cornerRadius(12)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Upload Recording")
                        .font(.system(.headline, design: .default))
                    Text("Add a new recording to transcribe")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.border, lineWidth: 1)
            )
        }
    }

    // MARK: - Mode Toggle Section
    private var modeToggleSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Transcription Mode")
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text("Choose speed vs accuracy")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            HStack(spacing: 12) {
                ForEach(TranscriptionMode.allCases, id: \.self) { mode in
                    Button(action: { transcriptionMode = mode }) {
                        HStack(spacing: 8) {
                            Image(systemName: mode == .fast ? "bolt.fill" : "sparkles")
                            Text(mode.rawValue)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(transcriptionMode == mode ? .white : .secondary)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(transcriptionMode == mode
                                    ? (mode == .fast ? Color.status(.warning) : Color.status(.purple))
                                    : Color(.systemGray6)
                                )
                        )
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.border, lineWidth: 1)
        )
    }

    // MARK: - File Selection Area
    private var fileSelectionArea: some View {
        VStack(spacing: 16) {
            Button(action: { showFilePicker = true }) {
                VStack(spacing: 12) {
                    if let fileName = selectedFileName.split(separator: "/").last {
                        VStack(spacing: 8) {
                            HStack(spacing: 8) {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.title2)
                                    .foregroundColor(.status(.success))

                                Text(String(fileName))
                                    .lineLimit(1)
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                    .truncationMode(.tail)

                                Spacer()
                            }
                            .padding(.vertical, 12)
                            .padding(.horizontal, 16)
                            .background(Color.status(.successSoft))
                            .cornerRadius(12)
                        }
                    } else {
                        VStack(spacing: 16) {
                            VStack(spacing: 8) {
                                Image(systemName: "arrow.down.doc")
                                    .font(.system(size: 32))
                                    .foregroundColor(.secondary)

                                Text("Drop files here or click to browse")
                                    .font(.body)
                                    .fontWeight(.semibold)

                                Text("Upload recordings or documents to generate study notes")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                            }

                            VStack(spacing: 8) {
                                HStack(spacing: 8) {
                                    ForEach(["MP3", "M4A", "WAV", "MP4", "PDF", "PPTX", "DOCX"], id: \.self) { format in
                                        Text(format)
                                            .font(.caption2)
                                            .fontWeight(.medium)
                                            .foregroundColor(.secondary)
                                            .padding(.horizontal, 10)
                                            .padding(.vertical, 6)
                                            .background(Color(.systemGray6))
                                            .cornerRadius(8)
                                    }
                                }
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.border, lineWidth: 2, dash: 4)
            )
        }
    }

    // MARK: - Title Input Section
    private var titleInputSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(selectedFileURL != nil ? "Batch Title" : "Title")
                .font(.subheadline)
                .fontWeight(.medium)

            TextField("Enter a title for your recording", text: $uploadTitle)
                .font(.body)
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .background(Color(.systemBackground))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.border, lineWidth: 1)
                )
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.border, lineWidth: 1)
        )
    }

    // MARK: - Upload Button Section
    private var uploadButtonSection: some View {
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
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .font(.body)
            .fontWeight(.semibold)
            .foregroundColor(.white)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(selectedFileURL != nil && !uploadTitle.isEmpty ? Color.primary : Color(.systemGray4))
            )
        }
        .disabled(selectedFileURL == nil || uploadTitle.isEmpty)
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.border, lineWidth: 1)
        )
    }

    // MARK: - Upload Progress Overlay
    private var uploadProgressOverlay: some View {
        ZStack {
            Color.black.opacity(0.3)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                ProgressView(value: store.uploadProgress)
                    .scaleEffect(1.2, anchor: .center)

                VStack(spacing: 4) {
                    Text("Generating notes for \(selectedFileName.split(separator: "/").last ?? "file")...")
                        .font(.subheadline)
                        .fontWeight(.semibold)

                    Text("\(Int(store.uploadProgress * 100))%")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .padding(20)
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(radius: 8)
        }
    }

    // MARK: - File Handling
    private func handleFileSelection(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard let fileURL = urls.first else { return }

            // Check if we can access the file
            guard fileURL.startAccessingSecurityScopedResource() else {
                error = "Unable to access the selected file"
                showError = true
                return
            }

            defer { fileURL.stopAccessingSecurityScopedResource() }

            selectedFileURL = fileURL
            selectedFileName = fileURL.lastPathComponent

            // Pre-fill title from filename
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
        let mode: String = transcriptionMode == .fast ? "fast" : "quality"

        Task {
            do {
                _ = try await store.uploadAudio(fileURL: fileURL, title: title)

                // Reset form on success
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

// MARK: - Color Extensions
extension Color {
    static func status(_ type: StatusColorType) -> Color {
        switch type {
        case .purple:
            return Color(red: 0.7, green: 0.4, blue: 0.9)
        case .purpleSoft:
            return Color(red: 0.7, green: 0.4, blue: 0.9).opacity(0.15)
        case .warning:
            return Color(red: 1.0, green: 0.7, blue: 0.0)
        case .success:
            return Color(red: 0.2, green: 0.8, blue: 0.4)
        case .successSoft:
            return Color(red: 0.2, green: 0.8, blue: 0.4).opacity(0.15)
        }
    }

    static var border: Color {
        Color(.systemGray4)
    }

    enum StatusColorType {
        case purple, purpleSoft, warning, success, successSoft
    }
}

#Preview {
    UploadView()
        .environmentObject(TranscriptionStore())
}
