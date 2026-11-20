/* DAMA61 reader-position indicator; never scrolls the main document. */
(() => {
  'use strict';
  if (window.DAMA61_SITE_CONFIG?.navigation?.scroll_spy === false) return;
  const sidebar = document.querySelector('.toc');
  const list = document.getElementById('toc-items');
  const article = document.querySelector('main.article, .article');
  if (!sidebar || !list || !article) return;

  const entries = [...list.querySelectorAll('a[href^="#"]')].map(link => {
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    const heading = document.getElementById(id);
    return heading && article.contains(heading) ? { link, heading } : null;
  }).filter(Boolean);
  if (!entries.length) return;
  let active = null;
  let pending = false;
  let ignoreUntil = 0;

  function revealInSidebar(link) {
    const search = document.getElementById('toc-search');
    if (search && search.value.trim()) return;
    const outer = sidebar.getBoundingClientRect();
    const inner = link.getBoundingClientRect();
    const inset = 45;
    if (inner.top >= outer.top + inset && inner.bottom <= outer.bottom - inset) return;
    const destination = sidebar.scrollTop + inner.top + inner.height / 2 - outer.top - outer.height / 2;
    sidebar.scrollTop = Math.max(0, destination); // ONLY scroll the left sidebar
  }

  function activate(entry) {
    if (!entry || entry === active) return;
    if (active) {
      active.link.classList.remove('is-active', 'toc-current');
      active.link.removeAttribute('aria-current');
    }
    active = entry;
    entry.link.classList.add('is-active', 'toc-current');
    entry.link.setAttribute('aria-current', 'location');
    revealInSidebar(entry.link);
  }

  function update() {
    pending = false;
    if (performance.now() < ignoreUntil) return;
    // Mark the latest heading that has reached the upper reading area.
    const readingLine = Math.min(190, Math.max(90, window.innerHeight * 0.23));
    let current = entries[0];
    for (const entry of entries) {
      if (entry.heading.getBoundingClientRect().top <= readingLine) current = entry;
      else break;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 6) {
      current = entries[entries.length - 1];
    }
    activate(current);
  }
  function schedule() {
    if (!pending) {
      pending = true;
      requestAnimationFrame(update);
    }
  }

  list.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#"]');
    const found = entries.find(item => item.link === link);
    if (!found) return;
    activate(found);
    // Preserve click highlight during smooth native anchor scrolling.
    ignoreUntil = performance.now() + 600;
    setTimeout(schedule, 650);
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('load', schedule);
  schedule();
})();
