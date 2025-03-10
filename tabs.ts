type TabsOptions = {
  manual: boolean;
  selector: {
    list: string;
    tab: string;
    indicator: string;
    panels: string;
    panel: string;
  };
  animation: {
    crossFade: boolean;
    duration: number;
    easing: string;
    indicatorDuration: number;
    indicatorEasing: string;
  };
};

class Tabs {
  rootElement: HTMLElement;
  defaults: TabsOptions;
  settings: TabsOptions;
  listElements: NodeListOf<HTMLElement>;
  tabElements: NodeListOf<HTMLElement>;
  indicatorElements: NodeListOf<HTMLElement>;
  panelsElement: HTMLElement;
  panelElements: NodeListOf<HTMLElement>;
  animation!: Animation | null;
  panelAnimations!: (Animation | null)[];

  constructor(root: HTMLElement, options?: Partial<TabsOptions>) {
    this.rootElement = root;
    this.defaults = {
      manual: false,
      selector: {
        list: '[role="tablist"]',
        tab: '[role="tab"]',
        indicator: '[data-tabs-indicator]',
        panels: '[role="tablist"] + *',
        panel: '[role="tabpanel"]',
      },
      animation: {
        crossFade: true,
        duration: 300,
        easing: 'ease',
        indicatorDuration: 300,
        indicatorEasing: 'ease',
      },
    };
    this.settings = {
      ...this.defaults,
      ...options,
      selector: { ...this.defaults.selector, ...options?.selector },
      animation: { ...this.defaults.animation, ...options?.animation },
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.settings.animation.duration = this.settings.animation.indicatorDuration = 0;
    let NOT_NESTED = `:not(:scope ${this.settings.selector.panel} *)`;
    this.listElements = this.rootElement.querySelectorAll(`${this.settings.selector.list}${NOT_NESTED}`);
    this.tabElements = this.rootElement.querySelectorAll(`${this.settings.selector.tab}${NOT_NESTED}`);
    this.indicatorElements = this.rootElement.querySelectorAll(`${this.settings.selector.indicator}${NOT_NESTED}`);
    this.panelsElement = this.rootElement.querySelector(this.settings.selector.panels) as HTMLElement;
    this.panelElements = this.rootElement.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`);
    if (!this.listElements.length || !this.tabElements.length || !this.panelsElement || !this.panelElements.length) return;
    this.animation = null;
    this.panelAnimations = Array(this.panelElements.length).fill(null);
    this.initialize();
  }

  private initialize(): void {
    this.listElements.forEach(list => list.addEventListener('keydown', event => this.handleListKeyDown(event)));
    this.tabElements.forEach((tab, i) => {
      let id = Math.random().toString(36).slice(-8);
      if (i < this.panelElements.length) {
        tab.setAttribute('id', tab.getAttribute('id') || `tab-${id}`);
        let panel = this.panelElements[i];
        panel.setAttribute('id', panel.getAttribute('id') || `tab-panel-${id}`);
      }
      tab.setAttribute('aria-controls', this.panelElements[i % this.panelElements.length].getAttribute('id')!);
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      if (!this.isFocusable(tab)) tab.style.setProperty('pointer-events', 'none');
      tab.addEventListener('click', event => this.handleTabClick(event));
    });
    if (this.indicatorElements.length) {
      this.indicatorElements.forEach(indicator => {
        let list = indicator.closest(this.settings.selector.list) as HTMLElement;
        list.style.setProperty('position', 'relative');
        indicator.style.setProperty('display', 'block');
        indicator.style.setProperty('position', 'absolute');
        new TabsIndicator(indicator, list, this.settings);
      });
    }
    this.panelElements.forEach((panel, i) => {
      panel.setAttribute('aria-labelledby', `${panel.getAttribute('aria-labelledby') || ''} ${this.tabElements[i].getAttribute('id')}`.trim());
      if (!panel.hasAttribute('hidden')) panel.setAttribute('tabindex', '0');
      panel.addEventListener('beforematch', event => this.handlePanelBeforeMatch(event));
    });

    // Fix for WebKit
    this.panelElements.forEach(panel => {
      new ResizeObserver(() => {
        let height = panel.scrollHeight;
        if (!height) return;
        window.requestAnimationFrame(() => {
          this.panelsElement.style.setProperty('height', `${height}px`);
          window.requestAnimationFrame(() => this.panelsElement.style.removeProperty('height'));
        });
      }).observe(panel);
    });

    this.rootElement.setAttribute('data-tabs-initialized', '');
  }

  private isFocusable(element: HTMLElement): boolean {
    return element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
  }

  private handleListKeyDown(event: KeyboardEvent): void {
    let list = event.currentTarget as HTMLElement;
    let isHorizontal = list.getAttribute('aria-orientation') !== 'vertical';
    let previous = `Arrow${isHorizontal ? 'Left' : 'Up'}`;
    let next = `Arrow${isHorizontal ? 'Right' : 'Down'}`;
    let { key } = event;
    if (![' ', 'Enter', previous, next, 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    let active = document.activeElement as HTMLElement;
    if ([' ', 'Enter'].includes(key)) {
      active.click();
      return;
    }
    let focusableTabs = ([...list.querySelectorAll(this.settings.selector.tab)] as HTMLElement[]).filter(this.isFocusable);
    let currentIndex = [...focusableTabs].indexOf(active);
    let length = focusableTabs.length;
    let newIndex = currentIndex;
    switch (key) {
      case previous:
        newIndex = (currentIndex - 1 + length) % length;
        break;
      case next:
        newIndex = (currentIndex + 1) % length;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = length - 1;
        break;
    }
    let tab = focusableTabs[newIndex] as HTMLElement;
    tab.focus();
    if (!this.settings.manual) tab.click();
  }

  private handleTabClick(event: MouseEvent): void {
    event.preventDefault();
    let tab = event.currentTarget as HTMLElement;
    if (tab.getAttribute('aria-selected') === 'true') return;
    this.activate(tab);
  }

  private handlePanelBeforeMatch(event: Event): void {
    let tab = document.querySelector(`[aria-controls="${(event.currentTarget as HTMLElement).getAttribute('id')}"]`) as HTMLElement;
    if (tab.getAttribute('aria-selected') === 'true') return;
    this.activate(tab, true);
  }

  activate(tab: HTMLElement, isMatch = false): void {
    let root = this.rootElement;
    root.setAttribute('data-tabs-animating', '');
    let id = tab.getAttribute('aria-controls');
    [...this.tabElements].forEach((tab, i) => {
      let isSelected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
    this.panelsElement.style.setProperty('overflow', 'clip');
    this.panelsElement.style.setProperty('position', 'relative');
    this.panelsElement.style.setProperty('will-change', [...new Set(window.getComputedStyle(this.panelsElement).getPropertyValue('will-change').split(',')).add('height').values()].filter(value => value !== 'auto').join(','));
    [...this.panelElements].forEach(panel => {
      if (panel.getAttribute('id') === id) {
        panel.setAttribute('tabindex', '0');
      } else {
        panel.removeAttribute('tabindex');
      }
      if (this.settings.animation.crossFade) {
        panel.style.setProperty('content-visibility', 'visible');
        panel.style.setProperty('display', 'block');
        panel.style.setProperty('opacity', !panel.hasAttribute('hidden') ? '1' : '0');
      }
      panel.style.setProperty('position', 'absolute');
    });
    let height = this.panelsElement.offsetHeight || [...this.panelElements].find(panel => !panel.hasAttribute('hidden'))!.offsetHeight;
    [...this.panelElements].forEach((panel, i) => {
      if (panel.getAttribute('id') === id) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', this.isFocusable(this.tabElements[i]) ? 'until-found' : '');
      }
    });
    if (this.animation) this.animation.cancel();
    this.animation = this.panelsElement.animate({ height: [`${height}px`, `${document.getElementById(id!)!.scrollHeight}px`] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: this.settings.animation.easing });
    this.animation.addEventListener('finish', () => {
      this.animation = null;
      root.removeAttribute('data-tabs-animating');
      ['height', 'overflow', 'position', 'will-change'].forEach(name => this.panelsElement.style.removeProperty(name));
      [...this.panelElements].forEach(panel => ['content-visibility', 'display', 'position'].forEach(name => panel.style.removeProperty(name)));
    });
    if (this.settings.animation.crossFade) {
      [...this.panelElements].forEach((panel, i) => {
        panel.style.setProperty('will-change', [...new Set(window.getComputedStyle(panel).getPropertyValue('will-change').split(',')).add('opacity').values()].filter(value => value !== 'auto').join(','));
        let animation = this.panelAnimations[i];
        let opacity = window.getComputedStyle(panel).getPropertyValue('opacity');
        if (animation) animation.cancel();
        animation = this.panelAnimations[i] = panel.animate({ opacity: panel.getAttribute('id') === id ? [opacity, '1'] : [opacity, '0'] }, { duration: !isMatch ? this.settings.animation.duration : 0, fill: 'forwards' });
        animation.addEventListener('finish', () => {
          this.panelAnimations[i] = null;
          ['opacity', 'will-change'].forEach(name => panel.style.removeProperty(name));
        });
      });
    }
  }
}

class TabsIndicator {
  indicatorElement: HTMLElement;
  listElement: HTMLElement;
  settings: TabsOptions;

  constructor(indicator: HTMLElement, list: HTMLElement, settings: TabsOptions) {
    this.indicatorElement = indicator;
    this.listElement = list;
    this.settings = settings;
    this.initialize();
  }

  private initialize(): void {
    let update = (): void => this.update();
    new ResizeObserver(update).observe(this.listElement);
    new MutationObserver(update).observe(this.listElement, { attributeFilter: ['aria-selected'], subtree: true });
  }

  private update(): void {
    if (!this.indicatorElement.checkVisibility()) return;
    let isHorizontal = this.listElement.getAttribute('aria-orientation') !== 'vertical';
    let position: keyof DOMRect = isHorizontal ? 'left' : 'top';
    let size: keyof DOMRect = isHorizontal ? 'width' : 'height';
    this.indicatorElement.style.setProperty('will-change', [...new Set(window.getComputedStyle(this.indicatorElement).getPropertyValue('will-change').split(',')).add(position).add(size).values()].filter(value => value !== 'auto').join(','));
    let rect = this.listElement.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    this.indicatorElement.animate({ [position]: `${rect[position] - this.listElement.getBoundingClientRect()[position]}px`, [size]: `${rect[size]}px` }, { duration: this.settings.animation.indicatorDuration, easing: this.settings.animation.indicatorEasing, fill: 'forwards' }).addEventListener('finish', () => this.indicatorElement.style.removeProperty('will-change'));
  }
}

export default Tabs;
