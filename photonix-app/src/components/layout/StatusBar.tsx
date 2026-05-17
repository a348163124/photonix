import { useSettingsStore } from "@/stores/settingsStore";

export function StatusBar() {
  const provider = useSettingsStore((s) => s.provider);

  return (
    <footer className="flex h-6 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-4 text-[11px] text-neutral-500">
      <div className="flex items-center gap-3">
        <span>{provider.imageModel}</span>
        <span>|</span>
        <span>{provider.textModel}</span>
      </div>
      <div className="flex items-center gap-3">
        <span>Ready</span>
      </div>
    </footer>
  );
}
