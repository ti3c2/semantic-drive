const DETAIL_DRAWER_EXEMPT_TARGET_SELECTOR =
  '.sd-card, .sd-sidebar, .sd-sidebar-open-button, .sd-audio-player-bar';

type ClosestTarget = {
  closest: (selector: string) => unknown;
};

export function shouldCloseDetailDrawerForPointerTarget(
  targetElement: ClosestTarget | null | undefined,
  drawerContainsTarget: boolean,
) {
  if (drawerContainsTarget) return false;
  return !targetElement?.closest(DETAIL_DRAWER_EXEMPT_TARGET_SELECTOR);
}
