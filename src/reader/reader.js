(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const data = JSON.parse($('review-data').textContent);
  // Capture the unenhanced artifact: downloaded copies must start without transient layout.
  const originalHTML = '<!doctype html>\n' + document.documentElement.outerHTML;
  const cards = new Map(data.comments.map(c => [c.id, $(c.id)]));
  const comments = new Map(data.comments.map(c => [c.id, c]));
  const marks = [...document.querySelectorAll('.paper mark[data-comments]')];
  const fragments = new Map(data.comments.map(c => [c.id, marks.filter(m => m.dataset.comments.split(' ').includes(c.id))]));
  const ordered = [...data.comments].sort((a, b) => {
    const first = fragments.get(a.id)[0], second = fragments.get(b.id)[0];
    return first === second ? a.number - b.number : first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }).map(c => c.id);
  const desktop = matchMedia('(min-width: 1050px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, visible = [...ordered], frame = 0, headroom = 0, statusTimer;
  let lastSource = null, initialized = false;
  const announce = message => {
    clearTimeout(statusTimer); $('status').textContent = message;
    statusTimer = setTimeout(() => { $('status').textContent = ''; }, 4500);
  };
  function scheduleLayout() {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; layout(); });
  }
  function layout() {
    const workspace = $('workspace'), aside = $('comments');
    // Keep the same controls at the top of the desktop rail or the mobile sheet.
    const navigation = $('comment-navigation');
    const navigationHost = !desktop.matches && active ? cards.get(active) : $('comments-heading');
    if (navigation.parentElement !== navigationHost) {
      if (navigationHost === $('comments-heading')) navigationHost.append(navigation);
      else navigationHost.prepend(navigation);
    }
    document.documentElement.style.setProperty('--toolbar-height', $('toolbar').offsetHeight + 'px');
    if (!desktop.matches) {
      workspace.style.paddingTop = ''; aside.style.minHeight = '';
      $('comments-heading').style.marginTop = '';
      for (const card of cards.values()) card.style.top = '';
      document.documentElement.style.setProperty('--sheet-height', (active ? cards.get(active).getBoundingClientRect().height : 0) + 'px');
      headroom = 0; return;
    }
    // One native page scroll serves both columns. Extra headroom makes predecessors
    // reachable even when hundreds of comments share an active passage.
    const base = aside.getBoundingClientRect().top + scrollY;
    const floor = $('comments').querySelector('.comments-heading').offsetHeight + 66;
    const items = visible.map(id => ({ id, ideal: Math.max(floor, fragments.get(id)[0].getBoundingClientRect().top + scrollY - base), height: cards.get(id).getBoundingClientRect().height, top: 0 }));
    const index = items.findIndex(item => item.id === active);
    if (index >= 0) {
      items[index].top = items[index].ideal;
      for (let i = index - 1; i >= 0; i--) items[i].top = Math.min(items[i].ideal, items[i + 1].top - items[i].height - 12);
      for (let i = index + 1; i < items.length; i++) items[i].top = Math.max(items[i].ideal, items[i - 1].top + items[i - 1].height + 12);
    } else {
      items.forEach((item, i) => { item.top = Math.max(item.ideal, i ? items[i - 1].top + items[i - 1].height + 12 : floor); });
    }
    const nextHeadroom = Math.max(0, floor - (items[0]?.top ?? floor));
    workspace.style.paddingTop = nextHeadroom + 'px';
    // Negative margin keeps the sticky heading above dense preceding comments
    // without transforming it out of the viewport when the page scrolls.
    $('comments-heading').style.marginTop = -nextHeadroom + 'px';
    for (const item of items) cards.get(item.id).style.top = item.top + 'px';
    aside.style.minHeight = Math.max(document.querySelector('.reading-column').offsetHeight, 150, ...items.map(item => item.top + item.height + 40)) + 'px';
    if (initialized && nextHeadroom !== headroom) window.scrollBy(0, nextHeadroom - headroom);
    headroom = nextHeadroom; initialized = true;
  }
  function updateNavigation() {
    const index = visible.indexOf(active);
    $('navigation-label').textContent = index >= 0 ? `Comment ${comments.get(active).number} · ${index + 1} of ${visible.length}` : `${visible.length} comment${visible.length === 1 ? '' : 's'}`;
    document.querySelector('[data-action="previous"]').disabled = !visible.length || index === 0;
    document.querySelector('[data-action="next"]').disabled = !visible.length || index === visible.length - 1;
  }
  const filterInputs = name => [...document.querySelectorAll('[data-filter-option="' + name + '"]')];
  function resetFilters() {
    document.querySelectorAll('[data-filter-option]').forEach(input => { input.checked = true; });
    applyFilters();
  }
  function applyFilters() {
    const priorities = filterInputs('priority').filter(input => input.checked).map(input => input.value);
    const reviewers = filterInputs('reviewer').filter(input => input.checked).map(input => input.value);
    visible = ordered.filter(id => {
      const c = comments.get(id);
      return priorities.includes(c.severity) && reviewers.includes(c.reviewer);
    });
    for (const [id, card] of cards) card.hidden = !visible.includes(id);
    for (const mark of marks) mark.classList.toggle('filtered', !mark.dataset.comments.split(' ').some(id => visible.includes(id)));
    for (const [name, label] of [['priority', 'priorities'], ['reviewer', 'reviewers']]) {
      const inputs = filterInputs(name), selected = inputs.filter(input => input.checked);
      document.querySelector('[data-filter="' + name + '"] .filter-label').textContent = selected.length === inputs.length ? 'All ' + label : !selected.length ? 'No ' + label : selected.length === 1 ? selected[0].nextElementSibling.textContent + ' only' : selected.length + ' ' + label;
    }
    $('filter-count').textContent = visible.length === cards.size ? String(cards.size) : `${visible.length} of ${cards.size}`;
    $('empty-comments').hidden = visible.length > 0;
    if (active && !visible.includes(active)) clearActive(false);
    updateNavigation(); scheduleLayout();
  }
  function clearActive(updateHash = true) {
    for (const card of cards.values()) { card.classList.remove('is-active'); card.removeAttribute('role'); }
    for (const mark of marks) mark.classList.remove('active');
    document.body.classList.remove('has-active'); active = null;
    if (updateHash && /^#comment-\d+$/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    $('overlap-picker').hidden = true;
    updateNavigation(); scheduleLayout();
  }
  function goToPassage(id, focus = false) {
    const mark = fragments.get(id)?.[0];
    if (!mark) return;
    const clearance = desktop.matches ? $('comments-heading').offsetHeight + 24 : 45;
    const top = mark.getBoundingClientRect().top + scrollY - $('toolbar').offsetHeight - clearance;
    window.scrollTo({ top, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    if (focus) $('anchor-' + comments.get(id).number).focus({ preventScroll: true });
  }
  function activate(id, { hash = true, source = null, scroll = true } = {}) {
    if (!cards.has(id)) return;
    if (!visible.includes(id)) { resetFilters(); announce('Filters cleared to reveal this comment.'); }
    if (source) lastSource = source;
    clearActive(false); active = id;
    cards.get(id).classList.add('is-active');
    if (!desktop.matches) cards.get(id).setAttribute('role', 'region');
    document.body.classList.add('has-active');
    for (const mark of fragments.get(id)) mark.classList.add('active');
    if (hash && location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    layout(); updateNavigation();
    if (scroll) goToPassage(id);
    if (!desktop.matches) cards.get(id).focus({ preventScroll: true });
  }
  function showOverlap(mark) {
    const ids = mark.dataset.comments.split(' ');
    if (ids.length === 1) return activate(ids[0], { source: mark });
    const picker = $('overlap-picker'); picker.replaceChildren();
    for (const id of ids) {
      const c = comments.get(id), button = document.createElement('button');
      button.textContent = `${c.number} · ${c.severity} · ${c.reviewer.replace(' Reviewer', '')}`;
      button.addEventListener('click', () => { picker.hidden = true; activate(id, { source: mark }); });
      picker.append(button);
    }
    picker.hidden = false;
    const rect = mark.getBoundingClientRect();
    picker.style.left = Math.max(12, Math.min(rect.left, innerWidth - picker.offsetWidth - 12)) + 'px';
    picker.style.top = Math.max($('toolbar').offsetHeight + 8, Math.min(rect.bottom + 8, innerHeight - picker.offsetHeight - 12)) + 'px';
    picker.querySelector('button').focus();
  }
  function download(bytes, name, type) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const stem = data.filename.replace(/\.(docx|pdf)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100) || 'manuscript';
  const assetFiles = () => data.assets.map(asset => ({ name: `figures/${asset.id}.${({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' })[asset.mimeType]}`, data: Uint8Array.from(atob(asset.data), c => c.charCodeAt(0)) }));
  // ZIP "store" format keeps local downloads dependency-free, including all figures.
  function archive(files) {
    const encoder = new TextEncoder(), parts = [], directory = []; let offset = 0, dirSize = 0;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
    for (const file of files) {
      const name = encoder.encode(file.name), bytes = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); crc = (crc ^ 0xffffffff) >>> 0;
      const local = new Uint8Array(30 + name.length), v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint32(14, crc, true); v.setUint32(18, bytes.length, true); v.setUint32(22, bytes.length, true); v.setUint16(26, name.length, true); local.set(name, 30);
      const central = new Uint8Array(46 + name.length), d = new DataView(central.buffer);
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint32(16, crc, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true); d.setUint16(28, name.length, true); d.setUint32(42, offset, true); central.set(name, 46);
      parts.push(local, bytes); directory.push(central); dirSize += central.length; offset += local.length + bytes.length;
    }
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true); view.setUint32(12, dirSize, true); view.setUint32(16, offset, true);
    return new Blob([...parts, ...directory, end], { type: 'application/zip' });
  }
  function downloadMarkdown(text, name) {
    if (data.assets.length) download(archive([{ name, data: text }, ...assetFiles()]), stem + '-' + name.replace(/\.md$/, '') + '.zip', 'application/zip');
    else download(text, stem + '-' + name, 'text/markdown;charset=utf-8');
  }
  function exportFile(kind) {
    if (kind === 'html') {
      download(originalHTML, stem + '-review.html', 'text/html;charset=utf-8');
    } else if (kind === 'report') download(data.reportMarkdown, stem + '-report.md', 'text/markdown;charset=utf-8');
    else if (kind === 'full') downloadMarkdown(data.markdown, 'review.md');
    else if (kind === 'manuscript') downloadMarkdown((data.warnings.length ? '## Extraction warnings\n\n' + data.warnings.map(w => '- ' + w).join('\n') + '\n\n---\n\n' : '') + data.manuscriptMarkdown, 'manuscript.md');
    else if (kind === 'json') download(JSON.stringify(data, null, 2), stem + '-review.json', 'application/json;charset=utf-8');
    else if (kind === 'figures') download(archive(assetFiles()), stem + '-figures.zip', 'application/zip');
    $('download-menu').open = false;
  }
  function closeAndReturn() {
    const id = active; clearActive(); layout();
    if (id) goToPassage(id, true);
    else lastSource?.focus?.({ preventScroll: true });
  }
  document.addEventListener('click', event => {
    const target = event.target;
    const downloadButton = target.closest('[data-download]');
    if (downloadButton) return exportFile(downloadButton.dataset.download);
    const filterAction = target.closest('[data-filter-action]');
    if (filterAction) {
      const menu = filterAction.closest('[data-filter]');
      menu.querySelectorAll('[data-filter-option]').forEach(input => { input.checked = filterAction.dataset.filterAction === 'all'; });
      applyFilters(); return;
    }
    const action = target.closest('[data-action]')?.dataset.action;
    if (action === 'close') return closeAndReturn();
    if (action === 'previous' || action === 'next') {
      const index = visible.indexOf(active), next = index < 0 ? (action === 'next' ? 0 : visible.length - 1) : index + (action === 'next' ? 1 : -1);
      if (visible[next]) activate(visible[next]); return;
    }
    if (action === 'print' || action === 'print-manuscript') {
      document.body.classList.toggle('print-manuscript', action === 'print-manuscript');
      document.querySelectorAll('.limitations').forEach(d => { d.open = true; });
      $('download-menu').open = false; window.print(); return;
    }
    if (action === 'comment-list') { clearActive(false); layout(); }
    const mark = target.closest('.paper mark[data-comments]');
    if (mark) { showOverlap(mark); return; }
    const anchor = target.closest('a[href^="#"]');
    if (anchor) {
      const fragment = anchor.getAttribute('href').slice(1);
      const id = /^anchor-\d+$/.test(fragment) ? fragment.replace('anchor-', 'comment-') : fragment;
      if (cards.has(id)) { event.preventDefault(); activate(id, { source: anchor }); return; }
      clearActive(false); layout();
      anchor.closest('.menu')?.removeAttribute('open');
    }
    const card = target.closest('.comment');
    if (card && active !== card.id && !target.closest('button,a,input,textarea,summary,label')) activate(card.id);
    if (!target.closest('#overlap-picker')) $('overlap-picker').hidden = true;
    document.querySelectorAll('.menu[open]').forEach(menu => { if (!menu.contains(target)) menu.open = false; });
    const image = target.closest('.paper img');
    if (image) {
      const dialog = document.createElement('dialog'); dialog.className = 'image-dialog';
      const close = document.createElement('button'); close.textContent = 'Close'; close.addEventListener('click', () => dialog.close());
      const img = image.cloneNode(); dialog.append(close, img); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { $('overlap-picker').hidden = true; document.querySelectorAll('.menu[open]').forEach(m => { m.open = false; }); if (active) closeAndReturn(); }
  });
  document.querySelectorAll('[data-filter-option]').forEach(input => input.addEventListener('change', applyFilters));
  $('highlight-toggle').addEventListener('click', event => {
    const hidden = document.body.classList.toggle('hide-highlights'); event.target.setAttribute('aria-pressed', String(!hidden));
  });
  function readHash() {
    const id = location.hash.slice(1).replace(/^anchor-/, 'comment-');
    if (cards.has(id)) activate(id, { hash: false });
    else clearActive(false);
  }
  window.addEventListener('hashchange', readHash);
  window.addEventListener('popstate', readHash);
  for (const [i, heading] of [...$('manuscript').querySelectorAll('h1,h2,h3')].entries()) {
    heading.id = `section-${i + 1}`;
    const link = document.createElement('a'); link.href = '#' + heading.id; link.textContent = heading.textContent; link.dataset.level = heading.tagName.slice(1); $('outline').append(link);
  }
  for (const image of $('manuscript').querySelectorAll('img')) image.addEventListener('load', scheduleLayout);
  const observer = new ResizeObserver(scheduleLayout);
  observer.observe($('toolbar')); observer.observe(document.querySelector('.reading-column'));
  for (const card of cards.values()) observer.observe(card);
  document.querySelectorAll('.limitations').forEach(details => details.addEventListener('toggle', scheduleLayout));
  desktop.addEventListener('change', () => {
    if (active) activate(active, { hash: false });
    else scheduleLayout();
  });
  document.fonts.ready.then(scheduleLayout);
  document.documentElement.classList.add('enhanced');
  // Figure-aware Markdown downloads include the supporting files in a ZIP.
  if (data.assets.length) for (const kind of ['full', 'manuscript', 'figures']) document.querySelector(`[data-download="${kind}"] span`).textContent = '.zip';
  resetFilters(); readHash(); scheduleLayout();
})();
