/**
 * tabs.ts
 *
 * @version 0.1.3
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
  #indicators: TabsIndicator[] = [];
  #contentElement!: HTMLElement | null;
  #panelElements!: HTMLElement[];
  #controller: AbortController | null = new AbortController();
  #contentAnimation: Animation | null = null;
  #panelAnimations!: (Animation | null)[];
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

    this.#panelAnimations = Array(length).fill(null);
    this.#initialize();
  }

  activate(tab: HTMLElement, match = false) {
    if (!this.#tabElements.includes(tab) || tab.ariaSelected === 'true') {
      return;
    }

    const ids = tab.getAttribute('aria-controls')?.trim().split(/\s+/) || [];

    if (!ids.length) {
      return;
    }

    this.#tabElements.forEach((tab) => {
      const isSelected = tab
        .getAttribute('aria-controls')
        ?.trim()
        .split(/\s+/)
        .some((id: string) => ids.includes(id));
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute(
        'tabindex',
        isSelected &&
          (!this.#settings.avoidDuplicates || !this.isDuplicates(tab))
          ? '0'
          : '-1',
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
        style.setProperty('opacity', !panel.hidden ? '1' : '0');
      }

      style.setProperty('position', 'absolute');
      style.setProperty('width', '100%');

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

    this.#contentAnimation?.cancel();
    const newPanel = ids.map((id) => document.getElementById(id)).find(Boolean);

    if (!newPanel) {
      return;
    }

    const { duration, easing } = this.#settings.animation.content;
    this.#contentAnimation = this.#contentElement.animate(
      {
        blockSize: [
          `${size}px`,
          getComputedStyle(newPanel).getPropertyValue('block-size'),
        ],
      },
      {
        duration: !match ? duration : 0,
        easing: easing,
      },
    );

    const cleanupContentAnimation = () => {
      this.#contentAnimation = null;
    };

    this.#contentAnimation.addEventListener('cancel', cleanupContentAnimation);

    this.#contentAnimation.addEventListener('finish', () => {
      cleanupContentAnimation();
      this.#rootElement.removeAttribute('data-tabs-animating');

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
        style.removeProperty('position');
        style.removeProperty('width');
      });
    });

    if (!fade && !crossFade) {
      return;
    }

    this.#panelElements.forEach((panel, i) => {
      const isSelected = ids.includes(panel.id);
      const opacity = getComputedStyle(panel).getPropertyValue('opacity');
      let animation = this.#panelAnimations[i];
      animation?.cancel();
      animation = panel.animate(
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
          duration: !match ? this.#settings.animation.content.duration : 0,
          easing: 'ease',
        },
      );
      this.#panelAnimations[i] = animation;

      const cleanupPanelAnimation = () => {
        if (this.#panelAnimations[i] === animation) {
          this.#panelAnimations[i] = null;
        }
      };

      animation.addEventListener('cancel', cleanupPanelAnimation);

      animation.addEventListener('finish', () => {
        cleanupPanelAnimation();
        panel.style.removeProperty('opacity');
      });
    });
  }

  async destroy(force = false) {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;
    this.#controller?.abort();
    this.#controller = null;

    this.#indicators.forEach((indicator) => {
      indicator.destroy(force);
    });

    this.#indicators.length = 0;

    if (this.#contentAnimation) {
      if (!force) {
        try {
          await this.#contentAnimation.finished;
        } catch {}
      }

      this.#contentAnimation.cancel();
    }

    if (!force) {
      await Promise.all(
        this.#panelAnimations.map((animation) =>
          animation?.finished.catch(() => {}),
        ),
      );
    }

    this.#panelAnimations.forEach((animation) => {
      animation?.cancel();
    });

    this.#listElements.length = 0;
    this.#tabElements.length = 0;
    this.#contentElement = null;
    this.#panelElements.length = 0;
    this.#rootElement.removeAttribute('data-tabs-initialized');
  }

  #initialize() {
    const { signal } = this.#controller ?? new AbortController();

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
      const controls = new Set(
        tab.getAttribute('aria-controls')?.trim().split(/\s+/) ?? [],
      );
      controls.add(panel.id);
      tab.setAttribute('aria-controls', [...controls].join(' '));

      if (!tab.hasAttribute('aria-selected')) {
        tab.setAttribute('aria-selected', 'false');
      }

      const isDuplicates = this.isDuplicates(tab);

      if (!this.#settings.avoidDuplicates || !isDuplicates) {
        tab.id ||= `tabs-tab-${id}`;
      }

      tab.setAttribute('role', 'tab');
      tab.setAttribute(
        'tabindex',
        tab.ariaSelected === 'true' &&
          (!this.#settings.avoidDuplicates || !isDuplicates)
          ? '0'
          : '-1',
      );

      if (!isFocusable(tab)) {
        tab.style.setProperty('pointer-events', 'none');
      }

      const labelledBy = new Set(
        panel.getAttribute('aria-labelledby')?.trim().split(/\s+/) ?? [],
      );
      labelledBy.add(tab.id);
      panel.setAttribute('aria-labelledby', [...labelledBy].join(' '));
      tab.addEventListener('click', this.#onTabClick, { signal });
      tab.addEventListener('keydown', this.#onTabKeyDown, { signal });
    });

    if (this.#indicatorElements.length) {
      this.#indicatorElements.forEach((indicator) => {
        const list = indicator.closest(this.#settings.selector.list);

        if (!(list instanceof HTMLElement)) {
          return;
        }

        list.style.setProperty('position', 'relative');
        indicator.style.setProperty('display', 'block');
        indicator.style.setProperty('position', 'absolute');

        this.#indicators.push(
          new TabsIndicator(indicator, list, this.#settings),
        );
      });
    }

    this.#panelElements.forEach((panel) => {
      panel.setAttribute('role', 'tabpanel');

      if (!panel.hasAttribute('hidden') && !hasFocusable(panel)) {
        panel.setAttribute('tabindex', '0');
      }

      panel.addEventListener('beforematch', this.#onPanelBeforeMatch, {
        signal,
      });
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

    const tab = this.#rootElement.querySelector<HTMLElement>(
      `[aria-controls="${panel.id}"]`,
    );

    if (!tab) {
      return;
    }

    this.activate(tab, true);
  };

  private isDuplicates(tab: HTMLElement) {
    return this.#tabElements.indexOf(tab) >= this.#panelElements.length;
  }
}

class TabsIndicator {
  #indicatorElement: HTMLElement;
  #listElement: HTMLElement;
  #settings: DeepRequired<TabsOptions>;

  #animation: Animation | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #mutationObserver: MutationObserver | null = null;

  constructor(
    indicator: HTMLElement,
    list: HTMLElement,
    settings: DeepRequired<TabsOptions>,
  ) {
    this.#indicatorElement = indicator;
    this.#listElement = list;
    this.#settings = settings;

    this.update = this.update.bind(this);

    this.#resizeObserver = new ResizeObserver(this.update);
    this.#resizeObserver.observe(this.#listElement);
    this.#mutationObserver = new MutationObserver(this.update);
    this.#mutationObserver.observe(this.#listElement, {
      attributeFilter: ['aria-selected'],
      subtree: true,
    });
  }

  private update() {
    if (!this.#indicatorElement.checkVisibility()) {
      return;
    }

    const horizontal = this.#listElement.ariaOrientation !== 'vertical';
    const position = `inset${horizontal ? 'Inline' : 'Block'}Start`;
    const size = `${horizontal ? 'inline' : 'block'}Size`;
    const tab = this.#listElement.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );

    if (!tab) {
      return;
    }

    const { x: tabX, y: tabY, width, height } = tab.getBoundingClientRect();
    const { x: listX, y: listY } = this.#listElement.getBoundingClientRect();
    this.#animation = this.#indicatorElement.animate(
      {
        [position]: `${horizontal ? tabX - listX : tabY - listY}px`,
        [size]: `${horizontal ? width : height}px`,
      },
      {
        duration: this.#settings.animation.indicator.duration,
        easing: this.#settings.animation.indicator.easing,
        fill: 'forwards',
      },
    );
  }

  async destroy(force = false): Promise<void> {
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
  }
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function getActiveElement() {
  let current = document.activeElement;

  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement;
  }

  return current;
}

function hasFocusable(element: HTMLElement) {
  return !![
    ...element.querySelectorAll<HTMLElement>(
      `:is(a[href], area[href], button, embed, iframe, input:not([type="hidden" i]), object, select, details > summary:first-of-type, textarea, [contenteditable]:not([contenteditable="false" i]), [controls], [tabindex]):not(:disabled, [hidden], [inert], [tabindex="-1"])`,
    ),
  ].filter((element) =>
    element.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    }),
  ).length;
}

function isFocusable(element: HTMLElement) {
  return !element.hasAttribute('disabled');
}
