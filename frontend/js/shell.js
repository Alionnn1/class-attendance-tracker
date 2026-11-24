import { api } from './api.js';
import { clearSession } from './session.js';
import { esc } from './ui.js';

const ROLE_NAMES = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };

export function startShell({ session, routes }) {
  const app = document.getElementById('app');

  app.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="site-header-wrap">
      <header class="site-header">
        <a class="wordmark" href="#${routes[0].id}">
          <span class="tally mini" aria-hidden="true"><span class="mark used"></span><span class="mark used"></span><span class="mark used"></span><span class="mark"></span></span>
          Attendance Tracker
        </a>
        <nav class="tabs" aria-label="Pages">
          ${routes.map((r) => `<a href="#${r.id}" data-route="${r.id}">${esc(r.label)}${r.count ? '<span class="tab-count" hidden></span>' : ''}</a>`).join('')}
        </nav>
        <div class="account">
          <div class="who">${esc(session.user.fullName)}<span>${esc(ROLE_NAMES[session.role])}</span></div>
          <button class="btn secondary small" id="logout-btn">Log out</button>
        </div>
      </header>
    </div>
    <main class="page" id="main" tabindex="-1"></main>`;

  const main = document.getElementById('main');

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await api.logout();
    } catch {
    }
    clearSession();
    location.replace('index.html');
  });

  async function render() {
    const [routeId, query = ''] = location.hash.slice(1).split('?');
    const route = routes.find((r) => r.id === routeId) || routes[0];

    app.querySelectorAll('[data-route]').forEach((link) => {
      if (link.dataset.route === route.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = `${route.label} - Attendance Tracker`;

    const container = document.createElement('div');
    main.replaceChildren(container);
    await route.render(container, new URLSearchParams(query));
    if (container.isConnected && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', render);
  render();

  return {
    setCount(routeId, n) {
      const el = app.querySelector(`[data-route="${routeId}"] .tab-count`);
      if (!el) return;
      el.hidden = !n;
      el.textContent = String(n);
      el.setAttribute('aria-label', `${n} waiting`);
    }
  };
}

export function pageHead(title, actionsHtml = '') {
  return `
    <div class="page-head">
      <h1>${esc(title)}</h1>
      ${actionsHtml ? `<div class="actions">${actionsHtml}</div>` : ''}
    </div>`;
}
