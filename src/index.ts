/**
 * Tabs
 * WAI-ARIA compliant tabs pattern implementation in TypeScript.
 *
 * @version 1.4.1
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/tabs}
 */

// -----------------------------------------------------------------------------
// import
// -----------------------------------------------------------------------------

import {
  addTokenToAttribute,
  restoreAttributes,
  saveAttributes,
} from '@y14e/attributes-utils';
import { createRovingTabIndex } from '@y14e/roving-tabindex';
import type { DeepRequired } from 'utility-types';

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

type Binding = {
  tabs: HTMLElement[];
  panel: HTMLElement;
  animation: Animation | null;
};

// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------

export default class Tabs {
  static defaults: TabsOptions = {};

  #rootElement!: HTMLElement;
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
  #settings!: DeepRequired<TabsOptions>;
  #listElements!: HTMLElement[];
  #tabElements!: HTMLElement[];
  #indicatorElements!: HTMLElement[];
  #contentElement!: HTMLElement | null;
  #panelElements!: HTMLElement[];
  #bindings = new WeakMap<HTMLElement, Binding>();
  #eventController: AbortController | null = null;
  #animationController: AbortController | null = null;
  #cleanupsRovingTabIndex: (() => void)[] = [];
  #animation: Animation | null = null;
  #indicators: TabsIndicator[] = [];
  #isDestroyed = false;

  constructor(root: HTMLElement, options: TabsOptions = {}) {
    if (!(root instanceof HTMLElement)) {
      throw new TypeError('Invalid root element');
    }

    if (root.hasAttribute('data-tabs-initialized')) {
      console.warn('Already initialized');
      return;
    }

    this.#rootElement = root;
    this.#defaults = this.#mergeOptions(this.#defaults, Tabs.defaults);
    this.#settings = this.#mergeOptions(this.#defaults, options);
    matchMedia('(prefers-reduced-motion: reduce)').matches &&
      Object.assign(this.#settings.animation, {
        content: { duration: 0 },
        indicator: { duration: 0 },
      });
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

    const tabs: HTMLElement[][] = [];

    this.#tabElements.forEach((tab, i) => {
      const index = i % length;
      const tabsByIndex = tabs[index] ?? [];
      tabsByIndex.push(tab);
      tabs[index] = tabsByIndex;
      const panel = this.#panelElements[index];

      if (!panel) {
        return;
      }

