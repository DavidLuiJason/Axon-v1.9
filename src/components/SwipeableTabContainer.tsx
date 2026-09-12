import React, { useRef, useEffect, useCallback } from 'react';

export interface SwipeableTabContainerProps<T extends string> {
  tabs: readonly T[] | T[];
  activeTab: T;
  onTabChange: (newTab: T) => void;
  children: React.ReactNode;
  className?: string;
  fitHeight?: boolean;
}

export function SwipeableTabContainer<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  children,
  className = '',
  fitHeight = false,
}: SwipeableTabContainerProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  const childArray = React.Children.toArray(children);
  const isSingleChild = childArray.length === 1 && tabs.length > 1;

  const rawIndex = tabs.indexOf(activeTab);
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;
  const numTabs = isSingleChild ? 1 : Math.max(1, tabs.length);
  const basePercent = isSingleChild ? 0 : -(currentIndex * 100) / numTabs;

  // Direct gesture tracking refs - zero React re-renders during active drag
  const isGesturingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<number>(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const gestureLockRef = useRef<'horizontal' | 'vertical' | null>(null);
  const isMouseActiveRef = useRef<boolean>(false);
  const animationTimerRef = useRef<number | null>(null);
  const prevIndexRef = useRef<number>(currentIndex);

  // Synchronize container height with active tab in non-fitHeight mode
  const syncHeight = useCallback((targetIdx = currentIndex) => {
    if (fitHeight || !containerRef.current) return;
    const activePanel = tabRefs.current[targetIdx];
    if (activePanel) {
      const h = activePanel.offsetHeight;
      if (h > 0) {
        containerRef.current.style.height = `${h}px`;
      }
    }
  }, [currentIndex, fitHeight]);

  // Handle activeTab / currentIndex changes programmatically (tab button click, etc.)
  useEffect(() => {
    if (trackRef.current && !isGesturingRef.current) {
      trackRef.current.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
      trackRef.current.style.transform = `translate3d(${basePercent}%, 0, 0)`;

      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
      animationTimerRef.current = window.setTimeout(() => {
        if (trackRef.current && !isGesturingRef.current) {
          trackRef.current.style.transition = 'none';
        }
        animationTimerRef.current = null;
      }, 300);
    }

    syncHeight(currentIndex);
    const rAF = requestAnimationFrame(() => {
      syncHeight(currentIndex);
    });
    prevIndexRef.current = currentIndex;

    return () => cancelAnimationFrame(rAF);
  }, [activeTab, basePercent, currentIndex, syncHeight]);

  // Resize observer to adapt container height when content dynamically changes
  useEffect(() => {
    if (fitHeight) return;
    const activePanel = tabRefs.current[currentIndex];
    if (!activePanel) return;

    const observer = new ResizeObserver(() => {
      syncHeight(currentIndex);
    });

    observer.observe(activePanel);
    return () => observer.disconnect();
  }, [currentIndex, fitHeight, syncHeight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
    };
  }, []);

  const isIgnoredTarget = (target: HTMLElement | null): boolean => {
    if (!target) return false;
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], .no-tab-swipe, .no-swipe-gesture, [data-no-swipe]'
      )
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (numTabs <= 1) return;
    if (isIgnoredTarget(e.target as HTMLElement | null)) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      gestureLockRef.current = null;
      return;
    }

    if (e.touches.length === 1) {
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }

      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
      }

      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchStartTimeRef.current = Date.now();
      gestureLockRef.current = null;
      isGesturingRef.current = false;
      dragOffsetRef.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null || e.touches.length !== 1) {
      return;
    }

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartXRef.current;
    const diffY = currentY - touchStartYRef.current;

    // Lock direction on first threshold pass
    if (gestureLockRef.current === null) {
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
        gestureLockRef.current = 'vertical';
        return;
      }
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
        gestureLockRef.current = 'horizontal';
        isGesturingRef.current = true;
      }
    }

    if (gestureLockRef.current === 'horizontal') {
      if (e.cancelable) {
        e.preventDefault();
      }

      // 1:1 real-time drag following with elastic resistance at boundaries
      let offset = diffX;
      const isAtFirst = currentIndex === 0;
      const isAtLast = currentIndex === numTabs - 1;

      if ((isAtFirst && diffX > 0) || (isAtLast && diffX < 0)) {
        offset = diffX * 0.22;
      }

      dragOffsetRef.current = offset;

      // Real-time direct DOM update (compositor thread, zero React re-render lag)
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = `translate3d(calc(${basePercent}% + ${offset}px), 0, 0)`;
      }

      // Expand height to max of current and adjacent candidate during gesture
      if (!fitHeight && containerRef.current) {
        const candidateIdx = diffX < 0 ? Math.min(numTabs - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
        const currentH = tabRefs.current[currentIndex]?.offsetHeight || 0;
        const candidateH = tabRefs.current[candidateIdx]?.offsetHeight || 0;
        const maxH = Math.max(currentH, candidateH);
        if (maxH > 0) {
          containerRef.current.style.height = `${maxH}px`;
        }
      }
    }
  };

  const finishGesture = useCallback((diffX: number, velocity: number) => {
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 360;
    const switchThreshold = Math.min(containerWidth * 0.22, 75);
    const fastFlick = Math.abs(velocity) > 0.32 && Math.abs(diffX) > 22;

    let targetIndex = currentIndex;
    if (diffX < -switchThreshold || (fastFlick && diffX < 0)) {
      if (currentIndex < numTabs - 1) {
        targetIndex = currentIndex + 1;
      }
    } else if (diffX > switchThreshold || (fastFlick && diffX > 0)) {
      if (currentIndex > 0) {
        targetIndex = currentIndex - 1;
      }
    }

    const targetPercent = -(targetIndex * 100) / numTabs;

    if (trackRef.current) {
      const isSwitch = targetIndex !== currentIndex;
      trackRef.current.style.transition = isSwitch
        ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
      trackRef.current.style.transform = `translate3d(${targetPercent}%, 0, 0)`;
    }

    if (!fitHeight && containerRef.current) {
      const targetH = tabRefs.current[targetIndex]?.offsetHeight || 0;
      if (targetH > 0) {
        containerRef.current.style.height = `${targetH}px`;
      }
    }

    if (targetIndex !== currentIndex) {
      onTabChange(tabs[targetIndex]);
    }

    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }
    animationTimerRef.current = window.setTimeout(() => {
      if (trackRef.current && !isGesturingRef.current) {
        trackRef.current.style.transition = 'none';
      }
      animationTimerRef.current = null;
    }, 300);

    isGesturingRef.current = false;
    dragOffsetRef.current = 0;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    gestureLockRef.current = null;
    isMouseActiveRef.current = false;
  }, [currentIndex, fitHeight, numTabs, onTabChange, tabs]);

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) {
      isGesturingRef.current = false;
      dragOffsetRef.current = 0;
      return;
    }

    if (gestureLockRef.current === 'horizontal') {
      const currentX = e.changedTouches[0].clientX;
      const diffX = currentX - touchStartXRef.current;
      const dt = Math.max(1, Date.now() - touchStartTimeRef.current);
      const velocity = diffX / dt;
      finishGesture(diffX, velocity);
    } else {
      isGesturingRef.current = false;
      dragOffsetRef.current = 0;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      gestureLockRef.current = null;
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
        trackRef.current.style.transform = `translate3d(${basePercent}%, 0, 0)`;
      }
    }
  };

  const handleTouchCancel = () => {
    isGesturingRef.current = false;
    dragOffsetRef.current = 0;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    gestureLockRef.current = null;
    if (trackRef.current) {
      trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
      trackRef.current.style.transform = `translate3d(${basePercent}%, 0, 0)`;
    }
    syncHeight(currentIndex);
  };

  // Mouse drag support for desktop pointer testing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (numTabs <= 1) return;
    if (e.button !== 0) return;
    if (isIgnoredTarget(e.target as HTMLElement | null)) return;

    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
    }

    touchStartXRef.current = e.clientX;
    touchStartYRef.current = e.clientY;
    touchStartTimeRef.current = Date.now();
    gestureLockRef.current = null;
    isMouseActiveRef.current = true;
    isGesturingRef.current = false;
    dragOffsetRef.current = 0;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseActiveRef.current || touchStartXRef.current === null || touchStartYRef.current === null) {
        return;
      }

      const diffX = e.clientX - touchStartXRef.current;
      const diffY = e.clientY - touchStartYRef.current;

      if (gestureLockRef.current === null) {
        if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
          gestureLockRef.current = 'vertical';
          return;
        }
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
          gestureLockRef.current = 'horizontal';
          isGesturingRef.current = true;
        }
      }

      if (gestureLockRef.current === 'horizontal') {
        let offset = diffX;
        const isAtFirst = currentIndex === 0;
        const isAtLast = currentIndex === numTabs - 1;

        if ((isAtFirst && diffX > 0) || (isAtLast && diffX < 0)) {
          offset = diffX * 0.22;
        }

        dragOffsetRef.current = offset;

        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform = `translate3d(calc(${basePercent}% + ${offset}px), 0, 0)`;
        }

        if (!fitHeight && containerRef.current) {
          const candidateIdx = diffX < 0 ? Math.min(numTabs - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
          const currentH = tabRefs.current[currentIndex]?.offsetHeight || 0;
          const candidateH = tabRefs.current[candidateIdx]?.offsetHeight || 0;
          const maxH = Math.max(currentH, candidateH);
          if (maxH > 0) {
            containerRef.current.style.height = `${maxH}px`;
          }
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isMouseActiveRef.current || touchStartXRef.current === null) return;

      if (gestureLockRef.current === 'horizontal') {
        const diffX = e.clientX - touchStartXRef.current;
        const dt = Math.max(1, Date.now() - touchStartTimeRef.current);
        const velocity = diffX / dt;
        finishGesture(diffX, velocity);
      } else {
        isGesturingRef.current = false;
        dragOffsetRef.current = 0;
        isMouseActiveRef.current = false;
        touchStartXRef.current = null;
        touchStartYRef.current = null;
        gestureLockRef.current = null;
        if (trackRef.current) {
          trackRef.current.style.transition = 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)';
          trackRef.current.style.transform = `translate3d(${basePercent}%, 0, 0)`;
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [basePercent, currentIndex, finishGesture, fitHeight, numTabs]);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleMouseDown}
      style={{
        touchAction: 'pan-y',
        transition: fitHeight ? 'none' : 'height 0.26s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className={`relative w-full overflow-hidden select-none isolate ${
        fitHeight ? 'h-full min-h-0 flex flex-col' : ''
      } ${className}`}
    >
      {/* 1:1 Hardware-Accelerated Sliding Track */}
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: `${numTabs * 100}%`,
          transform: `translate3d(${basePercent}%, 0, 0)`,
          willChange: 'transform',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          WebkitTransformStyle: 'flat',
          transformStyle: 'flat',
          isolation: 'isolate',
          backgroundColor: '#000000',
        }}
        className={`w-full ${fitHeight ? 'h-full min-h-0' : 'items-start'}`}
      >
        {childArray.map((child, index) => {
          return (
            <div
              key={tabs[index] ?? index}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              style={{
                width: `${100 / numTabs}%`,
                minWidth: `${100 / numTabs}%`,
                flexShrink: 0,
                position: 'relative',
                isolation: 'isolate',
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
                WebkitTransform: 'translateZ(0)',
                transform: 'translateZ(0)',
                contain: 'layout',
                backgroundColor: '#000000',
                ...(fitHeight ? { height: '100%', minHeight: 0 } : { height: 'auto' }),
              }}
              className={`shrink-0 ${fitHeight ? 'h-full min-h-0 overflow-y-auto' : ''}`}
            >
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
}
