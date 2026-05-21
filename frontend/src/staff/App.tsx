import { BootstrapProvider } from "@scc/state/BootstrapContext";
import { ConfirmProvider } from "@scc/state/ConfirmContext";
import { StepUpProvider } from "@scc/state/StepUpContext";
import { AppShell } from "@scc/components/shell/AppShell";
import "@scc/styles/scc.css";

export default function App() {
  return (
    <BootstrapProvider>
      <ConfirmProvider>
        <StepUpProvider>
          <AppShell />
        </StepUpProvider>
      </ConfirmProvider>
    </BootstrapProvider>
  );
}
