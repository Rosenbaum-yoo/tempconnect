import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface AppShellProps {
  children: ReactNode;
  pageTitle?: string;
}

export function AppShell({ children, pageTitle }: AppShellProps) {
  return (
    <div className="occ-layout">
      <Sidebar />
      <div className="occ-main-area">
        <Topbar pageTitle={pageTitle} />
        <main className="occ-content">{children}</main>
      </div>
    </div>
  );
}
