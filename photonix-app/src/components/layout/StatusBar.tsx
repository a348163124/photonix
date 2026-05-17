import { useSettingsStore } from "@/stores/settingsStore";

export function StatusBar() {
  const provider = useSettingsStore((s) => s.provider);
  const hasApiKey = useSettingsStore((s) => s.hasApiKey);

  return (
    <footer
      className="flex h-6 items-center justify-between px-5"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        color: "var(--muted)",
        fontSize: 11,
      }}
    >
      <div className="flex items-center gap-3">
        <span>{provider.imageModel}</span>
        <span>·</span>
        <span>{provider.textModel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: hasApiKey ? "var(--accent)" : "var(--muted-2)",
            }}
          />
          {hasApiKey ? "API Key" : "—"}
        </span>
      </div>
    </footer>
  );
}
