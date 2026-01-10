import SwiftUI
import PDFKit

enum ViewMode: String, CaseIterable {
    case structured = "Notes"
    case raw = "Raw"
}

struct IdentifiableURL: Identifiable {
    let id = UUID()
    let url: URL
}

struct TranscriptionDetailView: View {
    @EnvironmentObject var store: TranscriptionStore
    @Environment(\.dismiss) private var dismiss
    
    let transcription: Transcription
    
    @State private var currentTranscription: Transcription
    @State private var showDeleteConfirmation = false
    @State private var shareURL: IdentifiableURL?
    @State private var viewMode: ViewMode = .structured
    @State private var isGeneratingPDF = false
    
    init(transcription: Transcription) {
        self.transcription = transcription
        self._currentTranscription = State(initialValue: transcription)
    }
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // Status section
                statusSection
                
                // View mode picker (only show if structured text is available)
                if currentTranscription.hasStructuredText {
                    Picker("View Mode", selection: $viewMode) {
                        ForEach(ViewMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                
                Divider()
                
                // Content
                contentView
            }
            .padding()
        }
        .navigationTitle(currentTranscription.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if isGeneratingPDF {
                    ProgressView()
                        .scaleEffect(0.8)
                } else {
                    Menu {
                        if currentTranscription.status == .completed {
                            // Export PDF submenu
                            Menu {
                                if currentTranscription.hasStructuredText {
                                    Button {
                                        Task { await exportAsPDF(structured: true) }
                                    } label: {
                                        Label("Structured", systemImage: "text.alignleft")
                                    }
                                }
                                
                                if currentTranscription.transcriptionText != nil {
                                    Button {
                                        Task { await exportAsPDF(structured: false) }
                                    } label: {
                                        Label("Raw Transcription", systemImage: "waveform")
                                    }
                                }
                            } label: {
                                Label("Export PDF", systemImage: "doc.richtext")
                            }
                            
                            Divider()
                        }
                        
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
        .confirmationDialog(
            "Delete Lecture?",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                deleteTranscription()
            }
        } message: {
            Text("This will permanently delete the lecture and its transcription.")
        }
        .sheet(item: $shareURL) { item in
            ShareSheet(items: [item.url])
        }
        .task {
            await refreshIfNeeded()
        }
    }
    
    // MARK: - Content View
    
    @ViewBuilder
    private var contentView: some View {
        if currentTranscription.status == .error {
            errorSection
        } else if currentTranscription.isProcessing {
            processingSection
        } else if viewMode == .structured && currentTranscription.hasStructuredText {
            MarkdownView(text: currentTranscription.structuredText ?? "")
        } else if let text = currentTranscription.transcriptionText, !text.isEmpty {
            Text(text)
                .font(.body)
                .textSelection(.enabled)
        } else {
            Text("No transcription available.")
                .foregroundStyle(.secondary)
                .italic()
        }
    }
    
    private var processingSection: some View {
        VStack(spacing: 16) {
            ProgressView(value: currentTranscription.progress)
                .progressViewStyle(.linear)
            
            HStack {
                if currentTranscription.status == .structuring {
                    Image(systemName: "sparkles")
                        .foregroundStyle(.purple)
                    Text("Structuring notes...")
                } else {
                    Image(systemName: "waveform")
                        .foregroundStyle(.blue)
                    Text("Transcribing audio...")
                }
                
                Spacer()
                
                Text("\(currentTranscription.progressPercentage)%")
                    .foregroundStyle(.secondary)
            }
            .font(.subheadline)
        }
        .padding(.vertical, 20)
    }
    
    // MARK: - Subviews
    
    private var statusSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                statusLabel
                
                if let date = currentTranscription.createdAtDate {
                    Text(date, format: .dateTime)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            
            Spacer()
            
            if currentTranscription.audioDuration != nil {
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Duration")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(currentTranscription.formattedDuration)
                        .font(.headline)
                }
            }
        }
    }
    
