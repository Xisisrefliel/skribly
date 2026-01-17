import SwiftUI

enum AppTab: Int {
    case home = 0
    case upload = 1
    case settings = 2
}

struct ContentView: View {
    @State private var selectedTab: AppTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(AppTab.home)
            UploadView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Upload", systemImage: "arrow.up.circle.fill")
                }
                .tag(AppTab.upload)
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(AppTab.settings)
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(TranscriptionStore())
}
