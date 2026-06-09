import { XIcon } from './icons';
import { IconOnlyAction, MediaTypeIcon, mediaTypeLabel } from './media';

export const MEDIA_TYPE_FILTERS = ['image', 'video', 'audio'] as const;
export type MediaTypeFilter = (typeof MEDIA_TYPE_FILTERS)[number];

type MediaFilterBarProps = {
  activeMediaTypes: readonly MediaTypeFilter[];
  onToggleMediaType: (mediaType: MediaTypeFilter) => void;
  onClearFilters: () => void;
};

export function MediaFilterBar({
  activeMediaTypes,
  onToggleMediaType,
  onClearFilters,
}: MediaFilterBarProps) {
  const activeMediaTypeSet = new Set(activeMediaTypes);
  const hasNarrowedFilters = activeMediaTypes.length < MEDIA_TYPE_FILTERS.length;

  return (
    <div className="sd-media-filters" aria-label="Media filters">
      {MEDIA_TYPE_FILTERS.map((mediaType) => {
        const isActive = activeMediaTypeSet.has(mediaType);
        const label = mediaTypeLabel(mediaType);
        return (
          <button
            key={mediaType}
            type="button"
            className={`sd-media-filter${isActive ? ' active' : ''}`}
            aria-label={`${label} filter`}
            aria-pressed={isActive}
            title={`${label} filter`}
            onClick={() => onToggleMediaType(mediaType)}
          >
            <IconOnlyAction label={`${label} filter`}>
              <MediaTypeIcon mediaType={mediaType} size={20} />
            </IconOnlyAction>
          </button>
        );
      })}
      {hasNarrowedFilters && (
        <button
          type="button"
          className="sd-media-filter sd-media-filter-clear"
          aria-label="Clear media filters"
          title="Clear media filters"
          onClick={onClearFilters}
        >
          <IconOnlyAction label="Clear media filters">
            <XIcon size={20} />
          </IconOnlyAction>
        </button>
      )}
    </div>
  );
}