      const binding = createBinding(tabsByIndex, panel);
      this.#bindings.set(tab, binding);
      i < length && this.#bindings.set(panel, binding);
    });

    this.#initialize();
  }

  activate(tab: HTMLElement, isMatch = false): void {
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

    this.#tabElements.forEach((t) => {
      const isSelected = this.#bindings.get(t)?.tabs.some((tt) => tt === tab);
      t.setAttribute('aria-selected', String(isSelected));
      t.setAttribute(
        'tabindex',
        isSelected && !this.#isAvoidedTab(t) ? '0' : '-1',
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
    const panel = this.#bindings.get(tab)?.panel;

    if (!panel) {
      return;
    }

    this.#panelElements.forEach((p) => {
      const { style } = p;

      if (fade || crossFade) {
        style.setProperty('content-visibility', 'visible');
        style.setProperty('display', 'block');
        style.setProperty('opacity', p.hidden ? '0' : '1');
      }

      style.setProperty('inline-size', '100%');
      style.setProperty('position', 'absolute');
      p === panel && !hasFocusable(p)
        ? p.setAttribute('tabindex', '0')
        : p.removeAttribute('tabindex');
    });

    this.#panelElements.forEach((p, i) => {
      if (p === panel) {
        p.removeAttribute('hidden');
      } else {
        const tab = this.#tabElements[i];

        if (!tab) {
          return;
        }

        p.setAttribute('hidden', isFocusable(tab) ? 'until-found' : '');
      }
    });

    this.#animation?.cancel();

    // content
    const { duration, easing } = this.#settings.animation.content;
    this.#animation = this.#contentElement.animate(
      {
        blockSize: [
          `${size}px`,
          getComputedStyle(panel).getPropertyValue('block-size'),
        ],
      },
      {
        duration: isMatch ? 0 : duration,
        easing: easing,
      },
    );

    const cleanup = (): void => {
      this.#animation = null;
    };

    this.#animationController = new AbortController();
    const { signal } = this.#animationController;
    this.#animation.addEventListener('cancel', cleanup, {
      once: true,
      signal,
    });

    this.#animation.addEventListener(
      'finish',
      () => {
        this.#onAnimationFinish();
        cleanup();
      },
      {
        once: true,
        signal,
      },
    );

    // panel
    this.#panelElements.forEach((p) => {
      const binding = this.#bindings.get(p);

      if (!binding) {
        return;
      }

      const opacity = getComputedStyle(p).getPropertyValue('opacity');
      binding.animation?.cancel();
      const isSelected = p === panel;
      const animation = p.animate(
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

      const cleanup = (): void => {
        if (binding.animation === animation) {
          binding.animation = null;
        }
      };

      this.#animationController = new AbortController();
      const { signal } = this.#animationController;
      animation.addEventListener('cancel', cleanup, { once: true, signal });
      animation.addEventListener('finish', cleanup, { once: true, signal });
    });
  }

  async destroy(force = false): Promise<void> {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;
    this.#eventController?.abort();
    this.#eventController = null;

    this.#cleanupsRovingTabIndex.forEach((cleanup) => {
      cleanup();
    });

    this.#cleanupsRovingTabIndex.length = 0;

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

    this.#onAnimationFinish();
    this.#animationController?.abort();
    this.#animationController = null;
    restoreAttributes([
      ...this.#listElements,
      ...this.#tabElements,
      ...this.#indicatorElements,
      ...this.#panelElements,
    ]);
    this.#listElements.length = 0;
    this.#tabElements.length = 0;
    this.#contentElement = null;
    this.#panelElements.length = 0;
    this.#rootElement.removeAttribute('data-tabs-initialized');
  }

  #initialize(): void {
    this.#eventController = new AbortController();
    const { signal } = this.#eventController;
    saveAttributes(this.#listElements, [
      'aria-hidden',
      'aria-orientation',
      'role',
      'style',
    ]);

    this.#listElements.forEach((list, i) => {
      this.#settings.avoidDuplicates &&
        i &&
        list.setAttribute('aria-hidden', 'true');
      this.#settings.vertical &&
        list.setAttribute('aria-orientation', 'vertical');
      list.setAttribute('role', 'tablist');
    });

    saveAttributes(this.#tabElements, [
      'aria-controls',
      'id',
      'role',
      'style',
      'tabindex',
    ]);

    this.#tabElements.forEach((tab, i) => {
      const id = Math.random().toString(36).slice(-8);
      const panel = this.#panelElements[i % this.#panelElements.length];

      if (!panel) {
        return;
      }

      i < this.#panelElements.length &&
        saveAttributes(
          [panel],
          ['aria-controls', 'aria-labelledby', 'id', 'role', 'tabindex'],
        );
      panel.id ||= `tabs-panel-${id}`;
      addTokenToAttribute(tab, 'aria-controls', panel.id);
      !tab.hasAttribute('aria-selected') &&
        tab.setAttribute('aria-selected', 'false');
      const isAvoided = this.#isAvoidedTab(tab);

      if (!isAvoided) {
        tab.id ||= `tabs-tab-${id}`;
      }

      tab.setAttribute('role', 'tab');
      !isFocusable(tab) && tab.style.setProperty('pointer-events', 'none');
      addTokenToAttribute(panel, 'aria-labelledby', tab.id);
      tab.addEventListener('click', this.#onTabClick, { signal });
      tab.addEventListener('focus', this.#onTabFocus, { signal });
      tab.addEventListener('keydown', this.#onTabKeyDown, { signal });
    });

    saveAttributes(this.#indicatorElements, ['style']);

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
      !panel.hasAttribute('hidden') &&
        !hasFocusable(panel) &&
        panel.setAttribute('tabindex', '0');
      panel.addEventListener('beforematch', this.#onPanelBeforeMatch, {
        signal,
      });
    });

    this.#listElements.forEach((list) => {
      this.#cleanupsRovingTabIndex.push(
        createRovingTabIndex(list, {
          direction:
            list.ariaOrientation === 'undefined'
              ? undefined
              : this.#settings.vertical
                ? 'vertical'
                : 'horizontal',
          selector: this.#settings.selector.tab,
          wrap: true,
        }),
      );

      list
        .querySelectorAll<HTMLElement>(this.#settings.selector.tab)
        .forEach((tab) => {
          tab.setAttribute(
            'tabindex',
            tab.ariaSelected === 'true' && !this.#isAvoidedTab(tab)
              ? '0'
              : '-1',
          );
        });
    });

    this.#rootElement.setAttribute('data-tabs-initialized', '');
  }

  #onTabClick = (event: MouseEvent): void => {
    event.preventDefault();
    const tab = event.currentTarget;

    if (!(tab instanceof HTMLElement)) {
      return;
    }

    this.activate(tab);
  };

  #onTabFocus = (event: FocusEvent): void => {
    const tab = event.currentTarget;

    if (!(tab instanceof HTMLElement)) {
      return;
    }

    !this.#settings.manual && tab.click();
    this.#isAvoidedTab(tab) && tab.blur();
  };

  #onTabKeyDown = (event: KeyboardEvent): void => {
    const { key, altKey, ctrlKey, metaKey, shiftKey } = event;

    if (altKey || ctrlKey || metaKey || shiftKey) {
      return;
    }

    if (!['Enter', ' '].includes(key)) {
      return;
    }

    const active = getActiveElement();

    if (!(active instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    active.click();
  };

  #onPanelBeforeMatch = (event: Event): void => {
    const panel = event.currentTarget;

    if (!(panel instanceof HTMLElement)) {
      return;
    }

    const tab = this.#bindings.get(panel)?.tabs[0];

    if (!tab) {
      return;
    }

    this.activate(tab, true);
  };

  #isAvoidedTab(tab: HTMLElement): boolean {
    const binding = this.#bindings.get(tab);

    if (!binding) {
      return false;
    }

    return this.#settings.avoidDuplicates && binding.tabs.indexOf(tab) > 0;
  }

  #mergeOptions(
    target: DeepRequired<TabsOptions>,
    source: TabsOptions,
  ): DeepRequired<TabsOptions> {
    return {
      ...target,
      ...source,
      animation: {
        content: {
          ...target.animation.content,
          ...(source.animation?.content ?? {}),
        },
        indicator: {
          ...target.animation.indicator,
          ...(source.animation?.indicator ?? {}),
        },
      },
      selector: {
        ...target.selector,
        ...(source.selector ?? {}),
      },
    };
  }

  #onAnimationFinish(): void {
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

  #update = (): void => {
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
    this.#listElement = null;
  }
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function createBinding(tabs: HTMLElement[], panel: HTMLElement): Binding {
  return { tabs, panel, animation: null };
}

function getActiveElement(): Element | null {
  let current = document.activeElement;

  while (current?.shadowRoot?.activeElement) {
    current = current.shadowRoot.activeElement;
  }

  return current;
}

function hasFocusable(container: HTMLElement): boolean {
  return !![
    ...container.querySelectorAll<HTMLElement>(
      `:is(a[href], area[href], button, embed, iframe, input:not([type="hidden" i]), object, select, details > summary:first-of-type, textarea, [contenteditable]:not([contenteditable="false" i]), [controls], [tabindex]):not(:disabled, [hidden], [inert], [tabindex="-1"])`,
    ),
  ].filter((element) => element.checkVisibility()).length;
}

function isFocusable(element: HTMLElement): boolean {
  return !element.hasAttribute('disabled');
}
