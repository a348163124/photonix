import { useAppStore } from "@/stores/appStore";
import type { AppView } from "@/types";

const navItems: { view: AppView; label: string; icon: string }[] = [
  { view: "generate", label: "Generate", icon: "✨" },
  { view: "library", label: "Library", icon: "📷" },
  { view: "editor", label: "Editor", icon: "✏️" },
  { view: "style", label: "Style", icon: "🎨" },
  { view: "settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);

  return (
    <aside className="flex w-14 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-900 py-3">
      {navItems.map((item) => (
        <button
          key={item.view}
          onClick={() => setView(item.view)}
          className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-colors ${
            currentView === item.view
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          }`}
          title={item.label}
          aria-label={item.label}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  );
}
