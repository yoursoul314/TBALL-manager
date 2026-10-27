import { useLayoutEffect, useRef } from 'react';
/** Track the visible area, including Safari keyboard resize and pan, without changing drafts. */
export function useVisibleViewport<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      root.style.setProperty('--visible-height', height + 'px');
      root.style.setProperty('--visible-width', width + 'px');
      root.style.setProperty('--visible-top', (viewport?.offsetTop ?? 0) + 'px');
      root.style.setProperty('--visible-left', (viewport?.offsetLeft ?? 0) + 'px');
      root.dataset.visibleViewport = 'true';
      const field = document.activeElement;
      const editing =
        field instanceof HTMLElement &&
        root.contains(field) &&
        field.matches(
          'input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]',
        );
      const keyboard =
        (window.innerHeight - height > 100 && (viewport?.scale ?? 1) <= 1.05) ||
        (height < 600 && (editing || root.dataset.keyboard === 'true'));
      root.dataset.keyboard = String(keyboard);
      cancelAnimationFrame(frame);
      if (keyboard && editing && field instanceof HTMLElement)
        frame = requestAnimationFrame(() => {
          // Move only this form's scroller. Do not scroll the page behind the editor.
          const area = field.closest<HTMLElement>('[data-keyboard-scroll]') ?? root;
          const box = field.getBoundingClientRect(),
            bounds = root.getBoundingClientRect();
          const top = bounds.top + (root.matches('dialog') ? 76 : 12);
          const bottom = bounds.bottom - 92;
          if (box.bottom > bottom) area.scrollTop += box.bottom - bottom;
          else if (box.top < top) area.scrollTop -= top - box.top;
        });
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    root.addEventListener('focusin', update);
    root.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.removeEventListener('focusin', update);
      root.removeEventListener('focusout', update);
      delete root.dataset.keyboard;
      delete root.dataset.visibleViewport;
      for (const key of ['height', 'width', 'top', 'left'])
        root.style.removeProperty('--visible-' + key);
    };
  }, [enabled]);
  return ref;
}
