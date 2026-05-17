import { useAppStore } from "@/stores/appStore";
import { useTranslation } from "@/i18n";

export function TopBar() {
  const { t } = useTranslation();
  const currentView = useAppStore((s) => s.currentView);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const jobMessage = useAppStore((s) => s.jobMessage);

  const viewKey =
    currentView === "promptCenter" ? "nav.promptCenter" : `nav.${currentView}`;

  return (
    <header
      className="flex h-12 items-center justify-between px-5"
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3">
        <span style={{ color: "var(--fg)", fontWeight: 600, fontSize: 14 }}>
          {t(viewKey)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isProcessing && (
          <span
            className="animate-pulse"
            style={{ color: "var(--warning)", fontSize: 12 }}
          >
            {jobMessage ?? t("common.loading")}
          </span>
        )}
      </div>
    </header>
  );
}
