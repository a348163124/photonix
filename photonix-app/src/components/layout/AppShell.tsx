import { useAppStore } from "@/stores/appStore";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LibraryScreen } from "@/components/library/LibraryScreen";
import { EditorScreen } from "@/components/editor/EditorScreen";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { GenerateScreen } from "@/components/generate/GenerateScreen";
import { StyleScreen } from "@/components/style/StyleScreen";
import { PromptCenterScreen } from "@/components/promptCenter/PromptCenterScreen";

export function AppShell() {
  const currentView = useAppStore((s) => s.currentView);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ErrorBoundary>
            {currentView === "generate" && <GenerateScreen />}
            {currentView === "library" && <LibraryScreen />}
            {currentView === "editor" && <EditorScreen />}
            {currentView === "style" && <StyleScreen />}
            {currentView === "promptCenter" && <PromptCenterScreen />}
            {currentView === "settings" && <SettingsScreen />}
          </ErrorBoundary>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
