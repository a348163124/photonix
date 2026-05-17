import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";

/**
 * Global keyboard shortcuts handler.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // Don't intercept when typing in inputs
      if (isInput) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Navigation
      if (e.key === "1" && ctrl) {
        e.preventDefault();
        useAppStore.getState().setView("library");
      }
      if (e.key === "2" && ctrl) {
        e.preventDefault();
        useAppStore.getState().setView("editor");
      }
      if (e.key === "3" && ctrl) {
        e.preventDefault();
        useAppStore.getState().setView("settings");
      }

      // Editor shortcuts
      if (useAppStore.getState().currentView === "editor") {
        // B for brush
        if (e.key === "b" && !ctrl) {
          useEditorStore.getState().setBrushMode("brush");
        }
        // E for erase
        if (e.key === "e" && !ctrl) {
          useEditorStore.getState().setBrushMode("erase");
        }
        // V for view (no brush)
        if (e.key === "v" && !ctrl) {
          useEditorStore.getState().setBrushMode("none");
        }
        // [ and ] for brush size
        if (e.key === "[") {
          const current = useEditorStore.getState().brushSize;
          useEditorStore.getState().setBrushSize(Math.max(1, current - 5));
        }
        if (e.key === "]") {
          const current = useEditorStore.getState().brushSize;
          useEditorStore.getState().setBrushSize(Math.min(200, current + 5));
        }
        // Escape to go back to library
        if (e.key === "Escape") {
          useAppStore.getState().setView("library");
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
