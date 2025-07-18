type TabsOptions = {
  animation: {
    content: {
      crossFade: boolean;
      duration: number;
      easing: string;
      fade: boolean;
    };
    indicator: {
      duration: number;
      easing: string;
    };
  };
  avoidDuplicates: boolean;
  manual: boolean;
  selector: {
    content: string;
    indicator: string;
    list: string;
    panel: string;
    tab: string;
  };
  vertical: boolean;
};

export class Tabs {
  private rootElement!: HTMLElement;
  private defaults!: TabsOptions;
  private settings!: TabsOptions;
  private listElements!: HTMLElement[];
  private tabElements!: HTMLElement[];
  private indicatorElements!: HTMLElement[];
  private contentElement!: HTMLElement;
  private panelElements!: HTMLElement[];
  private contentAnimation!: Animation | null;
  private panelAnimations!: (Animation | null)[];

  constructor(root: HTMLElement, options?: Partial<TabsOptions>) {
    if (!root) {
      return;
    }
    this.rootElement = root;
    this.defaults = {
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
    this.settings = {
      ...this.defaults,
      ...options,
      animation: {
        content: { ...this.defaults.animation.content, ...options?.animation?.content },
        indicator: { ...this.defaults.animation.indicator, ...options?.animation?.indicator },
      },
      selector: { ...this.defaults.selector, ...options?.selector },
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settings.animation.indicator.duration = this.settings.animation.content.duration = 0;
    }
    const NOT_NESTED = `:not(:scope ${this.settings.selector.panel} *)`;
    this.listElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.list}${NOT_NESTED}`)] as HTMLElement[];
    this.tabElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.tab}${NOT_NESTED}`)] as HTMLElement[];
    this.indicatorElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.indicator}${NOT_NESTED}`)] as HTMLElement[];
    this.contentElement = this.rootElement.querySelector(this.settings.selector.content) as HTMLElement;
    this.panelElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`)] as HTMLElement[];
    this.contentAnimation = null;
    this.panelAnimations = Array(this.panelElements.length).fill(null);
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handleTabKeyDown = this.handleTabKeyDown.bind(this);
    this.handlePanelBeforeMatch = this.handlePanelBeforeMatch.bind(this);
    this.initialize();
  }

  private initialize(): void {
    if (!this.listElements.length || !this.tabElements.length || !this.contentElement || !this.panelElements.length) {
      return;
    }
    this.listElements.forEach((list, i) => {
      if (this.settings.avoidDuplicates && i) {
        list.setAttribute('aria-hidden', 'true');
      }
      if (this.settings.vertical) {
        list.setAttribute('aria-orientation', 'vertical');
      }
      list.setAttribute('role', 'tablist');
    });
    this.tabElements.forEach((tab, i) => {
      const id = Math.random().toString(36).slice(-8);
      tab.setAttribute('aria-controls', (this.panelElements[i % this.panelElements.length].id ||= `tabs-panel-${id}`));
      if (!tab.hasAttribute('aria-selected')) {
        tab.setAttribute('aria-selected', 'false');
      }
      const duplicates = this.isDuplicates(tab);
      if (!this.settings.avoidDuplicates || !duplicates) {
        tab.id ||= `tabs-tab-${id}`;
      }
      tab.setAttribute('role', 'tab');
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' && (!this.settings.avoidDuplicates || !duplicates) ? '0' : '-1');
      if (!this.isFocusable(tab)) {
        tab.style.setProperty('pointer-events', 'none');
      }
      const panel = this.panelElements[i % this.panelElements.length];
      panel.setAttribute('aria-labelledby', `${panel.getAttribute('aria-labelledby') || ''} ${tab.id}`.trim());
      tab.addEventListener('click', this.handleTabClick);
      tab.addEventListener('keydown', this.handleTabKeyDown);
    });
    if (this.indicatorElements.length) {
      this.indicatorElements.forEach(indicator => {
        const list = indicator.closest(this.settings.selector.list) as HTMLElement;
        list.style.setProperty('position', 'relative');
        Object.assign(indicator.style, {
          display: 'block',
          position: 'absolute',
        });
        new TabsIndicator(indicator, list, this.settings);
      });
    }
    this.panelElements.forEach(panel => {
      panel.setAttribute('role', 'tabpanel');
      if (!panel.hasAttribute('hidden')) {
        panel.setAttribute('tabindex', '0');
      }
      panel.addEventListener('beforematch', this.handlePanelBeforeMatch);
    });
    this.rootElement.setAttribute('data-tabs-initialized', '');
  }

  private getActiveElement(): HTMLElement | null {
    let active: Element | null = document.activeElement;
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active instanceof HTMLElement ? active : null;
  }

  private isDuplicates(tab: HTMLElement): boolean {
    return this.tabElements.indexOf(tab) >= this.panelElements.length;
  }

  private isFocusable(element: HTMLElement): boolean {
    return element.getAttribute('aria-hidden') !== 'true' && !element.hasAttribute('disabled');
  }

  private handleTabClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.activate(event.currentTarget as HTMLElement);
  }

  private handleTabKeyDown(event: KeyboardEvent): void {
    const list = (event.currentTarget as HTMLElement).closest(this.settings.selector.list) as HTMLElement;
    const both = list.getAttribute('aria-orientation') === 'undefined';
    const horizontal = list.getAttribute('aria-orientation') !== 'vertical';
    const { key } = event;
    if (!['Enter', ' ', 'End', 'Home', ...(both ? ['ArrowLeft', 'ArrowUp'] : [`Arrow${horizontal ? 'Left' : 'Up'}`]), ...(both ? ['ArrowRight', 'ArrowDown'] : [`Arrow${horizontal ? 'Right' : 'Down'}`])].includes(key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const focusables = ([...list.querySelectorAll(this.settings.selector.tab)] as HTMLElement[]).filter(this.isFocusable);
    const length = focusables.length;
    const active = this.getActiveElement();
    const current = active instanceof HTMLElement ? active : null;
    if (!current) {
      return;
    }
    const currentIndex = focusables.indexOf(current);
    let newIndex!: number;
    switch (key) {
      case 'Enter':
      case ' ':
        current.click();
        return;
      case 'End':
        newIndex = length - 1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        newIndex = (currentIndex - 1 + length) % length;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        newIndex = (currentIndex + 1) % length;
        break;
    }
    const tab = focusables[newIndex];
    tab.focus();
    if (this.settings.manual) {
      return;
    }
    tab.click();
  }

  private handlePanelBeforeMatch(event: Event): void {
    this.activate(this.rootElement.querySelector(`[aria-controls="${(event.currentTarget as HTMLElement).id}"]`) as HTMLElement, true);
  }

  activate(tab: HTMLElement, match = false): void {
    if (!this.tabElements.includes(tab)) {
      return;
    }
    if (tab.getAttribute('aria-selected') === 'true') {
      return;
    }
    this.rootElement.setAttribute('data-tabs-animating', '');
    const id = tab.getAttribute('aria-controls');
    this.tabElements.forEach(tab => {
      const selected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.setAttribute('tabindex', selected && (!this.settings.avoidDuplicates || !this.isDuplicates(tab)) ? '0' : '-1');
    });
    Object.assign(this.contentElement.style, {
      overflow: 'clip',
      position: 'relative',
    });
    this.panelElements.forEach(panel => {
      if (panel.id === id) {
        panel.setAttribute('tabindex', '0');
      } else {
        panel.removeAttribute('tabindex');
      }
      if (this.settings.animation.content.fade || this.settings.animation.content.crossFade) {
        Object.assign(panel.style, {
          contentVisibility: 'visible',
          display: 'block',
          opacity: !panel.hidden ? '1' : '0',
        });
      }
      panel.style.setProperty('position', 'absolute');
      panel.style.setProperty('width', '100%');
    });
    const size = parseInt(window.getComputedStyle(this.contentElement).getPropertyValue('block-size')) || parseInt(window.getComputedStyle(this.panelElements.find(panel => !panel.hidden)!).getPropertyValue('block-size'));
    this.panelElements.forEach((panel, i) => {
      if (panel.id === id) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', this.isFocusable(this.tabElements[i]) ? 'until-found' : '');
      }
    });
    if (this.contentAnimation) {
      this.contentAnimation.cancel();
    }
    this.contentAnimation = this.contentElement.animate(
      {
        blockSize: [`${size}px`, window.getComputedStyle(this.rootElement.querySelector(`#${id}`)!).getPropertyValue('block-size')],
      },
      {
        duration: !match ? this.settings.animation.content.duration : 0,
        easing: this.settings.animation.content.easing,
      },
    );
    this.contentAnimation.addEventListener('finish', () => {
      this.contentAnimation = null;
      this.rootElement.removeAttribute('data-tabs-animating');
      ['block-size', 'overflow', 'position'].forEach(name => this.contentElement.style.removeProperty(name));
      this.panelElements.forEach(panel => ['content-visibility', 'display', 'position', 'width'].forEach(name => panel.style.removeProperty(name)));
    });
    if (this.settings.animation.content.fade || this.settings.animation.content.crossFade) {
      this.panelElements.forEach((panel, i) => {
        let animation = this.panelAnimations[i];
        const selected = panel.id === id;
        const opacity = window.getComputedStyle(panel).getPropertyValue('opacity');
        if (animation) {
          animation.cancel();
        }
        animation = this.panelAnimations[i] = panel.animate(
          {
            opacity: this.settings.animation.content.fade ? (selected ? [opacity, opacity, '1'] : [opacity, '0', '0']) : selected ? [opacity, '1'] : [opacity, '0'],
          },
          {
            duration: !match ? this.settings.animation.content.duration : 0,
            easing: 'ease',
          },
        );
        animation.addEventListener('finish', () => {
          this.panelAnimations[i] = null;
          panel.style.removeProperty('opacity');
        });
      });
    }
  }
}

