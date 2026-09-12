import { ScrollPositionMap } from '../types';

let liveScrollMap: ScrollPositionMap = {};
let autoScrollCounter = 0;

/**
 * Returns a copy of the live tracked scroll positions for all active elements.
 */
export const getLiveScrollPositions = (): ScrollPositionMap => {
  return { ...liveScrollMap };
};

/**
 * Resets the in-memory live scroll map (e.g. before navigating to a new screen).
 */
export const clearLiveScrollPositions = () => {
  liveScrollMap = {};
};

/**
 * Universally captures the current scroll positions of every scrollable element
 * inside the active screen viewport, returning a selector-keyed coordinate map.
 */
export const captureScreenScroll = (
  container?: HTMLElement | string | null
): ScrollPositionMap => {
  let root: HTMLElement | null = null;
  if (typeof container === 'string') {
    root =
      document.getElementById(`screen-container-${container}`) ||
      document.getElementById(container);
  } else if (container instanceof HTMLElement) {
    root = container;
  }

  if (!root) {
    root = document.getElementById('app-main-viewport') || document.body;
  }

  const result: ScrollPositionMap = { ...liveScrollMap };
  if (!root) return result;

  // Check the root viewport itself
  if (root.scrollTop > 0 || root.scrollLeft > 0) {
    const rootKey = root.id ? `#${root.id}` : 'app-main-viewport';
    result[rootKey] = { top: root.scrollTop, left: root.scrollLeft };
  }

  // Find all elements that have scrolled or can scroll
  try {
    const scrollableElements = root.querySelectorAll<HTMLElement>('*');
    scrollableElements.forEach((el) => {
      const hasScrolled = el.scrollTop > 0 || el.scrollLeft > 0;
      if (hasScrolled) {
        let key = '';
        if (el.id) {
          key = `#${el.id}`;
        } else {
          if (!el.dataset.axonScrollId) {
            el.dataset.axonScrollId = `scr-${++autoScrollCounter}`;
          }
          key = `[data-axon-scroll-id="${el.dataset.axonScrollId}"]`;
        }
        result[key] = { top: el.scrollTop, left: el.scrollLeft };
      }
    });
  } catch (err) {
    // Non-blocking query failure safeguard
  }

  // Update live map cache with current snapshot
  liveScrollMap = { ...result };
  return result;
};

/**
 * Reliably restores scroll positions across all captured elements in tiered animation frames.
 */
export const restoreScreenScroll = (
  scrollMap?: ScrollPositionMap,
  container?: HTMLElement | string | null
) => {
  if (!scrollMap || Object.keys(scrollMap).length === 0) return;

  const performRestore = () => {
    let root: HTMLElement | null = null;
    if (typeof container === 'string') {
      root =
        document.getElementById(`screen-container-${container}`) ||
        document.getElementById(container);
    } else if (container instanceof HTMLElement) {
      root = container;
    }

    if (!root) {
      root = document.getElementById('app-main-viewport') || document.body;
    }
    if (!root) return;

    // Check root viewport
    const rootKey = root.id ? `#${root.id}` : 'app-main-viewport';
    if (scrollMap[rootKey]) {
      root.scrollTop = scrollMap[rootKey].top;
      root.scrollLeft = scrollMap[rootKey].left;
      liveScrollMap[rootKey] = { top: root.scrollTop, left: root.scrollLeft };
    }

    Object.entries(scrollMap).forEach(([selector, pos]) => {
      try {
        let el: HTMLElement | null = null;
        if (selector === 'app-main-viewport' || selector === 'root') {
          el = root;
        } else if (selector.startsWith('#')) {
          el = document.getElementById(selector.slice(1));
        } else {
          el = root?.querySelector<HTMLElement>(selector) || null;
        }

        if (el) {
          el.scrollTop = pos.top;
          el.scrollLeft = pos.left;
          liveScrollMap[selector] = { top: pos.top, left: pos.left };
        }
      } catch (err) {
        // Safe catch for invalid or unmounted selectors
      }
    });
  };

  // Tiered restoration for immediate execution and layout-settled frames
  performRestore();
  requestAnimationFrame(() => {
    performRestore();
    setTimeout(performRestore, 20);
    setTimeout(performRestore, 60);
    setTimeout(performRestore, 150);
  });
};

/**
 * Initializes a passive global capture scroll listener on the window.
 * Whenever any container inside the app viewport scrolls, its latest coordinates
 * are captured into the central live map immediately.
 */
export const initNavigationScrollTracker = () => {
  if (typeof window === 'undefined') return () => {};

  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    if (!target || !(target instanceof HTMLElement)) return;

    const viewport = document.getElementById('app-main-viewport');
    if (viewport && !viewport.contains(target) && target !== viewport) return;

    let key = '';
    if (target.id) {
      key = `#${target.id}`;
    } else {
      if (!target.dataset.axonScrollId) {
        target.dataset.axonScrollId = `scr-${++autoScrollCounter}`;
      }
      key = `[data-axon-scroll-id="${target.dataset.axonScrollId}"]`;
    }

    liveScrollMap[key] = {
      top: target.scrollTop,
      left: target.scrollLeft,
    };
  };

  window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  return () => {
    window.removeEventListener('scroll', handleScroll, { capture: true });
  };
};
