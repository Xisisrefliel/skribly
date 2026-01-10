import SwiftUI

@main
struct LectureApp: App {
    @StateObject private var transcriptionStore = TranscriptionStore()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(transcriptionStore)
        }
    }
}