    @ViewBuilder
    private var statusLabel: some View {
        switch currentTranscription.status {
        case .pending:
            Label("Pending", systemImage: "clock.fill")
                .foregroundStyle(.orange)
        case .processing:
            HStack {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Transcribing...")
            }
            .foregroundStyle(.blue)
        case .structuring:
            HStack {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Structuring...")
            }
            .foregroundStyle(.purple)
        case .completed:
            Label("Completed", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        case .error:
            Label("Error", systemImage: "exclamationmark.circle.fill")
                .foregroundStyle(.red)
        }
    }
    
    private var errorSection: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(.red)
            
            Text("Transcription Failed")
                .font(.headline)
            
            if let errorMessage = currentTranscription.errorMessage {
                Text(errorMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
    
    // MARK: - Actions
    
    private func refreshIfNeeded() async {
        while currentTranscription.isProcessing {
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            if let updated = store.transcriptions.first(where: { $0.id == transcription.id }) {
                currentTranscription = updated
            } else {
                await store.refreshTranscription(id: transcription.id)
                if let updated = store.transcriptions.first(where: { $0.id == transcription.id }) {
                    currentTranscription = updated
                }
            }
        }
    }
    
    private func exportAsPDF(structured: Bool) async {
        isGeneratingPDF = true
        
        // Capture values needed for background task
        let transcriptionId = currentTranscription.id
        let transcriptionTitle = currentTranscription.title
        let type = structured ? "structured" : "raw"
        // Pass pdfGeneratedAt for cache validation (only relevant for structured PDFs)
        let pdfGeneratedAt = structured ? currentTranscription.pdfGeneratedAt : nil
        
        do {
            // Run PDF generation off main actor to prevent UI blocking
            let pdfURL = try await Task.detached(priority: .userInitiated) {
                try await APIClient.shared.generatePDF(
                    id: transcriptionId,
                    type: type,
                    title: transcriptionTitle,
                    pdfGeneratedAt: pdfGeneratedAt
                )
            }.value
            shareURL = IdentifiableURL(url: pdfURL)
        } catch {
            store.error = "Failed to generate PDF: \(error.localizedDescription)"
        }
        
        isGeneratingPDF = false
    }
    
    private func deleteTranscription() {
        Task {
            await store.deleteTranscription(id: transcription.id)
            dismiss()
        }
    }
}

// MARK: - Markdown View

struct MarkdownView: View {
    let text: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(parseMarkdown(text).enumerated()), id: \.offset) { index, element in
                MarkdownElementView(element: element)
            }
        }
        .textSelection(.enabled)
    }
    
    private func parseMarkdown(_ text: String) -> [MarkdownElement] {
        var elements: [MarkdownElement] = []
        let lines = text.components(separatedBy: "\n")
        var index = 0
        var currentParagraph = ""
        var bulletItems: [String] = []
        var numberedItems: [String] = []
        
        func flushParagraph() {
            if !currentParagraph.isEmpty {
                elements.append(.paragraph(currentParagraph))
                currentParagraph = ""
            }
        }
        
        func flushBulletList() {
            if !bulletItems.isEmpty {
                elements.append(.bulletList(bulletItems))
                bulletItems = []
            }
        }
        
        func flushNumberedList() {
            if !numberedItems.isEmpty {
                elements.append(.numberedList(numberedItems))
                numberedItems = []
            }
        }
        
        func flushAll() {
            flushParagraph()
            flushBulletList()
            flushNumberedList()
        }
        
        while index < lines.count {
            let line = lines[index]
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)
            
            // Code block
            if trimmedLine.hasPrefix("```") {
                flushAll()
                var codeLines: [String] = []
                let language = String(trimmedLine.dropFirst(3))
                index += 1
                while index < lines.count && !lines[index].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    codeLines.append(lines[index])
                    index += 1
                }
                elements.append(.codeBlock(codeLines.joined(separator: "\n"), language: language.isEmpty ? nil : language))
                index += 1
                continue
            }
            
            // Table detection
            if trimmedLine.contains("|") && !trimmedLine.hasPrefix("|--") {
                // Check if next line is separator
                let nextIndex = index + 1
                if nextIndex < lines.count {
                    let nextLine = lines[nextIndex].trimmingCharacters(in: .whitespaces)
                    if nextLine.contains("|") && (nextLine.contains("---") || nextLine.contains(":-")) {
                        flushAll()
                        // Parse table
                        var tableRows: [[String]] = []
                        var tableIndex = index
                        
                        while tableIndex < lines.count {
                            let tableLine = lines[tableIndex].trimmingCharacters(in: .whitespaces)
                            if tableLine.isEmpty || (!tableLine.contains("|")) {
                                break
                            }
                            // Skip separator line
                            if tableLine.contains("---") || tableLine.contains(":-") {
                                tableIndex += 1
                                continue
                            }
                            // Parse cells
                            let cells = tableLine
                                .trimmingCharacters(in: CharacterSet(charactersIn: "|"))
                                .components(separatedBy: "|")
                                .map { $0.trimmingCharacters(in: .whitespaces) }
                            if !cells.isEmpty {
                                tableRows.append(cells)
                            }
                            tableIndex += 1
                        }
                        
                        if !tableRows.isEmpty {
                            elements.append(.table(tableRows))
                        }
                        index = tableIndex
                        continue
                    }
                }
            }
            
