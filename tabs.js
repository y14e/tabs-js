class Tabs {
  constructor(root, options) {
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
    this.panelsElement = this.rootElement.querySelector(this.settings.selector.panels);
    this.panelElements = this.rootElement.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`);
    if (!this.listElements.length || !this.tabElements.length || !this.panelsElement || !this.panelElements.length) return;
    this.animation = null;
    this.panelAnimations = Array(this.panelElements.length).fill(null);
    this.initialize();
  }

  initialize() {
    this.listElements.forEach(list => list.addEventListener('keydown', event => this.handleListKeyDown(event)));
    this.tabElements.forEach((tab, i) => {
      let id = Math.random().toString(36).slice(-8);
      if (i < this.panelElements.length) {
        tab.setAttribute('id', tab.getAttribute('id') || `tab-${id}`);
        let panel = this.panelElements[i];
        panel.setAttribute('id', panel.getAttribute('id') || `tab-panel-${id}`);
      }
      tab.setAttribute('aria-controls', this.panelElements[i % this.panelElements.length].getAttribute('id'));
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
      let tab = this.tabElements[i];
      panel.setAttribute('aria-labelledby', `${panel.getAttribute('aria-labelledby') || ''} ${tab.getAttribute('id')}`.trim());
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

  isFocusable(element) {
    return element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
  }

  handleListKeyDown(event) {
    let list = event.currentTarget;
    let isHorizontal = list.getAttribute('aria-orientation') !== 'vertical';
    let previous = `Arrow${isHorizontal ? 'Left' : 'Up'}`;
    let next = `Arrow${isHorizontal ? 'Right' : 'Down'}`;
    let { key } = event;
    if (![' ', 'Enter', previous, next, 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    let active = document.activeElement;
    if ([' ', 'Enter'].includes(key)) {
      active.click();
      return;
    }
    let focusableTabs = [...list.querySelectorAll(this.settings.selector.tab)].filter(this.isFocusable);
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
    let tab = focusableTabs[newIndex];
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
    let root = this.rootElement;
    root.setAttribute('data-tabs-animating', '');
    let id = tab.getAttribute('aria-controls');
    [...this.tabElements].forEach(tab => {
      let isSelected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
    this.panelsElement.style.setProperty('overflow', 'clip');
    this.panelsElement.style.setProperty('position', 'relative');
    this.panelsElement.style.setProperty('will-change', [...new Set(window.getComputedStyle(this.panelsElement).getPropertyValue('will-change').split(',')).add('height').values()].filter(value => value !== 'auto').join(','));
    [...this.panelElements].forEach(panel => {
      panel.style.setProperty('position', 'absolute');
      if (!panel.hasAttribute('hidden') || panel.getAttribute('id') === id) {
        panel.style.setProperty('content-visibility', 'visible');
        panel.style.setProperty('display', 'block'); // Fix for WebKit
      } else {
        panel.style.setProperty('content-visibility', 'hidden');
        panel.style.setProperty('display', 'none'); // Fix for WebKit
      }
      if (!this.settings.animation.crossFade && panel.getAttribute('id') !== id) panel.style.setProperty('visibility', 'hidden');
    });
    let height = this.panelsElement.offsetHeight || [...this.panelElements].find(panel => !panel.hasAttribute('hidden')).offsetHeight;
    if (this.animation) this.animation.cancel();
    this.animation = this.panelsElement.animate({ height: [`${height}px`, `${document.getElementById(id).scrollHeight}px`] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: this.settings.animation.easing });
    this.animation.addEventListener('finish', () => {
      this.animation = null;
      root.removeAttribute('data-tabs-animating');
      ['height', 'overflow', 'position', 'will-change'].forEach(name => this.panelsElement.style.removeProperty(name));
      [...this.panelElements].forEach(panel => ['content-visibility', 'display', 'position', 'visibility'].forEach(name => panel.style.removeProperty(name)));
    });
    [...this.panelElements].forEach((panel, i) => {
      if (panel.getAttribute('id') === id) {
        panel.removeAttribute('hidden');
        panel.setAttribute('tabindex', '0');
      } else {
        panel.setAttribute('hidden', this.isFocusable(this.tabElements[i]) ? 'until-found' : '');
        panel.removeAttribute('tabindex');
      }
      if (this.settings.animation.crossFade) {
        panel.style.setProperty('will-change', [...new Set(window.getComputedStyle(panel).getPropertyValue('will-change').split(',')).add('opacity').values()].filter(value => value !== 'auto').join(','));
        let opacity = !panel.hasAttribute('hidden') ? '0' : window.getComputedStyle(panel).getPropertyValue('opacity');
        let animation = this.panelAnimations[i];
        if (animation) animation.cancel();
        animation = this.panelAnimations[i] = panel.animate({ opacity: !panel.hasAttribute('hidden') ? [opacity, '1'] : [opacity, '0'] }, { duration: !isMatch ? this.settings.animation.duration : 0 });
        animation.addEventListener('finish', () => {
          this.panelAnimations[i] = null;
          panel.style.removeProperty('will-change');
        });
      }
    });
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
    this.indicatorElement.style.setProperty('will-change', [...new Set(window.getComputedStyle(this.indicatorElement).getPropertyValue('will-change').split(',')).add(position).add(size).values()].filter(value => value !== 'auto').join(','));
    let rect = this.listElement.querySelector('[aria-selected="true"]').getBoundingClientRect();
    this.indicatorElement.animate({ [position]: `${rect[position] - this.listElement.getBoundingClientRect()[position]}px`, [size]: `${rect[size]}px` }, { duration: this.settings.animation.indicatorDuration, easing: this.settings.animation.indicatorEasing, fill: 'forwards' }).addEventListener('finish', () => this.indicatorElement.style.removeProperty('will-change'));
  }
}

export default Tabs;
