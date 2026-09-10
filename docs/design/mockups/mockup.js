(function () {
  'use strict';

  const iconAssetRoot = new URL('assets/lucide/', document.baseURI).href;

  const coverIconMap = {
    'cover--night': { name: 'disc-3', variant: 'cover-night' },
    'cover--chopin': { name: 'library', variant: 'cover-chopin' },
    'cover--blue': { name: 'music-2', variant: 'cover-blue' },
    'cover--amber': { name: 'mic-2', variant: 'cover-amber' },
    'cover--plum': { name: 'disc-3', variant: 'cover-plum' }
  };

  const resolveIconVariant = (source, explicitVariant) => {
    if (explicitVariant) return explicitVariant;
    if (source?.classList.contains('is-playing-icon') || source?.closest('.icon-button.is-favorite, .toast-icon')) return 'accent';
    if (source?.closest('.button--primary, .player-button, .card-play, .round-action--primary')) return 'on-accent';
    return 'base';
  };

  const createLibraryIcon = (iconName, source, explicitVariant) => {
    const variant = resolveIconVariant(source, explicitVariant);
    const icon = document.createElement('img');
    const sourceClasses = source?.getAttribute('class') || '';
    icon.className = `${sourceClasses} library-icon`.trim();
    icon.src = `${iconAssetRoot}${iconName}${variant === 'base' ? '' : `--${variant}`}.svg`;
    icon.alt = '';
    icon.dataset.iconLibrary = 'lucide';
    icon.dataset.iconName = iconName;
    icon.dataset.iconVariant = variant;
    icon.setAttribute('aria-hidden', source?.getAttribute('aria-hidden') || 'true');

    ['aria-label', 'title', 'role'].forEach((attribute) => {
      const value = source?.getAttribute(attribute);
      if (value) icon.setAttribute(attribute, value);
    });

    return icon;
  };

  const hydrateLibraryIcons = () => {
    document.querySelectorAll('i[data-lucide]').forEach((source) => {
      const iconName = source.dataset.lucide;
      if (!iconName) return;
      source.replaceWith(createLibraryIcon(iconName, source));
    });
  };

  const addCoverIcons = () => {
    document.querySelectorAll('.cover').forEach((cover) => {
      const coverClass = Object.keys(coverIconMap).find((name) => cover.classList.contains(name));
      if (!coverClass) return;

      const hasDirectIcon = Array.from(cover.children).some((child) => child.matches('i[data-lucide], .library-icon'));
      if (hasDirectIcon) return;

      const coverIcon = coverIconMap[coverClass];
      const icon = createLibraryIcon(coverIcon.name, undefined, coverIcon.variant);
      icon.classList.add('cover-icon');
      icon.setAttribute('aria-hidden', 'true');
      cover.prepend(icon);
    });
  };

  const icons = () => {
    addCoverIcons();
    hydrateLibraryIcons();
  };

  const showToast = (message, detail) => {
    const toast = document.querySelector('[data-demo-toast]');
    if (!toast) return;
    const label = toast.querySelector('.toast-label');
    const help = toast.querySelector('.toast-help');
    if (label) label.textContent = message;
    if (help) help.textContent = detail || '';
    toast.classList.remove('is-hidden');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.add('is-hidden'), 3000);
  };

  const setPageState = (switcher, state) => {
    const scope = switcher.closest('.page-wrap') || document;
    scope.querySelectorAll('.page-state').forEach((panel) => {
      panel.classList.toggle('is-visible', panel.dataset.pageState === state);
    });
    switcher.querySelectorAll('button[data-state]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.state === state));
    });
    const stateLabel = scope.querySelector('[data-current-state]');
    if (stateLabel) stateLabel.textContent = state;
  };

  const toggleSwitch = (button) => {
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    showToast(next ? '设置已启用' : '设置已关闭', '这是静态稿中的即时反馈示例');
  };

  document.addEventListener('DOMContentLoaded', () => {
    icons();

    document.querySelectorAll('.state-switcher').forEach((switcher) => {
      const defaultState = switcher.dataset.defaultState || 'normal';
      switcher.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-state]');
        if (!button) return;
        setPageState(switcher, button.dataset.state);
      });
      setPageState(switcher, defaultState);
    });

    document.querySelectorAll('[data-open-queue]').forEach((button) => {
      button.addEventListener('click', () => document.body.classList.add('queue-open'));
    });

    document.querySelectorAll('[data-close-queue]').forEach((button) => {
      button.addEventListener('click', () => document.body.classList.remove('queue-open'));
    });

    document.querySelectorAll('[data-toggle-toast]').forEach((button) => {
      button.addEventListener('click', () => {
        const toast = document.querySelector('[data-demo-toast]');
        if (toast) toast.classList.toggle('is-hidden');
      });
    });

    document.querySelectorAll('[data-demo-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.demoAction;
        if (action === 'queue') {
          showToast('已添加到队列', '夜曲将在当前曲目之后播放');
        } else if (action === 'favorite') {
          button.classList.toggle('is-favorite');
          showToast(button.classList.contains('is-favorite') ? '已收藏' : '已取消收藏', '喜欢的音乐已同步');
        } else if (action === 'scan') {
          showToast('正在扫描音乐库', '1,234 / 30,000 · 解析中');
        }
      });
    });

    document.querySelectorAll('[data-row-select]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const row = button.closest('.track-row, .artist-row, .album-card, .playlist-card');
        if (!row) return;
        row.classList.toggle('is-selected');
      });
    });

    document.querySelectorAll('[data-switch]').forEach((button) => {
      button.addEventListener('click', () => toggleSwitch(button));
    });

    document.querySelectorAll('[data-show-menu]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const menu = document.querySelector(button.dataset.showMenu);
        if (!menu) return;
        menu.hidden = !menu.hidden;
        if (!menu.hidden && button.dataset.menuPosition !== 'static') {
          const rect = button.getBoundingClientRect();
          menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 260)}px`;
          menu.style.left = `${Math.min(rect.left, window.innerWidth - 236)}px`;
        }
      });
    });

    document.addEventListener('click', (event) => {
      document.querySelectorAll('.context-menu:not([hidden])').forEach((menu) => {
        if (!menu.contains(event.target) && !event.target.closest('[data-show-menu]')) menu.hidden = true;
      });
    });

    document.querySelectorAll('[data-toggle-preview]').forEach((button) => {
      button.addEventListener('click', () => {
        const preview = document.querySelector(button.dataset.togglePreview);
        if (preview) preview.hidden = !preview.hidden;
      });
    });

    document.querySelectorAll('.search-box input').forEach((input) => {
      input.addEventListener('focus', () => {
        const preview = document.querySelector(input.dataset.preview);
        if (preview) preview.hidden = false;
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const preview = document.querySelector(input.dataset.preview);
          if (preview) preview.hidden = true;
          input.blur();
        }
      });
    });

    document.querySelectorAll('[data-inline-input]').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          const value = input.value.trim() || '未命名歌单';
          const label = input.closest('[data-inline-owner]')?.querySelector('[data-inline-label]');
          if (label) label.textContent = value;
          input.hidden = true;
          if (label) label.hidden = false;
          showToast('歌单已创建', value);
        }
        if (event.key === 'Escape') {
          input.hidden = true;
          const label = input.closest('[data-inline-owner]')?.querySelector('[data-inline-label]');
          if (label) label.hidden = false;
        }
      });
    });

    document.querySelectorAll('[data-start-inline]').forEach((button) => {
      button.addEventListener('click', () => {
        const owner = button.closest('[data-inline-owner]');
        const input = owner?.querySelector('[data-inline-input]');
        const label = owner?.querySelector('[data-inline-label]');
        if (input) {
          input.hidden = false;
          input.focus();
        }
        if (label) label.hidden = true;
      });
    });

    document.querySelectorAll('a[href="#"]').forEach((link) => {
      link.addEventListener('click', (event) => event.preventDefault());
    });
  });
}());
