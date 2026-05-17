import { useState } from "react";
import { useStyleStore } from "@/stores/styleStore";
import { StyleList } from "./StyleList";
import { StyleDetail } from "./StyleDetail";
import { ReferenceStyleAnalyzer } from "./ReferenceStyleAnalyzer";

type Tab = "library" | "analyze";

export function StyleScreen() {
  const styles = useStyleStore((s) => s.styles);
  const [tab, setTab] = useState<Tab>("library");
  const [selectedId, setSelectedId] = useState<string | null>(
    styles[0]?.id ?? null
  );

  const selected = styles.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      {/* Left list */}
      <div className="flex w-72 flex-col border-r border-neutral-800 bg-neutral-900">
        <div className="flex border-b border-neutral-800">
          {(["library", "analyze"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-blue-500 text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "library" ? "My Styles" : "Analyze Reference"}
            </button>
          ))}
        </div>
        {tab === "library" && (
          <StyleList
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
            }}
          />
        )}
        {tab === "analyze" && (
          <div className="p-3 text-[11px] text-neutral-400">
            <p className="mb-2">
              Pick a reference photo to extract its style as a reusable profile.
            </p>
            <p className="text-[10px] text-neutral-500">
              The reference is sent to your configured provider as a small JPEG
              proxy. Only color, light, and tone are described — never people,
              places, or content.
            </p>
          </div>
        )}
      </div>

      {/* Right detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "library" && selected && (
          <StyleDetail
            style={selected}
            onDeleted={() => {
              setSelectedId(null);
            }}
          />
        )}
        {tab === "library" && !selected && (
          <p className="text-xs text-neutral-500">Select a style on the left.</p>
        )}
        {tab === "analyze" && (
          <ReferenceStyleAnalyzer
            onSaved={(savedId) => {
              setSelectedId(savedId);
              setTab("library");
            }}
          />
        )}
      </div>
    </div>
  );
}
