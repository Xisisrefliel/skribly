import SwiftUI
import UniformTypeIdentifiers

struct HomeView: View {
    @EnvironmentObject var store: TranscriptionStore
    @State private var showFilePicker = false
    @State private var showTitlePrompt = false
    @State private var selectedFileURL: URL?
    @State private var transcriptionTitle = ""
    @State private var showError = false
    @State private var showDeleteConfirmation = false
    @State private var showExportOptions = false
    @State private var shareURLs: [URL] = []
    @State private var showShareSheet = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                if store.transcriptions.isEmpty && !store.isLoading {
                    emptyState
                } else {
                    transcriptionList
                }
                
                // Upload progress overlay
                if store.isUploading {
                    uploadProgressOverlay
                }
                
                // Batch operation progress overlay
                if store.isBatchOperationInProgress {
                    batchOperationOverlay
                }
            }
            .navigationTitle(store.isSelectionMode ? "\(store.selectedCount) Selected" : "Lectures")
            .toolbar {
                if store.isSelectionMode {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") {
                            store.exitSelectionMode()
                        }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button(store.selectedCount == store.transcriptions.count ? "Deselect All" : "Select All") {
                            if store.selectedCount == store.transcriptions.count {
                                store.deselectAll()
                            } else {
                                store.selectAll()
                            }
                        }
                    }
                } else {
                    ToolbarItem(placement: .cancellationAction) {
                        if !store.transcriptions.isEmpty {
                            Button("Select") {
                                store.enterSelectionMode()
                            }
                        }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showFilePicker = true
                        } label: {
                            Image(systemName: "plus.circle.fill")
                                .font(.title2)
                        }
                        .disabled(store.isUploading)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if store.isSelectionMode {
                    batchActionBar
                }
            }
            .refreshable {
                await store.fetchTranscriptions()
            }
            .fileImporter(
                isPresented: $showFilePicker,
                allowedContentTypes: [
                    // Audio formats
                    .audio, .mpeg4Audio, .mp3, .wav, .aiff,
                    // Video formats
                    .movie, .video, .mpeg4Movie, .quickTimeMovie, .avi,
                    // MKV format (custom UTType)
                    UTType(filenameExtension: "mkv") ?? .movie
                ],
                allowsMultipleSelection: false
            ) { result in
                handleFileSelection(result)
            }
            .alert("Name Your Lecture", isPresented: $showTitlePrompt) {
                TextField("Lecture Title", text: $transcriptionTitle)
                Button("Cancel", role: .cancel) {
                    cleanupFileSelection()
                }
                Button("Upload") {
                    uploadSelectedFile()
                }
            } message: {
                Text("Enter a title for this lecture recording")
            }
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {
                    store.error = nil
                }
            } message: {
                Text(store.error ?? "An unknown error occurred")
            }
            .onChange(of: store.error) { _, newValue in
                if newValue != nil {
                    showError = true
                }
            }
        }
    }
    
    // MARK: - Subviews
    
    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "waveform.circle")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            
            Text("No Lectures Yet")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Tap the + button to upload\na lecture recording")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
    
    private var transcriptionList: some View {
        List {
            if store.processingCount > 0 && !store.isSelectionMode {
                processingBanner
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
            }
            
            ForEach(store.transcriptions) { transcription in
                if store.isSelectionMode {
                    SelectableTranscriptionRow(
                        transcription: transcription,
                        isSelected: store.isSelected(id: transcription.id),
                        onToggle: { store.toggleSelection(id: transcription.id) }
                    )
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
                } else {
                    NavigationLink(destination: TranscriptionDetailView(transcription: transcription)) {
                        TranscriptionRow(transcription: transcription)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            Task {
                                await store.deleteTranscription(id: transcription.id)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
    }
    
    private var processingBanner: some View {
        HStack(spacing: 10) {
            ProgressView()
                .scaleEffect(0.8)
            Text("\(store.processingCount) lecture\(store.processingCount == 1 ? "" : "s") processing...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
    }
    
    private var uploadProgressOverlay: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
            
            VStack(spacing: 20) {
                ProgressView(value: store.uploadProgress)
                    .progressViewStyle(.circular)
                    .scaleEffect(1.5)
                
                Text("Uploading...")
                    .font(.headline)
                
                Text("\(Int(store.uploadProgress * 100))%")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(40)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }
    
    private var batchOperationOverlay: some View {
        ZStack {
            Color.black.opacity(0.4)
                .ignoresSafeArea()
            
            VStack(spacing: 20) {
                ProgressView()
                    .scaleEffect(1.5)
                
                Text("Processing...")
                    .font(.headline)
            }
            .padding(40)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }
    
    private var batchActionBar: some View {
        VStack(spacing: 0) {
            Divider()
            HStack(spacing: 24) {
                Button {
                    showExportOptions = true
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.title2)
                        Text("Export")
                            .font(.caption)
                    }
                }
                .disabled(store.selectedCount == 0)
                
                Spacer()
                
                Button(role: .destructive) {
                    showDeleteConfirmation = true
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: "trash")
                            .font(.title2)
                        Text("Delete")
                            .font(.caption)
                    }
                }
                .disabled(store.selectedCount == 0)
            }
            .padding(.horizontal, 40)
            .padding(.vertical, 12)
            .background(.bar)
        }
        .confirmationDialog(
            "Delete \(store.selectedCount) Lecture\(store.selectedCount == 1 ? "" : "s")?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Task {
                    await store.deleteSelectedTranscriptions()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action cannot be undone.")
        }
        .confirmationDialog(
            "Export \(store.selectedCount) Lecture\(store.selectedCount == 1 ? "" : "s")",
            isPresented: $showExportOptions,
            titleVisibility: .visible
        ) {
            Button("Export as Structured PDF") {
                Task {
                    let urls = await store.generatePDFsForSelected(type: "structured")
                    if !urls.isEmpty {
                        shareURLs = urls
                        showShareSheet = true
                    }
                }
            }
            Button("Export as Raw PDF") {
                Task {
                    let urls = await store.generatePDFsForSelected(type: "raw")
                    if !urls.isEmpty {
                        shareURLs = urls
                        showShareSheet = true
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .sheet(isPresented: $showShareSheet) {
            if !shareURLs.isEmpty {
                ShareSheet(items: shareURLs)
            }
        }
    }
    
    // MARK: - Actions
    
    private func handleFileSelection(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            
            // Start accessing the security-scoped resource
            guard url.startAccessingSecurityScopedResource() else {
                store.error = "Unable to access the selected file"
                return
            }
            
            selectedFileURL = url
            transcriptionTitle = url.deletingPathExtension().lastPathComponent
            showTitlePrompt = true
            
        case .failure(let error):
            store.error = error.localizedDescription
        }
    }
    
    private func cleanupFileSelection() {
        if let url = selectedFileURL {
            url.stopAccessingSecurityScopedResource()
        }
        selectedFileURL = nil
        transcriptionTitle = ""
    }
    
    private func uploadSelectedFile() {
        guard let fileURL = selectedFileURL else { return }
        let title = transcriptionTitle.isEmpty ? "Untitled Lecture" : transcriptionTitle
        
        Task {
            do {
                try await store.uploadAudio(fileURL: fileURL, title: title)
            } catch {
                // Error is already set in the store
                print("Upload failed: \(error)")
            }
            
            // Cleanup after upload completes (success or failure)
            fileURL.stopAccessingSecurityScopedResource()
            selectedFileURL = nil
            transcriptionTitle = ""
        }
    }
}

// MARK: - Transcription Row

struct TranscriptionRow: View {
    let transcription: Transcription
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text(transcription.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                Spacer(minLength: 8)
                
                statusBadge
            }
            
            if transcription.status == .processing || transcription.status == .structuring {
                ProgressView(value: transcription.progress)
                    .tint(.blue)
            }
            
            if transcription.status == .completed || transcription.status == .error {
                Text(transcription.previewText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            
            HStack {
                if let date = transcription.createdAtDate {
                    Text(date, style: .date)
                }
                
                Spacer()
                
                if let duration = transcription.audioDuration, duration > 0 {
                    Label(transcription.formattedDuration, systemImage: "clock")
                }
            }
            .font(.caption)
            .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
    
    @ViewBuilder
    private var statusBadge: some View {
        switch transcription.status {
        case .pending:
            HStack(spacing: 4) {
                Image(systemName: "clock")
                Text("Pending")
            }
            .font(.caption)
            .foregroundStyle(.orange)
        case .processing:
            HStack(spacing: 4) {
                Image(systemName: "waveform")
                Text("\(transcription.progressPercentage)%")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.blue)
        case .structuring:
            HStack(spacing: 4) {
                Image(systemName: "sparkles")
                Text("Structuring")
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(.purple)
        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.red)
        }
    }
}

#Preview {
    HomeView()
        .environmentObject(TranscriptionStore())
}

// MARK: - Selectable Transcription Row

struct SelectableTranscriptionRow: View {
    let transcription: Transcription
    let isSelected: Bool
    let onToggle: () -> Void
    
    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(isSelected ? .blue : .secondary)
                    .contentTransition(.identity)
                
                TranscriptionRow(transcription: transcription)
            }
        }
        .buttonStyle(.plain)
        .animation(nil, value: isSelected)
    }
}
