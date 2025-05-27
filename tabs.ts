type TabsOptions = {
  manual: boolean;
  selector: {
    list: string;
    tab: string;
    indicator: string;
    content: string;
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

export class Tabs {
  private rootElement: HTMLElement;
  private defaults: TabsOptions;
  private settings: TabsOptions;
  private listElements: NodeListOf<HTMLElement>;
  private tabElements: NodeListOf<HTMLElement>;
  private indicatorElements: NodeListOf<HTMLElement>;
  private contentElement: HTMLElement;
  private panelElements: NodeListOf<HTMLElement>;
  private contentAnimation: Animation | null = null;
  private panelAnimations: (Animation | null)[] = [];

  constructor(root: HTMLElement, options?: Partial<TabsOptions>) {
    this.rootElement = root;
    this.defaults = {
      manual: false,
      selector: {
        list: '[role="tablist"]',
        tab: '[role="tab"]',
        indicator: '[data-tabs-indicator]',
        content: '[role="tablist"] + *',
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settings.animation.duration = this.settings.animation.indicatorDuration = 0;
    }
    const NOT_NESTED = `:not(:scope ${this.settings.selector.panel} *)`;
    this.listElements = this.rootElement.querySelectorAll(`${this.settings.selector.list}${NOT_NESTED}`);
    this.tabElements = this.rootElement.querySelectorAll(`${this.settings.selector.tab}${NOT_NESTED}`);
    this.indicatorElements = this.rootElement.querySelectorAll(`${this.settings.selector.indicator}${NOT_NESTED}`);
    this.contentElement = this.rootElement.querySelector(this.settings.selector.content) as HTMLElement;
    this.panelElements = this.rootElement.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`);
    if (!this.listElements.length || !this.tabElements.length || !this.contentElement || !this.panelElements.length) {
      return;
    }
    this.contentAnimation = null;
    this.panelAnimations = Array(this.panelElements.length).fill(null);
    this.handleListKeyDown = this.handleListKeyDown.bind(this);
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handlePanelBeforeMatch = this.handlePanelBeforeMatch.bind(this);
    this.initialize();
  }

  private initialize(): void {
    this.listElements.forEach(list => {
      list.addEventListener('keydown', this.handleListKeyDown);
    });
    this.tabElements.forEach((tab, i) => {
      const id = Math.random().toString(36).slice(-8);
      tab.setAttribute('aria-controls', (this.panelElements[i % this.panelElements.length]!.id ||= `tab-panel-${id}`));
      if (i < this.panelElements.length) {
        tab.setAttribute('id', tab.getAttribute('id') || `tab-${id}`);
      }
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      if (!this.isFocusable(tab)) {
        tab.style.setProperty('pointer-events', 'none');
      }
      tab.addEventListener('click', this.handleTabClick);
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
    this.panelElements.forEach((panel, i) => {
      panel.setAttribute('aria-labelledby', `${panel.getAttribute('aria-labelledby') || ''} ${this.tabElements[i]!.getAttribute('id')}`.trim());
      if (!panel.hasAttribute('hidden')) {
        panel.setAttribute('tabindex', '0');
      }
      panel.addEventListener('beforematch', this.handlePanelBeforeMatch);
    });
    this.rootElement.setAttribute('data-tabs-initialized', '');
  }

  private isFocusable(element: HTMLElement): boolean {
    return element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
  }

  private handleListKeyDown(event: KeyboardEvent): void {
    const list = event.currentTarget as HTMLElement;
    const isHorizontal = list.getAttribute('aria-orientation') !== 'vertical';
    const PREVIOUS_KEY = `Arrow${isHorizontal ? 'Left' : 'Up'}`;
    const NEXT_KEY = `Arrow${isHorizontal ? 'Right' : 'Down'}`;
    const { key } = event;
    if (!['Enter', ' ', 'End', 'Home', PREVIOUS_KEY, NEXT_KEY].includes(key)) {
      return;
    }
    event.preventDefault();
    const active = document.activeElement as HTMLElement;
    if (['Enter', ' '].includes(key)) {
      active.click();
      return;
    }
    const focusables = ([...list.querySelectorAll(this.settings.selector.tab)] as HTMLElement[]).filter(this.isFocusable);
    const currentIndex = [...focusables].indexOf(active);
    const length = focusables.length;
    let newIndex;
    switch (key) {
      case 'End':
        newIndex = length - 1;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case PREVIOUS_KEY:
        newIndex = (currentIndex - 1 + length) % length;
        break;
      case NEXT_KEY:
        newIndex = (currentIndex + 1) % length;
        break;
    }
    const tab = focusables[newIndex]!;
    tab.focus();
    if (!this.settings.manual) {
      tab.click();
    }
  }

  private handleTabClick(event: MouseEvent): void {
    event.preventDefault();
    const tab = event.currentTarget as HTMLElement;
    if (tab.getAttribute('aria-selected') === 'true') {
      return;
    }
    this.activate(tab);
  }

  private handlePanelBeforeMatch(event: Event): void {
    const tab = document.querySelector(`[aria-controls="${(event.currentTarget as HTMLElement).getAttribute('id')}"]`) as HTMLElement;
    if (tab.getAttribute('aria-selected') === 'true') {
      return;
    }
    this.activate(tab, true);
  }

  activate(tab: HTMLElement, isMatch = false): void {
    this.rootElement.setAttribute('data-tabs-animating', '');
    const id = tab.getAttribute('aria-controls');
    [...this.tabElements].forEach(tab => {
      const isSelected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
    Object.assign(this.contentElement.style, {
      overflow: 'clip',
      position: 'relative',
    });
    [...this.panelElements].forEach(panel => {
      if (panel.getAttribute('id') === id) {
        panel.setAttribute('tabindex', '0');
      } else {
        panel.removeAttribute('tabindex');
      }
      if (this.settings.animation.crossFade) {
        Object.assign(panel.style, {
          contentVisibility: 'visible',
          display: 'block',
          opacity: !panel.hasAttribute('hidden') ? '1' : '0',
        });
      }
      panel.style.setProperty('position', 'absolute');
    });
    const blockSize = parseInt(window.getComputedStyle(this.contentElement).getPropertyValue('block-size')) || parseInt(window.getComputedStyle([...this.panelElements].find(panel => !panel.hasAttribute('hidden'))!).getPropertyValue('block-size'));
    [...this.panelElements].forEach((panel, i) => {
      if (panel.getAttribute('id') === id) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', this.isFocusable(this.tabElements[i]!) ? 'until-found' : '');
      }
    });
    if (this.contentAnimation) {
      this.contentAnimation.cancel();
    }
    this.contentAnimation = this.contentElement.animate({ blockSize: [`${blockSize}px`, window.getComputedStyle(document.getElementById(id!)!).getPropertyValue('block-size')] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: this.settings.animation.easing });
    this.contentAnimation.addEventListener('finish', () => {
      this.contentAnimation = null;
      this.rootElement.removeAttribute('data-tabs-animating');
      ['block-size', 'overflow', 'position'].forEach(name => {
        this.contentElement.style.removeProperty(name);
      });
      [...this.panelElements].forEach(panel => {
        ['content-visibility', 'display', 'position'].forEach(name => {
          panel.style.removeProperty(name);
        });
      });
    });
    if (this.settings.animation.crossFade) {
      [...this.panelElements].forEach((panel, i) => {
        let animation = this.panelAnimations[i];
        const opacity = window.getComputedStyle(panel).getPropertyValue('opacity');
        if (animation) {
          animation.cancel();
        }
        animation = this.panelAnimations[i] = panel.animate({ opacity: panel.getAttribute('id') === id ? [opacity, '1'] : [opacity, '0'] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: 'ease' });
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
    this.initialize();
  }

  private initialize(): void {
    const update = this.update.bind(this);
    new ResizeObserver(update).observe(this.listElement);
    new MutationObserver(update).observe(this.listElement, { attributeFilter: ['aria-selected'], subtree: true });
  }

  private update(): void {
    if (!this.indicatorElement.checkVisibility()) {
      return;
    }
    const isHorizontal = this.listElement.getAttribute('aria-orientation') !== 'vertical';
    const position = isHorizontal ? 'insetInlineStart' : 'insetBlockStart';
    const size = isHorizontal ? 'inlineSize' : 'blockSize';
    const rect = this.listElement.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
    this.indicatorElement.animate({ [position]: `${rect[isHorizontal ? 'left' : 'top'] - this.listElement.getBoundingClientRect()[isHorizontal ? 'left' : 'top']}px`, [size]: `${rect[isHorizontal ? 'width' : 'height']}px` }, { duration: this.settings.animation.indicatorDuration, easing: this.settings.animation.indicatorEasing, fill: 'forwards' });
  }
}
