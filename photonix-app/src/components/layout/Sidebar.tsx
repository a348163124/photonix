import { useAppStore } from "@/stores/appStore";
import { useTranslation } from "@/i18n";
import {
  EditorIcon,
  GenerateIcon,
  LibraryIcon,
  PromptCenterIcon,
  SettingsIcon,
  StyleIcon,
} from "./NavIcons";
import type { AppView } from "@/types";
import type { ComponentType, SVGProps } from "react";

interface NavItem {
  view: AppView;
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const PRIMARY_NAV: NavItem[] = [
  { view: "library", labelKey: "nav.library", Icon: LibraryIcon },
  { view: "editor", labelKey: "nav.editor", Icon: EditorIcon },
  { view: "generate", labelKey: "nav.generate", Icon: GenerateIcon },
  { view: "style", labelKey: "nav.style", Icon: StyleIcon },
  { view: "promptCenter", labelKey: "nav.promptCenter", Icon: PromptCenterIcon },
];

const SECONDARY_NAV: NavItem[] = [
  { view: "settings", labelKey: "nav.settings", Icon: SettingsIcon },
];

export function Sidebar() {
  const { t } = useTranslation();
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);

  return (
    <aside
      className="flex h-full flex-col px-3 py-4"
      style={{
        width: 220,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div
        className="mb-4 flex items-center gap-2.5 px-3 py-2 text-[15px] font-semibold"
        style={{ color: "var(--fg)" }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "var(--accent)",
          }}
        />
        Photonix
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.view}
            item={item}
            active={currentView === item.view}
            onClick={() => setView(item.view)}
            label={t(item.labelKey)}
          />
        ))}
        <div className="mt-auto flex flex-col gap-1 pt-2">
          {SECONDARY_NAV.map((item) => (
            <NavLink
              key={item.view}
              item={item}
              active={currentView === item.view}
              onClick={() => setView(item.view)}
              label={t(item.labelKey)}
            />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function NavLink({
  item,
  active,
  onClick,
  label,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  const { Icon } = item;
  return (
    <button
      onClick={onClick}
      className={`px-nav-item ${active ? "active" : ""}`}
      title={label}
    >
      <Icon aria-hidden />
      <span>{label}</span>
    </button>
  );
}
