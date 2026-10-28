import type { ReactNode } from 'react';
import './AppShell.css';

export default function AppShell({
  brandAction,
  children,
  nav,
}: {
  brandAction?: ReactNode;
  children: ReactNode;
  nav?: ReactNode;
}) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" aria-label="mass home">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="wordmark">
            mass<span className="dot">.</span>
          </span>
        </div>
        {brandAction}
      </header>
      <main className="content" id="main">
        {children}
      </main>
      {nav}
    </div>
  );
}
