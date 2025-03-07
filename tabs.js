class Tabs {
  constructor(root, options) {
    this.root = root;
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
    const NOT_NESTED = `:not(:scope ${this.settings.selector.panel} *)`;
    this.lists = this.root.querySelectorAll(`${this.settings.selector.list}${NOT_NESTED}`);
    this.tabs = this.root.querySelectorAll(`${this.settings.selector.tab}${NOT_NESTED}`);
    this.indicators = this.root.querySelectorAll(`${this.settings.selector.indicator}${NOT_NESTED}`);
    this.content = this.root.querySelector(`${this.settings.selector.content}${NOT_NESTED}`);
    this.panels = this.root.querySelectorAll(`${this.settings.selector.panel}${NOT_NESTED}`);
    if (!this.lists.length || !this.tabs.length || !this.content || !this.panels.length) return;
    this.animation = null;
    this.panelAnimations = Array(this.panels.length).fill(null);
    this.initialize();
  }

  initialize() {
    this.lists.forEach(list => list.addEventListener('keydown', event => this.handleListKeyDown(event)));
    this.tabs.forEach((tab, i) => {
      const id = Math.random().toString(36).slice(-8);
      if (i < this.panels.length) {
        tab.setAttribute('id', tab.getAttribute('id') || `tab-${id}`);
        const panel = this.panels[i];
        panel.setAttribute('id', panel.getAttribute('id') || `tab-panel-${id}`);
      }
      tab.setAttribute('aria-controls', this.panels[i % this.panels.length].getAttribute('id'));
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      if (!this.isFocusable(tab)) tab.style.setProperty('pointer-events', 'none');
      tab.addEventListener('click', event => this.handleTabClick(event));
    });
    if (this.indicators.length) {
      this.indicators.forEach(indicator => {
        const list = indicator.closest(this.settings.selector.list);
        list.style.setProperty('position', 'relative');
        indicator.style.setProperty('display', 'block');
        indicator.style.setProperty('position', 'absolute');
        new TabsIndicator(indicator, list, this.settings);
      });
    }
    this.panels.forEach((panel, i) => {
      const tab = this.tabs[i];
      panel.setAttribute('aria-labelledby', `${panel.getAttribute('aria-labelledby') || ''} ${tab.getAttribute('id')}`.trim());
      if (!panel.hasAttribute('hidden')) panel.setAttribute('tabindex', '0');
      panel.addEventListener('beforematch', event => this.handlePanelBeforeMatch(event));
    });

    // Fix for WebKit
    if (!['auto', '0px'].includes(window.getComputedStyle(this.content).getPropertyValue('min-height'))) {
      this.panels.forEach(panel => {
        new ResizeObserver(() => {
          if (panel.hasAttribute('hidden')) return;
          window.requestAnimationFrame(() => panel.closest(this.settings.selector.content).style.setProperty('height', `${panel.scrollHeight}px`));
        }).observe(panel);
      });
    }

    this.root.setAttribute('data-tabs-initialized', '');
  }

  isFocusable(element) {
    return element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled');
  }

  handleListKeyDown(event) {
    const list = event.currentTarget;
    const isHorizontal = list.getAttribute('aria-orientation') !== 'vertical';
    const previous = `Arrow${isHorizontal ? 'Left' : 'Up'}`;
    const next = `Arrow${isHorizontal ? 'Right' : 'Down'}`;
    const { key } = event;
    if (![' ', 'Enter', previous, next, 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const active = document.activeElement;
    if ([' ', 'Enter'].includes(key)) {
      active.click();
      return;
    }
    const focusableTabs = [...list.querySelectorAll(this.settings.selector.tab)].filter(this.isFocusable);
    const currentIndex = [...focusableTabs].indexOf(active);
    const length = focusableTabs.length;
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
    const tab = focusableTabs[newIndex];
    tab.focus();
    if (!this.settings.manual) tab.click();
  }

  handleTabClick(event) {
    event.preventDefault();
    this.activate(event.currentTarget);
  }

  handlePanelBeforeMatch(event) {
    this.activate(document.querySelector(`[aria-controls="${event.currentTarget.getAttribute('id')}"]`), true);
  }

  activate(tab, isMatch = false) {
    if (tab.getAttribute('aria-selected') === 'true') return;
    const root = this.root;
    root.setAttribute('data-tabs-animating', '');
    const id = tab.getAttribute('aria-controls');
    [...this.tabs].forEach(tab => {
      const isSelected = tab.getAttribute('aria-controls') === id;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
    this.content.style.setProperty('overflow', 'clip');
    this.content.style.setProperty('position', 'relative');
    this.content.style.setProperty('will-change', [...new Set(window.getComputedStyle(this.content).getPropertyValue('will-change').split(',')).add('height').values()].filter(value => value !== 'auto').join(','));
    [...this.panels].forEach(panel => {
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
    const height = this.content.offsetHeight || [...this.panels].find(panel => !panel.hasAttribute('hidden')).offsetHeight;
    if (this.animation) this.animation.cancel();
    this.animation = this.content.animate({ height: [`${height}px`, `${document.getElementById(id).scrollHeight}px`] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: this.settings.animation.easing });
    this.animation.addEventListener('finish', () => {
      this.animation = null;
      root.removeAttribute('data-tabs-animating');
      ['height', 'overflow', 'position', 'will-change'].forEach(name => this.content.style.removeProperty(name));
      [...this.panels].forEach(panel => ['content-visibility', 'display', 'position', 'visibility'].forEach(name => panel.style.removeProperty(name)));
    });
    [...this.panels].forEach((panel, i) => {
      if (panel.getAttribute('id') === id) {
        panel.removeAttribute('hidden');
        panel.setAttribute('tabindex', '0');
      } else {
        panel.setAttribute('hidden', this.isFocusable(this.tabs[i]) ? 'until-found' : '');
        panel.removeAttribute('tabindex');
      }
      if (this.settings.animation.crossFade) {
        panel.style.setProperty('will-change', [...new Set(window.getComputedStyle(panel).getPropertyValue('will-change').split(',')).add('opacity').values()].filter(value => value !== 'auto').join(','));
        const opacity = !panel.hasAttribute('hidden') ? '0' : window.getComputedStyle(panel).getPropertyValue('opacity');
        let animation = this.panelAnimations[i];
        if (animation) animation.cancel();
        animation = this.panelAnimations[i] = panel.animate({ opacity: !panel.hasAttribute('hidden') ? [opacity, '1'] : [opacity, '0'] }, { duration: !isMatch ? this.settings.animation.duration : 0, easing: 'ease' });
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
    this.indicator = indicator;
    this.list = list;
    this.settings = settings;
    this.initialize();
  }

  initialize() {
    const update = () => this.update();
    new ResizeObserver(update).observe(this.list);
    new MutationObserver(update).observe(this.list, { attributeFilter: ['aria-selected'], subtree: true });
  }

  update() {
    if (!this.indicator.checkVisibility()) return;
    const isHorizontal = this.list.getAttribute('aria-orientation') !== 'vertical';
    const position = isHorizontal ? 'left' : 'top';
    const size = isHorizontal ? 'width' : 'height';
    this.indicator.style.setProperty('will-change', [...new Set(window.getComputedStyle(this.indicator).getPropertyValue('will-change').split(',')).add(position).add(size).values()].filter(value => value !== 'auto').join(','));
    const rect = this.list.querySelector('[aria-selected="true"]').getBoundingClientRect();
    this.indicator.animate({ [position]: `${rect[position] - this.list.getBoundingClientRect()[position]}px`, [size]: `${rect[size]}px` }, { duration: this.settings.animation.indicatorDuration, easing: this.settings.animation.indicatorEasing, fill: 'forwards' }).addEventListener('finish', () => this.indicator.style.removeProperty('will-change'));
  }
}

export default Tabs;