            // Horizontal rule
            if trimmedLine == "---" || trimmedLine == "***" || trimmedLine == "___" {
                flushAll()
                elements.append(.horizontalRule)
                index += 1
                continue
            }
            
            // Headers
            if trimmedLine.hasPrefix("#### ") {
                flushAll()
                elements.append(.header4(String(trimmedLine.dropFirst(5))))
                index += 1
                continue
            }
            if trimmedLine.hasPrefix("### ") {
                flushAll()
                elements.append(.header3(String(trimmedLine.dropFirst(4))))
                index += 1
                continue
            }
            if trimmedLine.hasPrefix("## ") {
                flushAll()
                elements.append(.header2(String(trimmedLine.dropFirst(3))))
                index += 1
                continue
            }
            if trimmedLine.hasPrefix("# ") {
                flushAll()
                elements.append(.header1(String(trimmedLine.dropFirst(2))))
                index += 1
                continue
            }
            
            // Blockquote
            if trimmedLine.hasPrefix("> ") {
                flushAll()
                var quoteLines: [String] = []
                while index < lines.count {
                    let quoteLine = lines[index].trimmingCharacters(in: .whitespaces)
                    if quoteLine.hasPrefix("> ") {
                        quoteLines.append(String(quoteLine.dropFirst(2)))
                        index += 1
                    } else if quoteLine.hasPrefix(">") {
                        quoteLines.append(String(quoteLine.dropFirst(1)))
                        index += 1
                    } else {
                        break
                    }
                }
                elements.append(.blockquote(quoteLines.joined(separator: " ")))
                continue
            }
            
            // Bullet list
            if trimmedLine.hasPrefix("- ") || trimmedLine.hasPrefix("* ") {
                flushParagraph()
                flushNumberedList()
                bulletItems.append(String(trimmedLine.dropFirst(2)))
                index += 1
                continue
            }
            
            // Numbered list
            if let match = trimmedLine.range(of: #"^\d+\.\s+"#, options: .regularExpression) {
                flushParagraph()
                flushBulletList()
                numberedItems.append(String(trimmedLine[match.upperBound...]))
                index += 1
                continue
            }
            
            // Empty line
            if trimmedLine.isEmpty {
                flushAll()
                index += 1
                continue
            }
            
            // Regular paragraph text
            flushBulletList()
            flushNumberedList()
            if currentParagraph.isEmpty {
                currentParagraph = trimmedLine
            } else {
                currentParagraph += " " + trimmedLine
            }
            index += 1
        }
        
        flushAll()
        return elements
    }
}

// MARK: - Markdown Elements

enum MarkdownElement {
    case header1(String)
    case header2(String)
    case header3(String)
    case header4(String)
    case paragraph(String)
    case bulletList([String])
    case numberedList([String])
    case codeBlock(String, language: String?)
    case inlineCode(String)
    case blockquote(String)
    case table([[String]])
    case horizontalRule
}

// MARK: - Markdown Element View

struct MarkdownElementView: View {
    let element: MarkdownElement
    
    var body: some View {
        switch element {
        case .header1(let text):
            Text(InlineMarkdownParser.parse(text))
                .font(.title)
                .fontWeight(.bold)
                .padding(.top, 12)
                .padding(.bottom, 4)
        
        case .header2(let text):
            Text(InlineMarkdownParser.parse(text))
                .font(.title2)
                .fontWeight(.semibold)
                .padding(.top, 10)
                .padding(.bottom, 2)
        
        case .header3(let text):
            Text(InlineMarkdownParser.parse(text))
                .font(.title3)
                .fontWeight(.medium)
                .padding(.top, 8)
        
        case .header4(let text):
            Text(InlineMarkdownParser.parse(text))
                .font(.headline)
                .padding(.top, 6)
        
        case .paragraph(let text):
            Text(InlineMarkdownParser.parse(text))
                .font(.body)
                .lineSpacing(4)
        
        case .bulletList(let items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 10) {
                        Text("•")
                            .font(.body)
                            .foregroundStyle(.primary)
                        Text(InlineMarkdownParser.parse(item))
                            .font(.body)
                    }
                }
            }
        
