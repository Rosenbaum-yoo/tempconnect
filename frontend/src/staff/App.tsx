import { BootstrapProvider } from "@scc/state/BootstrapContext";
import { ToastProvider } from "@scc/state/ToastContext";
import { ConfirmProvider } from "@scc/state/ConfirmContext";
import { StepUpProvider } from "@scc/state/StepUpContext";
import { AppShell } from "@scc/components/shell/AppShell";
import "@scc/styles/scc.css";

export default function App() {
  return (
    <BootstrapProvider>
      <ToastProvider>
        <ConfirmProvider>
          <StepUpProvider>
            <AppShell />
          </StepUpProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BootstrapProvider>
  );
}
