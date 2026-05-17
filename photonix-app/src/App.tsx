import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ToastContainer } from "@/components/ui/Toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboard";
import { bootstrapSettings } from "@/services/settingsBootstrap";

function App() {
  useKeyboardShortcuts();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    bootstrapSettings().finally(() => setBootstrapped(true));
  }, []);

  // Render the shell immediately so the window appears, but gate features
  // that depend on settings inside the relevant screens. We don't block on
  // bootstrap here — failures are non-fatal (we just fall back to defaults).
  // The flag is reserved for future use (e.g. splash, onboarding).
  void bootstrapped;

  return (
    <>
      <AppShell />
      <ToastContainer />
    </>
  );
}

export default App;