        case .numberedList(let items):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .top, spacing: 10) {
                        Text("\(index + 1).")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .frame(minWidth: 20, alignment: .trailing)
                        Text(InlineMarkdownParser.parse(item))
                            .font(.body)
                    }
                }
            }
        
        case .codeBlock(let code, let language):
            VStack(alignment: .leading, spacing: 0) {
                if let lang = language, !lang.isEmpty {
                    Text(lang)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 12)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                }
                Text(code)
                    .font(.system(.body, design: .monospaced))
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        
        case .inlineCode(let code):
            Text(code)
                .font(.system(.body, design: .monospaced))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color(.systemGray5))
                .clipShape(RoundedRectangle(cornerRadius: 4))
        
        case .blockquote(let text):
            HStack(spacing: 0) {
                Rectangle()
                    .fill(Color.accentColor.opacity(0.5))
                    .frame(width: 4)
                Text(InlineMarkdownParser.parse(text))
                    .font(.body)
                    .italic()
                    .foregroundStyle(.secondary)
                    .padding(.leading, 12)
                    .padding(.vertical, 8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        
        case .table(let rows):
            TableView(rows: rows)
        
        case .horizontalRule:
            Divider()
                .padding(.vertical, 8)
        }
    }
}

// MARK: - Table View

struct TableView: View {
    let rows: [[String]]
    
    private var columnCount: Int {
        rows.map { $0.count }.max() ?? 0
    }
    
    private func normalizedRows() -> [[String]] {
        // Ensure all rows have the same number of columns
        rows.map { row in
            var normalized = row
            while normalized.count < columnCount {
                normalized.append("")
            }
            return normalized
        }
    }
    
    var body: some View {
        if rows.isEmpty || columnCount == 0 {
            EmptyView()
        } else {
            let normalized = normalizedRows()
            
            ScrollView(.horizontal, showsIndicators: false) {
                Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                    ForEach(Array(normalized.enumerated()), id: \.offset) { rowIndex, row in
                        GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { colIndex, cell in
                                TableCell(
                                    text: cell,
                                    isHeader: rowIndex == 0,
                                    isEvenRow: rowIndex % 2 == 0,
                                    isLastColumn: colIndex == columnCount - 1
                                )
                            }
                        }
                        
                        if rowIndex < normalized.count - 1 {
                            GridRow {
                                Divider()
                                    .gridCellColumns(columnCount)
                            }
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color(.systemGray4), lineWidth: 1)
                )
            }
        }
    }
}

struct TableCell: View {
    let text: String
    let isHeader: Bool
    let isEvenRow: Bool
    let isLastColumn: Bool
    
    var body: some View {
        HStack(spacing: 0) {
            Text(InlineMarkdownParser.parse(text))
                .font(isHeader ? .subheadline.weight(.semibold) : .subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
            
            if !isLastColumn {
                Divider()
            }
        }
        .background(isHeader ? Color(.systemGray5) : (isEvenRow ? Color(.systemGray6) : Color(.systemBackground)))
    }
}

// MARK: - Inline Markdown Parser

struct InlineMarkdownParser {
    static func parse(_ text: String) -> AttributedString {
        var result = AttributedString()
        var remaining = text
        
        while !remaining.isEmpty {
            // Check for bold+italic (***text*** or ___text___)
            if let match = findPattern(in: remaining, start: "***", end: "***") {
                result += AttributedString(String(remaining.prefix(upTo: match.startIndex)))
                var styled = AttributedString(match.content)
                styled.font = .body.bold().italic()
                result += styled
                remaining = String(remaining.suffix(from: match.endIndex))
                continue
            }
            
            // Check for bold (**text** or __text__)
            if let match = findPattern(in: remaining, start: "**", end: "**") {
                result += AttributedString(String(remaining.prefix(upTo: match.startIndex)))
                var styled = AttributedString(match.content)
                styled.font = .body.bold()
                result += styled
                remaining = String(remaining.suffix(from: match.endIndex))
                continue
            }
            
            // Check for italic (*text* or _text_) - but not inside words for underscore
            if let match = findItalicPattern(in: remaining) {
                result += AttributedString(String(remaining.prefix(upTo: match.startIndex)))
                var styled = AttributedString(match.content)
                styled.font = .body.italic()
                result += styled
                remaining = String(remaining.suffix(from: match.endIndex))
                continue
            }
            
            // Check for inline code (`text`)
            if let match = findPattern(in: remaining, start: "`", end: "`") {
                result += AttributedString(String(remaining.prefix(upTo: match.startIndex)))
                var styled = AttributedString(match.content)
                styled.font = .system(.body, design: .monospaced)
                styled.backgroundColor = .gray.opacity(0.2)
                result += styled
                remaining = String(remaining.suffix(from: match.endIndex))
                continue
            }
            
            // No pattern found, add first character and continue
            if let first = remaining.first {
                result += AttributedString(String(first))
                remaining = String(remaining.dropFirst())
            }
        }
        
        return result
    }
    
