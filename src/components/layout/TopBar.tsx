// TopBar — persistent header across the main view.
// Carries: hamburger (sidebar toggle) · title/ship · edit/view badge · primary
// actions (Enable Edit / Exit Edit) · settings · theme · sign-out.

import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../hooks/useSession';
import { EDITOR_ROLE_LABELS } from '../../domain/constants';
import { Anchor, Edit, Eye, HelpCircle, LogOut, Menu, Moon, Settings, Sun, Unlock } from '../Icons';
import type { Ship } from '../../types/domain';

interface Props {
  ship: Ship | null | undefined;
  onToggleSidebar: () => void;
  onEnableEdit: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onNewVoyage: () => void;
}

export function TopBar({
  ship,
  onToggleSidebar,
  onEnableEdit,
  onOpenSettings,
  onOpenHelp,
  onNewVoyage,
}: Props) {
  const { theme, toggleTheme } = useTheme();
  const { editMode, role, exitEditMode, endSession } = useSession();

  return (
    <header
      className="flex items-center gap-3 px-4 h-14 border-b shrink-0"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      <button
        type="button"
        onClick={onToggleSidebar}
        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" style={{ color: 'var(--color-dim)' }} />
      </button>

      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
          style={{ background: 'var(--color-ocean-500)' }}
          aria-hidden="true"
        >
          <Anchor className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--color-text)' }}>
            Voyage Tracker <span className="opacity-40 font-semibold">v8</span>
            <span className="opacity-60 font-normal"> — {ship?.displayName || '—'}</span>
          </h1>
          <p className="text-[0.6rem] tracking-wider uppercase" style={{ color: 'var(--color-faint)' }}>
            {ship?.code || '—'} · {ship?.yearBuilt || '—'}
          </p>
        </div>
      </div>

      <div className="flex-1" />

      <span className={`badge ${editMode ? 'badge-edit' : 'badge-view'}`} role="status">
        {editMode ? (
          <>
            <Edit className="w-3 h-3" />
            EDIT MODE{role ? ` · ${EDITOR_ROLE_LABELS[role]?.split(' ')[0] || ''}` : ''}
          </>
        ) : (
          <>
            <Eye className="w-3 h-3" />
            VIEW ONLY
          </>
        )}
      </span>

      {editMode ? (
        <>
          <button
            type="button"
            onClick={onNewVoyage}
            className="btn-primary px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
            title="Create a new voyage"
          >
            + New Voyage
          </button>
          <button
            type="button"
            onClick={exitEditMode}
            className="btn-flat px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
          >
            <Unlock className="w-3.5 h-3.5" />
            Exit Edit
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onEnableEdit}
          className="btn-warning px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
        >
          <Edit className="w-3.5 h-3.5" />
          Enable Edit
        </button>
      )}

      <button
        type="button"
        onClick={onOpenHelp}
        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
        aria-label="Help"
        title="Help"
      >
        <HelpCircle className="w-4 h-4" style={{ color: 'var(--color-dim)' }} />
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="w-4 h-4" style={{ color: 'var(--color-dim)' }} />
      </button>

      <button
        type="button"
        onClick={toggleTheme}
        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark'
          ? <Sun className="w-4 h-4" style={{ color: 'var(--color-dim)' }} />
          : <Moon className="w-4 h-4" style={{ color: 'var(--color-dim)' }} />}
      </button>

      <button
        type="button"
        onClick={endSession}
        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
        aria-label="Sign out / switch ship"
        title="Sign out"
      >
        <LogOut className="w-4 h-4" style={{ color: 'var(--color-dim)' }} />
      </button>
    </header>
  );
}
