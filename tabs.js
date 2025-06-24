export class Tabs {
  constructor(root, options) {
    if (!root) {
      return;
    }
    this.rootElement = root;
    this.defaults = {
      selector: {
        list: '[role="tablist"]',
        tab: '[role="tab"]',
        indicator: '[data-tabs-indicator]',
        content: '[role="tablist"] + *',
        panel: '[role="tabpanel"]',
      },
      animation: {
        indicator: {
          duration: 300,
          easing: 'ease',
        },
        content: {
          crossFade: true,
          duration: 300,
          easing: 'ease',
          fade: false,
        },
      },
      manual: false,
    };
    this.settings = {
      ...this.defaults,
      ...options,
      selector: { ...this.defaults.selector, ...options?.selector },
      animation: {
        indicator: { ...this.defaults.animation.indicator, ...options?.animation?.indicator },
        content: { ...this.defaults.animation.content, ...options?.animation?.content },
      },
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.settings.animation.indicator.duration = this.settings.animation.content.duration = 0;
    }
    const NOT_NESTED = `:not(:scope ${this.settings.selector.panel} *)`;
    this.listElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.list}${NOT_NESTED}`)];
    this.tabElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.tab}${NOT_NESTED}`)];
    this.indicatorElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.indicator}${NOT_NESTED}`)];
    this.contentElement = this.rootElement.querySelector(this.settings.selector.content);
    this.panelElements = [...this.rootElement.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`)];
    this.contentAnimation = null;
    this.panelAnimations = Array(this.panelElements.length).fill(null);
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handleTabKeyDown = this.handleTabKeyDown.bind(this);
    this.handlePanelBeforeMatch = this.handlePanelBeforeMatch.bind(this);
    this.initialize();
  }

  initialize() {
    if (!this.listElements.length || !this.tabElements.length || !this.contentElement || !this.panelElements.length) {
      return;
    }
    this.listElements.forEach((list, i) => {
      if (i) {
        list.ariaHidden = 'true';
      }
      list.role = 'tablist';
    });
    this.tabElements.forEach((tab, i) => {
      const id = Math.random().toString(36).slice(-8);
      tab.setAttribute('aria-controls', (this.panelElements[i % this.panelElements.length].id ||= `tab-panel-${id}`));
      if (!tab.ariaSelected) {
        tab.ariaSelected = 'false';
      }
      const duplicates = this.isDuplicates(tab);
      if (!duplicates) {
        tab.id ||= `tab-${id}`;
      }
      tab.role = 'tab';
      tab.tabIndex = tab.ariaSelected === 'true' && !duplicates ? 0 : -1;
      if (!this.isFocusable(tab)) {
        tab.style.setProperty('pointer-events', 'none');
      }
      tab.addEventListener('click', this.handleTabClick);
      tab.addEventListener('keydown', this.handleTabKeyDown);
    });
    if (this.indicatorElements.length) {
      this.indicatorElements.forEach(indicator => {
        const list = indicator.closest(this.settings.selector.list);
        list.style.setProperty('position', 'relative');
        Object.assign(indicator.style, {
          display: 'block',
          position: 'absolute',
        });
        new TabsIndicator(indicator, list, this.settings);
      });
    }
    this.panelElements.forEach((panel, i) => {
      panel.setAttribute('aria-labelledby', `${panel.getAttribute('aria-labelledby') || ''} ${this.tabElements[i].id}`.trim());
      panel.role = 'tabpanel';
      if (!panel.hidden) {
        panel.tabIndex = 0;
      }
      panel.addEventListener('beforematch', this.handlePanelBeforeMatch);
    });
    this.rootElement.setAttribute('data-tabs-initialized', '');
  }

  getActiveElement() {
    let active = document.activeElement;
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active instanceof HTMLElement ? active : null;
  }

  isDuplicates(tab) {
    return this.tabElements.indexOf(tab) >= this.panelElements.length;
  }

  isFocusable(element) {
    return element.ariaDisabled !== 'true' && !element.hasAttribute('disabled');
  }

  handleTabClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this.activate(event.currentTarget);
  }

  handleTabKeyDown(event) {
    const list = event.currentTarget.closest(this.settings.selector.list);
    const horizontal = list.ariaOrientation !== 'vertical';
    const PREVIOUS_KEY = `Arrow${horizontal ? 'Left' : 'Up'}`;
    const NEXT_KEY = `Arrow${horizontal ? 'Right' : 'Down'}`;
    const { key } = event;
    if (!['Enter', ' ', 'End', 'Home', PREVIOUS_KEY, NEXT_KEY].includes(key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const focusables = [...list.querySelectorAll(this.settings.selector.tab)].filter(this.isFocusable);
    const length = focusables.length;
    const active = this.getActiveElement();
    const current = active instanceof HTMLElement ? active : null;
    if (!current) {
      return;
    }
    const currentIndex = focusables.indexOf(current);
    let newIndex;
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
      case PREVIOUS_KEY:
        newIndex = (currentIndex - 1 + length) % length;
        break;
      case NEXT_KEY:
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

  handlePanelBeforeMatch(event) {
    this.activate(document.querySelector(`[aria-controls="${event.currentTarget.id}"]`), true);
  }

  activate(tab, match = false) {
    if (!this.tabElements.includes(tab)) {
      return;
    }
    if (tab.ariaSelected === 'true') {
      return;
    }
    this.rootElement.setAttribute('data-tabs-animating', '');
    const id = tab.getAttribute('aria-controls');
    this.tabElements.forEach(tab => {
      const selected = tab.getAttribute('aria-controls') === id;
      tab.ariaSelected = String(selected);
      tab.tabIndex = selected && !this.isDuplicates(tab) ? 0 : -1;
    });
    Object.assign(this.contentElement.style, {
      overflow: 'clip',
      position: 'relative',
    });
    this.panelElements.forEach(panel => {
      if (panel.id === id) {
        panel.tabIndex = 0;
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
    const size = parseInt(window.getComputedStyle(this.contentElement).getPropertyValue('block-size')) || parseInt(window.getComputedStyle(this.panelElements.find(panel => !panel.hidden)).getPropertyValue('block-size'));
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
        blockSize: [`${size}px`, window.getComputedStyle(document.getElementById(id)).getPropertyValue('block-size')],
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
  constructor(indicator, list, settings) {
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

  update() {
    if (!this.indicatorElement.checkVisibility()) {
      return;
    }
    const horizontal = this.listElement.ariaOrientation !== 'vertical';
    const position = horizontal ? 'insetInlineStart' : 'insetBlockStart';
    const size = horizontal ? 'inlineSize' : 'blockSize';
    const { x, y, width, height } = this.listElement.querySelector('[aria-selected="true"]').getBoundingClientRect();
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
