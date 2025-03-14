class Tabs {
  constructor(root, options) {
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
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.settings.animation.duration = this.settings.animation.indicatorDuration = 0;
    let NOT_NESTED = `:not(:scope ${this.settings.selector.panel} *)`;
    this.listElements = this.rootElement.querySelectorAll(`${this.settings.selector.list}${NOT_NESTED}`);
    this.tabElements = this.rootElement.querySelectorAll(`${this.settings.selector.tab}${NOT_NESTED}`);
    this.indicatorElements = this.rootElement.querySelectorAll(`${this.settings.selector.indicator}${NOT_NESTED}`);
    this.contentElement = this.rootElement.querySelector(this.settings.selector.content);
    this.panelElements = this.rootElement.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`);
    if (!this.listElements.length || !this.tabElements.length || !this.contentElement || !this.panelElements.length) return;
    this.animation = null;
    this.panelAnimations = Array(this.panelElements.length).fill(null);
    this.initialize();
  }

  initialize() {
    this.listElements.forEach(list => list.addEventListener('keydown', event => this.handleListKeyDown(event)));
    this.tabElements.forEach((tab, i) => {
      let id = Math.random().toString(36).slice(-8);
      tab.setAttribute('aria-controls', (this.panelElements[i % this.panelElements.length].id ||= `tab-panel-${id}`));
      if (i < this.panelElements.length) tab.setAttribute('id', tab.getAttribute('id') || `tab-${id}`);
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      if (!this.isFocusable(tab)) tab.style.setProperty('pointer-events', 'none');
      tab.addEventListener('click', event => this.handleTabClick(event));
    });
    if (this.indicatorElements.length) {
      this.indicatorElements.forEach(indicator => {
        let list = indicator.closest(this.settings.selector.list);
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
    this.rootElement.setAttribute('data-tabs-initialized', '');
  }

  isFocusable(element) {
    return element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
  }

  handleListKeyDown(event) {
    let list = event.currentTarget;
    let isHorizontal = list.getAttribute('aria-orientation') !== 'vertical';
    let PREVIOUS_KEY = `Arrow${isHorizontal ? 'Left' : 'Up'}`;
    let NEXT_KEY = `Arrow${isHorizontal ? 'Right' : 'Down'}`;
    let { key } = event;
    if (!['Enter', ' ', PREVIOUS_KEY, NEXT_KEY, 'End', 'Home'].includes(key)) return;
    event.preventDefault();
    let active = document.activeElement;
    if (['Enter', ' '].includes(key)) {
      active.click();
      return;
    }
    let focusables = [...list.querySelectorAll(this.settings.selector.tab)].filter(this.isFocusable);
    let currentIndex = [...focusables].indexOf(active);
    let length = focusables.length;
    let newIndex = 0;
    switch (key) {
      case PREVIOUS_KEY:
        newIndex = (currentIndex - 1 + length) % length;
        break;
      case NEXT_KEY:
        newIndex = (currentIndex + 1) % length;
        break;
      case 'End':
        newIndex = length - 1;
        break;
    }
    let tab = focusables[newIndex];
    tab.focus();
    if (!this.settings.manual) tab.click();
  }

  handleTabClick(event) {
    event.preventDefault();
    let tab = event.currentTarget;
    if (tab.getAttribute('aria-selected') === 'true') return;
    this.activate(tab);
  }

  handlePanelBeforeMatch(event) {
    let tab = document.querySelector(`[aria-controls="${event.currentTarget.getAttribute('id')}"]`);
    if (tab.getAttribute('aria-selected') === 'true') return;
    this.activate(tab, true);
  }

  activate(tab, isMatch = false) {
    this.rootElement.setAttribute('data-tabs-animating', '');
    let id = tab.getAttribute('aria-controls');
    [...this.tabElements].forEach(tab => {
      let isSelected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
    this.contentElement.style.setProperty('overflow', 'clip');
    this.contentElement.style.setProperty('position', 'relative');
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
    let height = this.contentElement.offsetHeight || [...this.panelElements].find(panel => !panel.hasAttribute('hidden')).offsetHeight;
    [...this.panelElements].forEach((panel, i) => {
      if (panel.getAttribute('id') === id) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', this.isFocusable(this.tabElements[i]) ? 'until-found' : '');
      }
    });
    if (this.animation) this.animation.cancel();
    this.animation = this.contentElement.animate({ height: [`${height}px`, `${document.getElementById(id).scrollHeight}px`] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: this.settings.animation.easing });
    this.animation.addEventListener('finish', () => {
      this.animation = null;
      this.rootElement.removeAttribute('data-tabs-animating');
      ['height', 'overflow', 'position'].forEach(name => this.contentElement.style.removeProperty(name));
      [...this.panelElements].forEach(panel => ['content-visibility', 'display', 'position'].forEach(name => panel.style.removeProperty(name)));
    });
    if (this.settings.animation.crossFade) {
      [...this.panelElements].forEach((panel, i) => {
        let animation = this.panelAnimations[i];
        let opacity = window.getComputedStyle(panel).getPropertyValue('opacity');
        if (animation) animation.cancel();
        animation = this.panelAnimations[i] = panel.animate({ opacity: panel.getAttribute('id') === id ? [opacity, '1'] : [opacity, '0'] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: 'ease', fill: 'forwards' });
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
    this.initialize();
  }

  initialize() {
    let update = () => this.update();
    new ResizeObserver(update).observe(this.listElement);
    new MutationObserver(update).observe(this.listElement, { attributeFilter: ['aria-selected'], subtree: true });
  }

  update() {
    if (!this.indicatorElement.checkVisibility()) return;
    let isHorizontal = this.listElement.getAttribute('aria-orientation') !== 'vertical';
    let position = isHorizontal ? 'left' : 'top';
    let size = isHorizontal ? 'width' : 'height';
    let rect = this.listElement.querySelector('[aria-selected="true"]').getBoundingClientRect();
    this.indicatorElement.animate({ [position]: `${rect[position] - this.listElement.getBoundingClientRect()[position]}px`, [size]: `${rect[size]}px` }, { duration: this.settings.animation.indicatorDuration, easing: this.settings.animation.indicatorEasing, fill: 'forwards' });
  }
}

export default Tabs;
