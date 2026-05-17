import { useAppStore } from "@/stores/appStore";
import { useTranslation } from "@/i18n";
import type { AppView } from "@/types";

interface NavItem {
  view: AppView;
  labelKey: string;
  icon: string;
}

const navItems: NavItem[] = [
  { view: "generate", labelKey: "nav.generate", icon: "✨" },
  { view: "library", labelKey: "nav.library", icon: "📷" },
  { view: "editor", labelKey: "nav.editor", icon: "✏️" },
  { view: "style", labelKey: "nav.style", icon: "🎨" },
  { view: "promptCenter", labelKey: "nav.promptCenter", icon: "📚" },
  { view: "settings", labelKey: "nav.settings", icon: "⚙️" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);

  return (
    <aside className="flex w-14 flex-col items-center gap-1 border-r border-neutral-800 bg-neutral-900 py-3">
      {navItems.map((item) => {
        const label = t(item.labelKey);
        return (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg transition-colors ${
              currentView === item.view
                ? "bg-neutral-700 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
            title={label}
            aria-label={label}
          >
            {item.icon}
          </button>
        );
      })}
    </aside>
  );
}