class TabsIndicator {
  private indicatorElement: HTMLElement;
  private listElement: HTMLElement;
  private settings: TabsOptions;

  constructor(indicator: HTMLElement, list: HTMLElement, settings: TabsOptions) {
    this.indicatorElement = indicator;
    this.listElement = list;
    this.settings = settings;
    const update = this.update.bind(this);
    new ResizeObserver(update).observe(this.listElement);
    new MutationObserver(update).observe(this.listElement, {
      attributeFilter: ['aria-selected'],
      subtree: true,
    });
  }

  private update(): void {
    if (!this.indicatorElement.checkVisibility()) {
      return;
    }
    const horizontal = this.listElement.getAttribute('aria-orientation') !== 'vertical';
    const position = horizontal ? 'insetInlineStart' : 'insetBlockStart';
    const size = horizontal ? 'inlineSize' : 'blockSize';
    const { x, y, width, height } = this.listElement.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    const { x: listX, y: listY } = this.listElement.getBoundingClientRect();
    this.indicatorElement.animate(
      {
        [position]: `${horizontal ? x - listX : y - listY}px`,
        [size]: `${horizontal ? width : height}px`,
      },
      {
        duration: this.settings.animation.indicator.duration,
        easing: this.settings.animation.indicator.easing,
        fill: 'forwards',
      },
    );
  }
}
