import type { ViewMode } from './types';
import { CloseIcon, SidebarIcon } from './icons';
import { IconOnlyAction } from './media';

type SidebarProps = {
  isSidebarOpen: boolean;
  activeType: string;
  viewMode: ViewMode;
  onOpenSidebar: () => void;
  onCloseSidebar: () => void;
  onSelectLibraryType: (type: string) => void;
  onSelectTrashView: () => void;
};

export function Sidebar({
  isSidebarOpen,
  activeType,
  viewMode,
  onOpenSidebar,
  onCloseSidebar,
  onSelectLibraryType,
  onSelectTrashView,
}: SidebarProps) {
  return (
    <>
      {!isSidebarOpen && (
        <button
          className="sd-sidebar-open-button"
          type="button"
          aria-controls="sd-sidebar"
          aria-expanded={isSidebarOpen}
          title="Show sidebar"
          onClick={onOpenSidebar}
        >
          <IconOnlyAction label="Show sidebar">
            <SidebarIcon />
          </IconOnlyAction>
        </button>
      )}
      <aside className="sd-sidebar" id="sd-sidebar">
        <div className="sd-sidebar-heading">
          <button
            className="sd-sidebar-close"
            type="button"
            aria-controls="sd-sidebar"
            aria-expanded={isSidebarOpen}
            title="Hide sidebar"
            onClick={onCloseSidebar}
          >
            <IconOnlyAction label="Hide sidebar">
              <CloseIcon />
            </IconOnlyAction>
          </button>
          <div className="sd-logo">Semantic Drive</div>
        </div>
        <button
          type="button"
          className={viewMode === 'library' && activeType === 'all' ? 'active' : ''}
          onClick={() => onSelectLibraryType('all')}
        >
          All
        </button>
        <button
          type="button"
          className={viewMode === 'library' && activeType === 'image' ? 'active' : ''}
          onClick={() => onSelectLibraryType('image')}
        >
          Images
        </button>
        <button
          type="button"
          className={viewMode === 'library' && activeType === 'video' ? 'active' : ''}
          onClick={() => onSelectLibraryType('video')}
        >
          Videos
        </button>
        <button
          type="button"
          className={viewMode === 'library' && activeType === 'audio' ? 'active' : ''}
          onClick={() => onSelectLibraryType('audio')}
        >
          Audio
        </button>
        <button
          type="button"
          className={viewMode === 'trash' ? 'active' : ''}
          onClick={onSelectTrashView}
        >
          Trash
        </button>
      </aside>
    </>
  );
}
