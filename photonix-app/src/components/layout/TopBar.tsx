import { useAppStore } from "@/stores/appStore";

export function TopBar() {
  const currentView = useAppStore((s) => s.currentView);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const jobMessage = useAppStore((s) => s.jobMessage);

  return (
    <header className="flex h-10 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-wide text-neutral-200">
          Photonix
        </span>
        <span className="text-xs text-neutral-500 capitalize">{currentView}</span>
      </div>
      <div className="flex items-center gap-2">
        {isProcessing && (
          <span className="text-xs text-amber-400 animate-pulse">
            {jobMessage ?? "Processing..."}
          </span>
        )}
      </div>
    </header>
  );
}
