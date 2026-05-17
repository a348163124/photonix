import { AppShell } from "@/components/layout/AppShell";
import { ToastContainer } from "@/components/ui/Toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboard";

function App() {
  useKeyboardShortcuts();

  return (
    <>
      <AppShell />
      <ToastContainer />
    </>
  );
}

export default App;
