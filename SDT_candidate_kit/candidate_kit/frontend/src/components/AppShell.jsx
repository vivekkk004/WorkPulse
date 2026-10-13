// Application shell, ported from MyBridge 3.0 (src/components/AppShell.tsx):
// a collapsible sidebar on desktop, a drawer on mobile, and a sticky header.
import { useEffect, useState } from 'react';
import { Glyph, Icon } from './dashboard-ui';

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* private mode: the toggle still works for this visit */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      {dark ? '☾' : '☀'}
    </button>
  );
}

const COLLAPSE_KEY = 'sidebar:collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AppShell({ nav, route, brandName, areaTitle, areaBadge, userName, roleBadge, children }) {
  const [open, setOpen] = useState(false); // mobile drawer
  // Desktop sidebar: expanded (labels + sections) or collapsed (icon rail). Remembered per browser.
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* not persisted in private mode; the toggle still works */
      }
      return !c;
    });

  // Ctrl/Cmd-B collapses or expands the sidebar.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = Array.from(new Set(nav.map((n) => n.section)));
  const current = nav.find((n) => n.key === route);

  const railItem = (item) => {
    const active = item.key === route;
    return (
      <a
        key={item.key}
        href={`#${item.key}`}
        title={item.label}
        className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-center transition-colors ${
          active ? 'bg-brand font-semibold text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`}
      >
        <Glyph d={item.icon} className="h-5 w-5" />
        <span className="w-full truncate text-[10.5px] font-medium leading-tight">{item.label}</span>
      </a>
    );
  };

  const drawerItem = (item, onNavigate) => {
    const active = item.key === route;
    return (
      <a
        key={item.key}
        href={`#${item.key}`}
        onClick={onNavigate}
        className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
          active ? 'bg-brand font-semibold text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`}
      >
        <span className={active ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}>
          <Glyph d={item.icon} />
        </span>
        <span className="truncate">{item.label}</span>
      </a>
    );
  };

  const logo = <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand font-bold text-white">{brandName.charAt(0)}</div>;

  const brandBlock = (
    <div className="min-w-0">
      <div className="truncate font-semibold leading-tight text-gray-900 dark:text-gray-100">{brandName}</div>
      <span className="mt-0.5 inline-block rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand dark:bg-brand/25 dark:text-white">
        {roleBadge}
      </span>
    </div>
  );

  const sectionList = (onNavigate) =>
    sections.map((s) => (
      <div key={s} className="mb-2">
        <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{s}</div>
        <div className="space-y-0.5">{nav.filter((n) => n.section === s).map((item) => drawerItem(item, onNavigate))}</div>
      </div>
    ));

  return (
    <div className="flex min-h-screen bg-[#eef2f7] dark:bg-transparent">
      {/* Desktop sidebar: expanded (w-64, labels + sections) or collapsed (86px icon rail). */}
      <aside
        className={`sticky top-0 z-40 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 ease-out md:flex dark:border-gray-800 dark:bg-gray-900 ${
          collapsed ? 'w-[86px]' : 'w-64'
        }`}
      >
        {/* The menu (☰) button lives in the sidebar header: beside the brand when expanded,
            alone at the top of the rail when collapsed. */}
        <div className={`flex h-16 shrink-0 items-center border-b border-gray-100 dark:border-gray-800 ${collapsed ? 'justify-center px-2' : 'gap-2.5 pl-4 pr-3'}`}>
          {!collapsed && (
            <>
              <a href="#dashboard" title={areaTitle} className="shrink-0">
                {logo}
              </a>
              <div className="min-w-0 flex-1">{brandBlock}</div>
            </>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          >
            <Glyph d={Icon.menu} className="h-5 w-5" />
          </button>
        </div>

        {collapsed ? (
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">{nav.map(railItem)}</nav>
        ) : (
          <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">{sectionList()}</nav>
        )}
      </aside>

      {/* Mobile drawer */}
      <aside
        className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed top-0 z-30 flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-200 md:hidden dark:border-gray-800 dark:bg-gray-900`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-gray-100 px-4 dark:border-gray-800">
          {logo}
          {brandBlock}
        </div>
        <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">{sectionList(() => setOpen(false))}</nav>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 backdrop-blur md:px-6 dark:border-gray-800 dark:bg-gray-900/90">
          <div className="flex min-w-0 items-center gap-3">
            {/* Phones only: the sidebar is hidden there, so this opens the drawer. */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 md:hidden dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <Glyph d={Icon.menu} className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-semibold leading-tight text-gray-900 dark:text-gray-100">{areaTitle}</h1>
              <div className="hidden text-xs text-gray-400 sm:block dark:text-gray-500">
                {areaBadge}
                {current ? ` · ${current.label}` : ''}
              </div>
            </div>

          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <span className="hidden rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 sm:inline">All times IST</span>
            <ThemeToggle />
            <div className="hidden h-8 w-px bg-gray-200 sm:block dark:bg-gray-700" />
            <div className="flex items-center gap-2.5 rounded-lg py-1 pl-1.5 pr-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{userName.charAt(0)}</div>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{userName}</div>
                <div className="max-w-[12rem] truncate text-xs text-gray-400 dark:text-gray-500">{roleBadge}</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
