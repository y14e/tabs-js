/**
 * tabs.ts
 *
 * @version 1.0.1
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/tabs-ts}
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TabsOptions {
  readonly animation?: {
    readonly content?: {
      readonly crossFade?: boolean;
      readonly duration?: number;
      readonly easing?: string;
      readonly fade?: boolean;
    };
    readonly indicator?: {
      readonly duration?: number;
      readonly easing?: string;
    };
  };
  readonly avoidDuplicates?: boolean;
  readonly manual?: boolean;
  readonly selector?: {
    readonly content?: string;
    readonly indicator?: string;
    readonly list?: string;
    readonly panel?: string;
    readonly tab?: string;
  };
  readonly vertical?: boolean;
}

type DeepRequired<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]-?: DeepRequired<NonNullable<T[K]>> }
      : NonNullable<T>;

type Binding = {
  tab: HTMLElement;
  panel: HTMLElement;
  animation: Animation | null;
};

// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------

export default class Tabs {
  #rootElement: HTMLElement;
  #defaults = {
    animation: {
      content: {
        crossFade: true,
        duration: 300,
        easing: 'ease',
        fade: false,
      },
      indicator: {
        duration: 300,
        easing: 'ease',
      },
    },
    avoidDuplicates: false,
    manual: false,
    selector: {
      content: '[role="tablist"] + *',
      indicator: '[data-tabs-indicator]',
      list: '[role="tablist"]',
      panel: '[role="tabpanel"]',
      tab: '[role="tab"]',
    },
    vertical: false,
  };
  #settings: DeepRequired<TabsOptions>;
  #listElements: HTMLElement[];
  #tabElements!: HTMLElement[];
  #indicatorElements!: HTMLElement[];
  #contentElement!: HTMLElement | null;
  #panelElements!: HTMLElement[];
  #bindings = new WeakMap<HTMLElement, Binding>();
  #eventController: AbortController | null = new AbortController();
  #animationController: AbortController | null = new AbortController();
  #animation: Animation | null = null;
  #indicators: TabsIndicator[] = [];
  #isDestroyed = false;

  constructor(root: HTMLElement, options: TabsOptions = {}) {
    if (!(root instanceof HTMLElement)) {
      throw new TypeError('Invalid root element');
    }

    this.#rootElement = root;
    this.#settings = {
      ...this.#defaults,
      ...options,
      animation: {
        content: {
          ...this.#defaults.animation.content,
          ...(options.animation?.content ?? {}),
        },
        indicator: {
          ...this.#defaults.animation.indicator,
          ...(options.animation?.indicator ?? {}),
        },
      },
      selector: {
        ...this.#defaults.selector,
        ...(options.selector ?? {}),
      },
    };

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(this.#settings.animation, {
        content: { duration: 0 },
        indicator: { duration: 0 },
      });
    }

    const NOT_NESTED = `:not(:scope ${this.#settings.selector.panel} *)`;
    this.#listElements = [
      ...this.#rootElement.querySelectorAll<HTMLElement>(
        `${this.#settings.selector.list}${NOT_NESTED}`,
      ),
    ];

    if (!this.#listElements.length) {
      console.warn('Missing list elements');
      return;
    }

    this.#tabElements = [
      ...this.#rootElement.querySelectorAll<HTMLElement>(
        `${this.#settings.selector.tab}${NOT_NESTED}`,
      ),
    ];

    if (!this.#tabElements.length) {
      console.warn('Missing tab elements');
      return;
    }

    this.#indicatorElements = [
      ...this.#rootElement.querySelectorAll<HTMLElement>(
        `${this.#settings.selector.indicator}${NOT_NESTED}`,
      ),
    ];

    this.#contentElement = this.#rootElement.querySelector<HTMLElement>(
      this.#settings.selector.content,
    );

    if (!this.#contentElement) {
      console.warn('Missing content element');
      return;
    }

    this.#panelElements = [
      ...this.#rootElement.querySelectorAll<HTMLElement>(
        `${this.#settings.selector.panel}${NOT_NESTED}`,
      ),
    ];

    const length = this.#panelElements.length;

    if (!length) {
      console.warn('Missing panel elements');
      return;
    }

    this.#initialize();
  }

  async activate(tab: HTMLElement, isMatch = false) {
    if (this.#isDestroyed) {
      return;
    }

    if (!(tab instanceof HTMLElement) || !this.#bindings.has(tab)) {
      console.warn('Invalid tab element');
      return;
    }

    if (tab.ariaSelected === 'true') {
      return;
    }

    const ids = getAriaControlsIds(tab);

    if (!ids.length) {
      return;
    }

    this.#tabElements.forEach((tab) => {
      const isSelected = getAriaControlsIds(tab).some((id: string) =>
        ids.includes(id),
      );
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute(
        'tabindex',
        isSelected && !this.#isAvoidedTab(tab) ? '0' : '-1',
      );
    });

    if (!this.#contentElement) {
      return;
    }

    const size = this.#contentElement.offsetHeight;
    this.#rootElement.setAttribute('data-tabs-animating', '');

    const { style } = this.#contentElement;
    style.setProperty('overflow', 'clip');
    style.setProperty('position', 'relative');
    const { fade, crossFade } = this.#settings.animation.content;

    this.#panelElements.forEach((panel) => {
      const { style } = panel;
      if (fade || crossFade) {
        style.setProperty('content-visibility', 'visible');
        style.setProperty('display', 'block');
        style.setProperty('opacity', panel.hidden ? '0' : '1');
      }

      style.setProperty('inline-size', '100%');
      style.setProperty('position', 'absolute');

      if (ids.includes(panel.id) && !hasFocusable(panel)) {
        panel.setAttribute('tabindex', '0');
      } else {
        panel.removeAttribute('tabindex');
      }
    });

    this.#panelElements.forEach((panel, i) => {
      if (ids.includes(panel.id)) {
        panel.removeAttribute('hidden');
      } else {
        const tab = this.#tabElements[i];

        if (!tab) {
          return;
        }

        panel.setAttribute('hidden', isFocusable(tab) ? 'until-found' : '');
      }
    });

    this.#animation?.cancel();
    const newPanel = this.#bindings.get(tab)?.panel;

    if (!newPanel) {
      return;
    }

    // content
    const { duration, easing } = this.#settings.animation.content;
    this.#animation = this.#contentElement.animate(
      {
        blockSize: [
          `${size}px`,
          getComputedStyle(newPanel).getPropertyValue('block-size'),
        ],
      },
      {
        duration: isMatch ? 0 : duration,
        easing: easing,
      },
    );

    const cleanup = () => {
      this.#animation = null;
    };

    const { signal } = this.#animationController ?? new AbortController();
    this.#animation.addEventListener('cancel', cleanup, {
      once: true,
      signal,
    });
    this.#animation.addEventListener(
      'finish',
      () => {
        this.#onContentAnimationFinish();
        cleanup();
      },
      {
        once: true,
        signal,
      },
    );

    // panel
    this.#panelElements.forEach((panel) => {
      const binding = this.#bindings.get(panel);

      if (!binding) {
        return;
      }

      const opacity = getComputedStyle(panel).getPropertyValue('opacity');
      binding.animation?.cancel();
      const isSelected = ids.includes(panel.id);
      const animation = panel.animate(
        {
          opacity: fade
            ? isSelected
              ? [opacity, opacity, '1']
              : [opacity, '0', '0']
            : isSelected
              ? [opacity, '1']
              : [opacity, '0'],
        },
        {
          duration:
            isMatch || !(fade || crossFade)
              ? 0
              : this.#settings.animation.content.duration,
          easing: 'ease',
        },
      );
      binding.animation = animation;

      const cleanup = () => {
        if (binding.animation === animation) {
          binding.animation = null;
        }
      };

      const { signal } = this.#animationController ?? new AbortController();
      animation.addEventListener('cancel', cleanup, { once: true, signal });
      animation.addEventListener('finish', cleanup, { once: true, signal });
    });
  }

  async destroy(force = false) {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;
    this.#eventController?.abort();
    this.#eventController = null;

    this.#indicators.forEach((indicator) => {
      indicator.destroy(force);
    });

    this.#indicators.length = 0;

    if (this.#animation) {
      if (!force) {
        try {
          await this.#animation.finished;
        } catch {}
      }

      this.#animation.cancel();
    }

    if (!force) {
      await Promise.all(
        this.#panelElements.map((panel) =>
          this.#bindings.get(panel)?.animation?.finished.catch(() => {}),
        ),
      );
    }

    this.#panelElements.forEach((panel) => {
      const animation = this.#bindings.get(panel)?.animation;

      if (animation) {
        animation.cancel();
      }
    });

    this.#onContentAnimationFinish();
    this.#animationController?.abort();
    this.#animationController = null;
    this.#listElements.length = 0;
    this.#tabElements.length = 0;
    this.#contentElement = null;
    this.#panelElements.length = 0;
    this.#rootElement.removeAttribute('data-tabs-initialized');
  }

  #initialize() {
    const { signal } = this.#eventController ?? new AbortController();

    this.#listElements.forEach((list, i) => {
      if (this.#settings.avoidDuplicates && i) {
        list.setAttribute('aria-hidden', 'true');
      }

      if (this.#settings.vertical) {
        list.setAttribute('aria-orientation', 'vertical');
      }

      list.setAttribute('role', 'tablist');
    });

    this.#tabElements.forEach((tab, i) => {
      const id = Math.random().toString(36).slice(-8);
      const panel = this.#panelElements[i % this.#panelElements.length];

      if (!panel) {
        return;
      }

      panel.id ||= `tabs-panel-${id}`;
      addTokenToAttribute(tab, 'aria-controls', panel.id);

      if (!tab.hasAttribute('aria-selected')) {
        tab.setAttribute('aria-selected', 'false');
      }

      const isAvoided = this.#isAvoidedTab(tab);

      if (!isAvoided) {
        tab.id ||= `tabs-tab-${id}`;
      }

      tab.setAttribute('role', 'tab');
      tab.setAttribute(
        'tabindex',
        tab.ariaSelected === 'true' && !isAvoided ? '0' : '-1',
      );

      if (!isFocusable(tab)) {
        tab.style.setProperty('pointer-events', 'none');
      }

      addTokenToAttribute(panel, 'aria-labelledby', tab.id);
      tab.addEventListener('click', this.#onTabClick, { signal });
      tab.addEventListener('keydown', this.#onTabKeyDown, { signal });
    });

    this.#indicatorElements.forEach((indicator) => {
      indicator
        .closest<HTMLElement>(this.#settings.selector.list)
        ?.style.setProperty('position', 'relative');
      const { style } = indicator;
      style.setProperty('display', 'block');
      style.setProperty('position', 'absolute');
      this.#indicators.push(new TabsIndicator(indicator, this.#settings));
    });

    this.#panelElements.forEach((panel) => {
      panel.setAttribute('role', 'tabpanel');

      if (!panel.hasAttribute('hidden') && !hasFocusable(panel)) {
        panel.setAttribute('tabindex', '0');
      }

      panel.addEventListener('beforematch', this.#onPanelBeforeMatch, {
        signal,
      });
    });

    this.#tabElements.forEach((tab, i) => {
      const panel = this.#panelElements[i % this.#panelElements.length];

      if (!panel) {
        return;
      }

      const binding = createBinding(tab, panel);
      this.#bindings.set(tab, binding);
      this.#bindings.set(panel, binding);
    });

    this.#rootElement.setAttribute('data-tabs-initialized', '');
  }

  #onTabClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const tab = event.currentTarget;

    if (!(tab instanceof HTMLElement)) {
      return;
    }

    this.activate(tab);
  };

  #onTabKeyDown = (event: KeyboardEvent) => {
    const currentTab = event.currentTarget;

    if (!(currentTab instanceof HTMLElement)) {
      return;
    }

    const list = currentTab.closest(this.#settings.selector.list);

    if (!list) {
      return;
    }

    const isBoth = list.ariaOrientation === 'undefined';
    const isHorizontal = list.ariaOrientation !== 'vertical';
    const { key } = event;

    if (
      ![
        'Enter',
        ' ',
        'End',
        'Home',
        ...(isBoth
          ? ['ArrowLeft', 'ArrowUp']
          : [`Arrow${isHorizontal ? 'Left' : 'Up'}`]),
        ...(isBoth
          ? ['ArrowRight', 'ArrowDown']
          : [`Arrow${isHorizontal ? 'Right' : 'Down'}`]),
      ].includes(key)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const focusables = [
      ...list.querySelectorAll<HTMLElement>(this.#settings.selector.tab),
    ].filter(isFocusable);
    const active = getActiveElement();

    if (!(active instanceof HTMLElement)) {
      return;
    }

    const currentIndex = focusables.indexOf(active);
    let newIndex = currentIndex;

    switch (key) {
      case 'Enter':
      case ' ':
        active.click();
        return;
      case 'End':
        newIndex = -1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        newIndex = currentIndex - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        newIndex = (currentIndex + 1) % focusables.length;
        break;
    }

    const newTab = focusables.at(newIndex);

    if (!newTab) {
      return;
    }

    newTab.focus();

    if (!this.#settings.manual) {
      newTab.click();
    }
  };

  #onPanelBeforeMatch = (event: Event) => {
    const panel = event.currentTarget;

    if (!(panel instanceof HTMLElement)) {
      return;
    }

    const tab = this.#bindings.get(panel)?.tab;

    if (!tab) {
      return;
    }

    this.activate(tab, true);
  };

  #onContentAnimationFinish() {
    if (!this.#contentElement) {
      return;
    }

    const { style } = this.#contentElement;
    style.removeProperty('block-size');
    style.removeProperty('overflow');
    style.removeProperty('position');

    this.#panelElements.forEach((panel) => {
      const { style } = panel;
      style.removeProperty('content-visibility');
      style.removeProperty('display');
      style.removeProperty('inline-size');
      style.removeProperty('opacity');
      style.removeProperty('position');
    });

    this.#rootElement.removeAttribute('data-tabs-animating');
  }

  #isAvoidedTab(tab: HTMLElement) {
    return (
      this.#settings.avoidDuplicates &&
      this.#tabElements.indexOf(tab) >= this.#panelElements.length
    );
  }
}

class TabsIndicator {
  #rootElement: HTMLElement;
  #settings: DeepRequired<TabsOptions>;
  #listElement: HTMLElement | null = null;
  #animation: Animation | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #mutationObserver: MutationObserver | null = null;

  constructor(root: HTMLElement, settings: DeepRequired<TabsOptions>) {
    this.#rootElement = root;
    this.#settings = settings;
    this.#listElement = root.closest(settings.selector.list);

    if (!this.#listElement) {
      return;
    }

    this.#resizeObserver = new ResizeObserver(this.#update);
    this.#resizeObserver.observe(this.#listElement);
    this.#mutationObserver = new MutationObserver(this.#update);
    this.#mutationObserver.observe(this.#listElement, {
      attributeFilter: ['aria-selected'],
      subtree: true,
    });
  }

  #update = () => {
    if (!this.#rootElement.checkVisibility()) {
      return;
    }

    if (!this.#listElement) {
      return;
    }

    const isHorizontal = this.#listElement.ariaOrientation !== 'vertical';
    const position = `inset${isHorizontal ? 'Inline' : 'Block'}Start`;
    const size = `${isHorizontal ? 'inline' : 'block'}Size`;
    const tab = this.#listElement.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );

    if (!tab) {
      return;
    }

    const { x: tabX, y: tabY, width, height } = tab.getBoundingClientRect();
    const { x: listX, y: listY } = this.#listElement.getBoundingClientRect();
    const { duration, easing } = this.#settings.animation.indicator;
    this.#animation = this.#rootElement.animate(
      {
        [position]: `${isHorizontal ? tabX - listX : tabY - listY}px`,
        [size]: `${isHorizontal ? width : height}px`,
      },
      { duration, easing, fill: 'forwards' },
    );
  };

  async destroy(force = false) {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#mutationObserver?.disconnect();
    this.#mutationObserver = null;

    if (!this.#animation) {
      return;
    }

    if (!force) {
      try {
        await this.#animation.finished;
      } catch {}
    }

    this.#animation.cancel();
    this.#animation = null;
    this.#listElement = null;
  }
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function addTokenToAttribute(
  element: HTMLElement,
  attribute: string,
  token: string,
) {
  const tokens = new Set(
    element.getAttribute(attribute)?.trim().split(/\s+/) ?? [],
  );
  tokens.add(token);
  element.setAttribute(attribute, [...tokens].join(' '));
}

function createBinding(tab: HTMLElement, panel: HTMLElement) {
  return { tab, panel, animation: null };
}

function getActiveElement() {
  let current = document.activeElement;

  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement;
  }

  return current;
}

function getAriaControlsIds(element: HTMLElement) {
  return element.getAttribute('aria-controls')?.trim().split(/\s+/) ?? [];
}

function hasFocusable(container: HTMLElement) {
  return !![
    ...container.querySelectorAll<HTMLElement>(
      `:is(a[href], area[href], button, embed, iframe, input:not([type="hidden" i]), object, select, details > summary:first-of-type, textarea, [contenteditable]:not([contenteditable="false" i]), [controls], [tabindex]):not(:disabled, [hidden], [inert], [tabindex="-1"])`,
    ),
  ].filter((element) => element.checkVisibility()).length;
}

function isFocusable(element: HTMLElement) {
  return !element.hasAttribute('disabled');
}