    private struct PatternMatch {
        let startIndex: String.Index
        let endIndex: String.Index
        let content: String
    }
    
    private static func findPattern(in text: String, start: String, end: String) -> PatternMatch? {
        guard let startRange = text.range(of: start) else { return nil }
        let afterStart = startRange.upperBound
        guard afterStart < text.endIndex else { return nil }
        
        let searchRange = afterStart..<text.endIndex
        guard let endRange = text.range(of: end, range: searchRange) else { return nil }
        
        let content = String(text[afterStart..<endRange.lowerBound])
        
        // Don't match empty content
        guard !content.isEmpty else { return nil }
        
        return PatternMatch(
            startIndex: startRange.lowerBound,
            endIndex: endRange.upperBound,
            content: content
        )
    }
    
    private static func findItalicPattern(in text: String) -> PatternMatch? {
        // Try asterisk first
        if let match = findPattern(in: text, start: "*", end: "*") {
            // Make sure it's not actually bold (**) 
            let beforeMatch = text.prefix(upTo: match.startIndex)
            if !beforeMatch.hasSuffix("*") {
                return match
            }
        }
        
        // Try underscore (only at word boundaries)
        if let startRange = text.range(of: "_") {
            let afterStart = startRange.upperBound
            if afterStart < text.endIndex {
                if let endRange = text.range(of: "_", range: afterStart..<text.endIndex) {
                    let content = String(text[afterStart..<endRange.lowerBound])
                    if !content.isEmpty && !content.contains(" ") {
                        return PatternMatch(
                            startIndex: startRange.lowerBound,
                            endIndex: endRange.upperBound,
                            content: content
                        )
                    }
                }
            }
        }
        
        return nil
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    NavigationStack {
        TranscriptionDetailView(transcription: Transcription(
            id: "1",
            deviceId: "test",
            title: "Sample Lecture",
            audioUrl: nil,
            audioDuration: 3600,
            transcriptionText: "This is the raw transcription text.",
            structuredText: """
            # Introduction to Computer Science
            
            Computer science fundamentals including algorithms, data structures, and programming paradigms.
            
            ## Key Concepts
            
            - **Algorithm**: A step-by-step procedure for solving a problem
            - **Data Structure**: A way of organizing data in a computer
            - *Variable*: A named storage location in memory
            
            ### Comparison of Data Structures
            
            | Structure | Access | Search | Insert |
            |-----------|--------|--------|--------|
            | Array | O(1) | O(n) | O(n) |
            | Linked List | O(n) | O(n) | O(1) |
            | Hash Table | O(1) | O(1) | O(1) |
            
            ### Programming Basics
            
            Programming involves writing instructions that a computer can execute:
            
            1. Input: Getting data into the program
            2. Processing: Manipulating the data
            3. Output: Displaying results
            
            > The best programs are written with clarity and maintainability in mind.
            
            Use the `print()` function to output results to the console.
            
            ```python
            def hello():
                print("Hello, World!")
            ```
            
            ## Conclusion
            
            Understanding these fundamentals is essential for any aspiring programmer.
            """,
            status: .completed,
            progress: 1.0,
            errorMessage: nil,
            pdfKey: "pdfs/1/structured-sample.pdf",
            pdfGeneratedAt: ISO8601DateFormatter().string(from: Date()),
            createdAt: ISO8601DateFormatter().string(from: Date()),
            updatedAt: ISO8601DateFormatter().string(from: Date())
        ))
    }
    .environmentObject(TranscriptionStore())
}
