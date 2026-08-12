import type { ReactNode } from "react";

export default function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <span className="topbar-logo">DECORIT</span>
        {children && <div className="topbar-actions">{children}</div>}
      </div>
    </header>
  );
}
