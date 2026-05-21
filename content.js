/**
 * Magic Pointer v1.1 - Content Script
 *
 * Modes :
 *   - SELECTING : sélection interactive avec poignées (Alt+M)
 *   - FULLWINDOW : capture instantanée toute la fenêtre (Alt+W ou bouton)
 *   - LINKPREVIEW : aperçu IA d'un lien (clic droit → menu)
 *   - PANEL : panneau IA avec capture, input, résultat
 */

(function() {
  'use strict';

  if (window.__magicPointerLoaded) return;
  window.__magicPointerLoaded = true;

  // ============================================================
  // ÉTAT
  // ============================================================

  const state = {
    mouseX: 0,
    mouseY: 0,
    mode: 'idle',  // 'idle' | 'selecting' | 'panel' | 'linkpreview'
    captureSize: 500,
    customPrompts: [],

    // Zone de sélection
    box: { x: 0, y: 0, w: 500, h: 500 },

    selectionUI: null,
    panel: null,

    lastCapture: null,
    pendingCommand: null,

    // Pour l'inspecteur de liens
    currentLinkUrl: null
  };

  // Charger les settings (custom prompts + autres)
  loadSettings();

  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
      if (settings) {
        state.captureSize = settings.captureSize || 500;
        state.customPrompts = settings.customPrompts || [];
      }
    });
  }

  // ============================================================
  // SUIVI DU CURSEUR
  // ============================================================

  document.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  }, { passive: true });

  // ============================================================
  // RACCOURCIS
  // ============================================================

  document.addEventListener('keydown', (e) => {
    if (state.mode === 'idle') return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
      return;
    }

    if (state.mode === 'selecting' && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      confirmSelection();
      return;
    }

    if (state.mode === 'selecting') {
      const step = e.shiftKey ? 10 : 1;
      let handled = false;

      if (e.altKey) {
        if (e.key === 'ArrowRight') { state.box.w += step; handled = true; }
        if (e.key === 'ArrowLeft')  { state.box.w = Math.max(60, state.box.w - step); handled = true; }
        if (e.key === 'ArrowDown')  { state.box.h += step; handled = true; }
        if (e.key === 'ArrowUp')    { state.box.h = Math.max(60, state.box.h - step); handled = true; }
      } else if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key)) {
        if (e.key === 'ArrowRight') state.box.x += step;
        if (e.key === 'ArrowLeft')  state.box.x -= step;
        if (e.key === 'ArrowDown')  state.box.y += step;
        if (e.key === 'ArrowUp')    state.box.y -= step;
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        clampBox();
        updateSelectionUI();
      }
    }
  }, true);

  // ============================================================
  // MESSAGES BACKGROUND
  // ============================================================

  chrome.runtime.onMessage.addListener((message) => {
    // Refresh settings (au cas où l'utilisateur change un prompt)
    loadSettings();

    if (message.action === 'activate') {
      if (state.mode !== 'idle') {
        deactivate();
      } else {
        enterSelectionMode(message.selectionText);
      }
    } else if (message.action === 'captureFullWindow') {
      // NEW : capture pleine fenêtre
      if (state.mode !== 'idle') deactivate();
      captureFullWindow();
    } else if (message.action === 'inspectLink') {
      // NEW : aperçu de lien
      if (state.mode !== 'idle') deactivate();
      inspectLink(message.url);
    } else if (message.action === 'saveCurrentPageToZotero') {
      // NEW v1.2 : sauver la page courante
      saveCurrentPageToZotero();
    } else if (message.action === 'saveLinkToZotero') {
      // NEW v1.2 : sauver un lien (sans le visiter)
      saveLinkToZotero(message.url);
    }
  });

  // ============================================================
  // MODE SÉLECTION (inchangé hormis le bouton "Toute la page")
  // ============================================================

  function enterSelectionMode(preselectedText) {
    state.mode = 'selecting';

    const w = Math.min(state.captureSize, window.innerWidth - 40);
    const h = Math.min(state.captureSize, window.innerHeight - 40);
    state.box = {
      x: Math.max(20, state.mouseX - w / 2),
      y: Math.max(20, state.mouseY - h / 2),
      w, h
    };
    clampBox();

    state.selectionUI = document.createElement('div');
    state.selectionUI.className = 'mp-selection-root';
    state.selectionUI.innerHTML = `
      <div class="mp-dim-overlay"></div>
      <div class="mp-selection-box">
        <div class="mp-handle mp-handle-nw" data-handle="nw"></div>
        <div class="mp-handle mp-handle-n"  data-handle="n"></div>
        <div class="mp-handle mp-handle-ne" data-handle="ne"></div>
        <div class="mp-handle mp-handle-e"  data-handle="e"></div>
        <div class="mp-handle mp-handle-se" data-handle="se"></div>
        <div class="mp-handle mp-handle-s"  data-handle="s"></div>
        <div class="mp-handle mp-handle-sw" data-handle="sw"></div>
        <div class="mp-handle mp-handle-w"  data-handle="w"></div>
        <div class="mp-dims" id="mp-dims"></div>
      </div>
      <div class="mp-selection-toolbar">
        <div class="mp-toolbar-hint">
          <kbd>↵</kbd> capturer · <kbd>Esc</kbd> annuler · <kbd>↑↓←→</kbd> bouger · <kbd>Alt</kbd>+flèches resize
        </div>
        <div class="mp-toolbar-actions">
          <button class="mp-toolbar-btn mp-btn-cancel" id="mp-cancel">Annuler</button>
          <button class="mp-toolbar-btn mp-btn-full" id="mp-full" title="Capturer toute la fenêtre">
            📐 Toute la page
          </button>
          <button class="mp-toolbar-btn mp-btn-confirm" id="mp-confirm">
            <span class="mp-confirm-icon">✓</span>
            Capturer la zone
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(state.selectionUI);

    state.pendingCommand = preselectedText
      ? `À propos de "${preselectedText.substring(0, 80)}" : `
      : null;

    setupSelectionInteractions();
    updateSelectionUI();
  }

  function clampBox() {
    const padding = 4;
    state.box.w = Math.max(60, Math.min(state.box.w, window.innerWidth - 2 * padding));
    state.box.h = Math.max(60, Math.min(state.box.h, window.innerHeight - 2 * padding));
    state.box.x = Math.max(padding, Math.min(state.box.x, window.innerWidth - state.box.w - padding));
    state.box.y = Math.max(padding, Math.min(state.box.y, window.innerHeight - state.box.h - padding));
  }

  function updateSelectionUI() {
    if (!state.selectionUI) return;

    const box = state.selectionUI.querySelector('.mp-selection-box');
    box.style.left = state.box.x + 'px';
    box.style.top = state.box.y + 'px';
    box.style.width = state.box.w + 'px';
    box.style.height = state.box.h + 'px';

    const dims = state.selectionUI.querySelector('#mp-dims');
    dims.textContent = `${Math.round(state.box.w)} × ${Math.round(state.box.h)}`;

    const toolbar = state.selectionUI.querySelector('.mp-selection-toolbar');
    const toolbarH = 100;
    const spaceBelow = window.innerHeight - (state.box.y + state.box.h);
    const spaceAbove = state.box.y;

    if (spaceBelow >= toolbarH + 20) {
      toolbar.style.top = (state.box.y + state.box.h + 12) + 'px';
      toolbar.style.bottom = 'auto';
    } else if (spaceAbove >= toolbarH + 20) {
      toolbar.style.top = (state.box.y - toolbarH - 12) + 'px';
      toolbar.style.bottom = 'auto';
    } else {
      toolbar.style.top = 'auto';
      toolbar.style.bottom = '20px';
    }

    const toolbarW = 540;  // élargi pour accommoder le nouveau bouton
    let toolbarX = state.box.x + state.box.w / 2 - toolbarW / 2;
    toolbarX = Math.max(12, Math.min(toolbarX, window.innerWidth - toolbarW - 12));
    toolbar.style.left = toolbarX + 'px';
  }

  function setupSelectionInteractions() {
    const ui = state.selectionUI;
    const box = ui.querySelector('.mp-selection-box');
    const dimOverlay = ui.querySelector('.mp-dim-overlay');

    box.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('mp-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      startDrag(e);
    });

    ui.querySelectorAll('.mp-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e, handle.dataset.handle);
      });
    });

    dimOverlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startNewSelection(e);
    });

    ui.querySelector('#mp-confirm').addEventListener('click', confirmSelection);
    ui.querySelector('#mp-cancel').addEventListener('click', deactivate);
    // NEW : bouton "Toute la page"
    ui.querySelector('#mp-full').addEventListener('click', () => {
      deactivate();
      captureFullWindow();
    });
  }

  function startDrag(e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = { ...state.box };
    document.body.style.cursor = 'grabbing';

    const onMove = (ev) => {
      state.box.x = startBox.x + ev.clientX - startX;
      state.box.y = startBox.y + ev.clientY - startY;
      clampBox();
      updateSelectionUI();
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startResize(e, dir) {
    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = { ...state.box };
    const cursors = {
      nw: 'nwse-resize', se: 'nwse-resize',
      ne: 'nesw-resize', sw: 'nesw-resize',
      n: 'ns-resize', s: 'ns-resize',
      e: 'ew-resize', w: 'ew-resize'
    };
    document.body.style.cursor = cursors[dir] || 'default';

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const minSize = 60;
      let { x, y, w, h } = startBox;

      if (dir.includes('e')) w = Math.max(minSize, startBox.w + dx);
      if (dir.includes('w')) {
        const nw = Math.max(minSize, startBox.w - dx);
        x = startBox.x + (startBox.w - nw); w = nw;
      }
      if (dir.includes('s')) h = Math.max(minSize, startBox.h + dy);
      if (dir.includes('n')) {
        const nh = Math.max(minSize, startBox.h - dy);
        y = startBox.y + (startBox.h - nh); h = nh;
      }
      state.box = { x, y, w, h };
      clampBox();
      updateSelectionUI();
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function startNewSelection(e) {
    const startX = e.clientX;
    const startY = e.clientY;
    document.body.style.cursor = 'crosshair';

    const onMove = (ev) => {
      const x = Math.min(startX, ev.clientX);
      const y = Math.min(startY, ev.clientY);
      const w = Math.abs(ev.clientX - startX);
      const h = Math.abs(ev.clientY - startY);
      if (w >= 20 && h >= 20) {
        state.box = { x, y, w, h };
        clampBox();
        updateSelectionUI();
      }
    };
    const onUp = () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ============================================================
  // CAPTURE PARTIELLE
  // ============================================================

  async function confirmSelection() {
    const box = { ...state.box };
    if (state.selectionUI) { state.selectionUI.remove(); state.selectionUI = null; }
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 50));

    state.mode = 'panel';
    showPanel(state.pendingCommand, { kind: 'selection' });

    try {
      const canvas = await html2canvas(document.body, {
        x: window.scrollX + box.x,
        y: window.scrollY + box.y,
        width: box.w,
        height: box.h,
        useCORS: true, allowTaint: false, logging: false,
        scale: 1, backgroundColor: '#ffffff'
      });

      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      const element = document.elementFromPoint(centerX, centerY);
      const contextText = element ? (element.innerText || element.textContent || '').trim() : '';
      const base64 = canvas.toDataURL('image/png').split(',')[1];

      state.lastCapture = { imageBase64: base64, contextText, box, kind: 'selection' };
      updatePreview();
    } catch (err) {
      console.error('[MagicPointer] Erreur de capture :', err);
      const preview = state.panel?.querySelector('.mp-preview');
      if (preview) preview.innerHTML = `<div class="mp-preview-error">⚠️ ${err.message}</div>`;
    }
  }

  // ============================================================
  // NEW : CAPTURE PLEINE FENÊTRE
  // ============================================================

  async function captureFullWindow() {
    state.mode = 'panel';
    showPanel(null, { kind: 'fullwindow' });

    try {
      const w = window.innerWidth;
      const h = window.innerHeight;

      const canvas = await html2canvas(document.body, {
        x: window.scrollX,
        y: window.scrollY,
        width: w,
        height: h,
        useCORS: true, allowTaint: false, logging: false,
        scale: 1, backgroundColor: '#ffffff'
      });

      const contextText = (document.body.innerText || '').substring(0, 1000);
      const base64 = canvas.toDataURL('image/png').split(',')[1];

      state.lastCapture = {
        imageBase64: base64,
        contextText,
        box: { x: 0, y: 0, w, h },
        kind: 'fullwindow'
      };
      updatePreview();
    } catch (err) {
      console.error('[MagicPointer] Erreur capture fenêtre :', err);
      const preview = state.panel?.querySelector('.mp-preview');
      if (preview) preview.innerHTML = `<div class="mp-preview-error">⚠️ ${err.message}</div>`;
    }
  }

  // ============================================================
  // NEW : INSPECTEUR DE LIENS
  // ============================================================

  async function inspectLink(url) {
    state.mode = 'linkpreview';
    state.currentLinkUrl = url;
    showPanel(null, { kind: 'linkpreview', url });

    // Fetch le contenu via background
    try {
      const response = await chrome.runtime.sendMessage({ action: 'fetchUrl', url });

      if (!response.success) {
        throw new Error(response.error);
      }

      const pageInfo = response.data;
      updateLinkPreview(pageInfo);

      // Lancer automatiquement le résumé
      processLinkSummary(pageInfo);
    } catch (err) {
      const preview = state.panel?.querySelector('.mp-preview');
      if (preview) {
        preview.innerHTML = `<div class="mp-preview-error">⚠️ ${err.message}</div>`;
      }
    }
  }

  function updateLinkPreview(pageInfo) {
    if (!state.panel) return;
    const preview = state.panel.querySelector('.mp-preview');
    preview.innerHTML = `
      <div class="mp-link-preview">
        <div class="mp-link-icon">🔗</div>
        <div class="mp-link-info">
          <div class="mp-link-title">${escapeHTML(pageInfo.title || '(sans titre)')}</div>
          <div class="mp-link-url">${escapeHTML(new URL(pageInfo.url).hostname)}</div>
        </div>
      </div>
    `;
  }

  async function processLinkSummary(pageInfo) {
    const result = state.panel.querySelector('.mp-result');
    const suggestions = state.panel.querySelector('.mp-suggestions');

    if (suggestions) suggestions.style.display = 'none';
    result.style.display = 'block';
    result.innerHTML = '<div class="mp-loading"><span class="mp-spinner"></span> Lecture et résumé de la page…</div>';

    const contextText = [
      pageInfo.title && `Titre : ${pageInfo.title}`,
      pageInfo.description && `Description : ${pageInfo.description}`,
      pageInfo.content && `Contenu :\n${pageInfo.content}`
    ].filter(Boolean).join('\n\n');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'callAI',
        payload: {
          command: 'Résume cette page web en 3-4 phrases concises. Mentionne le sujet principal et les points clés. Si c\'est un article scientifique, mentionne aussi la méthode et les résultats principaux.',
          contextText,
          textOnly: true,
          imageBase64: null,
          contextHTML: ''
        }
      });

      if (response.success) {
        displayResult(response.data, { isLinkPreview: true, url: pageInfo.url });
      } else {
        result.innerHTML = `<div class="mp-error">❌ ${response.error}</div>`;
      }
    } catch (err) {
      result.innerHTML = `<div class="mp-error">❌ ${err.message}</div>`;
    }
  }

  // ============================================================
  // DÉSACTIVATION / RE-SÉLECTION
  // ============================================================

  function deactivate() {
    state.mode = 'idle';
    if (state.selectionUI) { state.selectionUI.remove(); state.selectionUI = null; }
    if (state.panel) { state.panel.remove(); state.panel = null; }
    state.pendingCommand = null;
    state.currentLinkUrl = null;
    document.body.style.cursor = '';
  }

  function reSelect() {
    const input = state.panel?.querySelector('.mp-input');
    if (input && input.value) state.pendingCommand = input.value;
    if (state.panel) { state.panel.remove(); state.panel = null; }
    enterSelectionMode();
  }

  // ============================================================
  // PANNEAU IA (utilise customPrompts maintenant)
  // ============================================================

  function showPanel(preselectedText, opts = {}) {
    const { kind = 'selection', url = null } = opts;
    state.panel = document.createElement('div');
    state.panel.className = 'mp-panel';

    // Construire les suggestions à partir des customPrompts
    const suggestionsHTML = state.customPrompts.map(p => `
      <button class="mp-suggestion" data-prompt="${escapeAttr(p.prompt)}" title="${escapeAttr(p.prompt)}">
        ${p.emoji || '⚡'} ${escapeHTML(p.title)}
      </button>
    `).join('');

    // Header adapté selon le mode
    let headerLabel = 'Magic Pointer';
    let kindBadge = '';
    if (kind === 'fullwindow') {
      kindBadge = '<span class="mp-kind-badge">📐 Toute la page</span>';
    } else if (kind === 'linkpreview') {
      kindBadge = '<span class="mp-kind-badge">🔗 Aperçu de lien</span>';
    }

    // Si linkpreview, pas de bouton "Re-sélectionner" mais "Aller au lien"
    const headerActions = (kind === 'linkpreview')
      ? `<button class="mp-close" title="Fermer (Échap)">×</button>`
      : `
        <button class="mp-reselect" title="Modifier la zone capturée">⤡ Re-sélectionner</button>
        <button class="mp-close" title="Fermer (Échap)">×</button>
      `;

    // Section input : cachée en mode linkpreview (résumé automatique)
    const inputSection = (kind === 'linkpreview') ? '' : `
      <div class="mp-input-group">
        <input
          type="text"
          class="mp-input"
          placeholder="Que voulez-vous faire ?"
          spellcheck="false"
          autocomplete="off"
        />
        <button class="mp-submit">↵</button>
      </div>
      <div class="mp-suggestions">${suggestionsHTML}</div>
    `;

    state.panel.innerHTML = `
      <div class="mp-panel-header">
        <div class="mp-logo">
          <span class="mp-logo-dot"></span>
          <span class="mp-logo-text">${headerLabel}</span>
          ${kindBadge}
        </div>
        <div class="mp-header-actions">${headerActions}</div>
      </div>
      <div class="mp-panel-body">
        <div class="mp-preview">
          <div class="mp-preview-loading">${kind === 'linkpreview' ? '📥 Chargement du lien…' : '📸 Capture en cours…'}</div>
        </div>
        ${inputSection}
        <div class="mp-result" style="display: none;"></div>
        <div class="mp-status"></div>
      </div>
    `;
    document.body.appendChild(state.panel);

    const close = state.panel.querySelector('.mp-close');
    const reselect = state.panel.querySelector('.mp-reselect');
    close.addEventListener('click', deactivate);
    if (reselect) reselect.addEventListener('click', reSelect);

    if (kind !== 'linkpreview') {
      const input = state.panel.querySelector('.mp-input');
      const submit = state.panel.querySelector('.mp-submit');

      if (preselectedText) input.value = preselectedText;
      input.focus();

      const handleSubmit = () => {
        const cmd = input.value.trim();
        if (cmd) processCommand(cmd);
      };

      submit.addEventListener('click', handleSubmit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        }
      });

      state.panel.querySelectorAll('.mp-suggestion').forEach(btn => {
        btn.addEventListener('click', () => {
          input.value = btn.dataset.prompt;
          handleSubmit();
        });
      });
    }

    state.panel.addEventListener('keydown', (e) => e.stopPropagation());
    state.panel.addEventListener('keyup', (e) => e.stopPropagation());
  }

  function updatePreview() {
    if (!state.panel || !state.lastCapture) return;
    const preview = state.panel.querySelector('.mp-preview');
    if (state.lastCapture.imageBase64) {
      preview.innerHTML = `
        <img src="data:image/png;base64,${state.lastCapture.imageBase64}"
             alt="Capture" class="mp-preview-img" />
        <div class="mp-preview-dims">${state.lastCapture.box.w} × ${state.lastCapture.box.h}</div>
      `;
    }
  }

  // ============================================================
  // APPEL IA (mode normal)
  // ============================================================

  async function processCommand(command) {
    if (!state.lastCapture || !state.lastCapture.imageBase64) {
      showStatus('Capture indisponible. Re-sélectionnez la zone.', 'error');
      return;
    }

    const result = state.panel.querySelector('.mp-result');
    const status = state.panel.querySelector('.mp-status');
    const suggestions = state.panel.querySelector('.mp-suggestions');

    suggestions.style.display = 'none';
    result.style.display = 'block';
    result.innerHTML = '<div class="mp-loading"><span class="mp-spinner"></span> L\'IA réfléchit…</div>';
    status.textContent = '';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'callAI',
        payload: {
          imageBase64: state.lastCapture.imageBase64,
          command,
          contextText: state.lastCapture.contextText,
          contextHTML: ''
        }
      });

      if (response.success) {
        displayResult(response.data, { isLinkPreview: false });
      } else {
        result.innerHTML = `<div class="mp-error">❌ ${response.error}</div>`;
      }
    } catch (err) {
      result.innerHTML = `<div class="mp-error">❌ ${err.message}</div>`;
    }
  }

  function displayResult(data, opts = {}) {
    const { isLinkPreview = false, url = null } = opts;
    const result = state.panel.querySelector('.mp-result');
    const text = data.text || '(pas de réponse)';
    const escaped = escapeHTML(text).replace(/\n/g, '<br>');

    // Actions différentes pour linkpreview
    const actionsHTML = isLinkPreview ? `
      <button class="mp-action mp-action-primary" data-action="openlink">↗ Aller au lien</button>
      <button class="mp-action" data-action="copy">📋 Copier</button>
      <button class="mp-action mp-action-zotero" data-action="zotero">📚 Zotero</button>
      <button class="mp-action" data-action="ask">💬 Question de suivi</button>
    ` : `
      <button class="mp-action" data-action="copy">📋 Copier</button>
      <button class="mp-action" data-action="insert">📥 Insérer</button>
      <button class="mp-action mp-action-zotero" data-action="zotero">📚 Zotero</button>
      <button class="mp-action" data-action="new">🔄 Nouvelle commande</button>
      <button class="mp-action" data-action="reselect">⤡ Re-sélectionner</button>
    `;

    result.innerHTML = `
      <div class="mp-result-meta">
        <span class="mp-badge mp-badge-${data.provider}">${data.provider === 'mistral' ? '🇫🇷 Mistral' : '🇺🇸 Claude'}</span>
        <span class="mp-model">${data.model}</span>
      </div>
      <div class="mp-result-text">${escaped}</div>
      <div class="mp-result-actions">${actionsHTML}</div>
    `;

    result.querySelectorAll('.mp-action').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, text, url));
    });
  }

  function handleAction(action, text, url) {
    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(text);
        showStatus('✓ Copié dans le presse-papiers');
        break;
      case 'insert':
        insertAtCursor(text);
        break;
      case 'new':
        resetPanel();
        break;
      case 'reselect':
        reSelect();
        break;
      case 'openlink':
        if (url) {
          window.open(url, '_blank', 'noopener');
          deactivate();
        }
        break;
      case 'ask':
        // Permettre une question de suivi sur le lien
        convertLinkToFollowUp();
        break;
      case 'zotero':
        // NEW v1.2 : sauver dans Zotero
        // En mode linkpreview, sauver le lien ; sinon, la page courante
        if (state.mode === 'linkpreview' && state.currentLinkUrl) {
          saveLinkToZotero(state.currentLinkUrl);
        } else {
          saveCurrentPageToZotero();
        }
        break;
    }
  }

  function convertLinkToFollowUp() {
    // Transformer le panneau linkpreview en panneau normal pour poser une question
    const panelBody = state.panel.querySelector('.mp-panel-body');
    const result = state.panel.querySelector('.mp-result');

    // Ajouter un input pour la question de suivi
    if (!state.panel.querySelector('.mp-followup-input')) {
      const followup = document.createElement('div');
      followup.className = 'mp-input-group mp-followup-input';
      followup.innerHTML = `
        <input
          type="text"
          class="mp-input"
          placeholder="Posez une question sur ce lien…"
          spellcheck="false"
        />
        <button class="mp-submit">↵</button>
      `;
      result.parentNode.insertBefore(followup, result);

      const input = followup.querySelector('.mp-input');
      const submit = followup.querySelector('.mp-submit');

      const handleFollowup = async () => {
        const q = input.value.trim();
        if (!q) return;

        // Re-fetch les infos du lien et poser la question
        const url = state.currentLinkUrl;
        const fetchResp = await chrome.runtime.sendMessage({ action: 'fetchUrl', url });
        if (!fetchResp.success) return;

        const pageInfo = fetchResp.data;
        const contextText = [
          pageInfo.title && `Titre : ${pageInfo.title}`,
          pageInfo.content && `Contenu :\n${pageInfo.content}`
        ].filter(Boolean).join('\n\n');

        result.style.display = 'block';
        result.innerHTML = '<div class="mp-loading"><span class="mp-spinner"></span> L\'IA réfléchit…</div>';

        const response = await chrome.runtime.sendMessage({
          action: 'callAI',
          payload: { command: q, contextText, textOnly: true, imageBase64: null, contextHTML: '' }
        });
        if (response.success) {
          displayResult(response.data, { isLinkPreview: true, url });
        } else {
          result.innerHTML = `<div class="mp-error">❌ ${response.error}</div>`;
        }
      };

      submit.addEventListener('click', handleFollowup);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleFollowup(); }
      });
      input.focus();
    }
  }

  function insertAtCursor(text) {
    const element = document.elementFromPoint(state.mouseX, state.mouseY);
    if (!element) { showStatus('⚠️ Élément introuvable', 'error'); return; }

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      const s = element.selectionStart || 0;
      const e = element.selectionEnd || 0;
      element.value = element.value.slice(0, s) + text + element.value.slice(e);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      showStatus('✓ Texte inséré');
    } else if (element.isContentEditable) {
      document.execCommand('insertText', false, text);
      showStatus('✓ Texte inséré');
    } else {
      navigator.clipboard.writeText(text);
      showStatus('Pas de champ éditable. Texte copié.');
    }
  }

  function resetPanel() {
    const result = state.panel.querySelector('.mp-result');
    const suggestions = state.panel.querySelector('.mp-suggestions');
    const input = state.panel.querySelector('.mp-input');
    result.style.display = 'none';
    if (suggestions) suggestions.style.display = 'flex';
    if (input) { input.value = ''; input.focus(); }
  }

  function showStatus(message, type = 'success') {
    const status = state.panel?.querySelector('.mp-status');
    if (!status) return;
    status.textContent = message;
    status.className = `mp-status mp-status-${type}`;
    setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, 3000);
  }

  // ============================================================
  // NEW v1.2 : ZOTERO - EXTRACTION + SAUVEGARDE
  // ============================================================

  /**
   * Extrait les métadonnées scholarly d'une page via les meta tags.
   * Reconnaît le standard Google Scholar (citation_*) et OpenGraph.
   */
  function extractScholarlyMetadata(doc = document) {
    const meta = (name) => {
      const el = doc.querySelector(
        `meta[name="${name}" i], meta[property="${name}" i]`
      );
      return el?.getAttribute('content')?.trim() || null;
    };
    const metaAll = (name) => {
      return Array.from(doc.querySelectorAll(`meta[name="${name}" i]`))
        .map(el => el.getAttribute('content')?.trim())
        .filter(Boolean);
    };

    // Tags citation_* (norme Google Scholar : la plupart des éditeurs académiques)
    const citationTitle = meta('citation_title');
    const citationDOI = meta('citation_doi');
    const citationJournal = meta('citation_journal_title');
    const citationAuthors = metaAll('citation_author');
    const citationAuthorsAlt = metaAll('citation_authors');
    const citationDate = meta('citation_publication_date') || meta('citation_date');
    const citationVolume = meta('citation_volume');
    const citationIssue = meta('citation_issue');
    const citationFirstPage = meta('citation_firstpage');
    const citationLastPage = meta('citation_lastpage');
    const citationISSN = meta('citation_issn');
    const citationISBN = meta('citation_isbn');
    const citationPublisher = meta('citation_publisher');
    const citationLanguage = meta('citation_language');
    const citationAbstract = meta('citation_abstract');
    const citationConference = meta('citation_conference_title');
    const citationBook = meta('citation_book_title') || meta('citation_inbook_title');

    // Détecter le type d'item
    let itemType = 'webpage';
    if (citationJournal || citationDOI) itemType = 'journalArticle';
    else if (citationBook) itemType = 'book';
    else if (citationConference) itemType = 'conferencePaper';

    // Fallback titre : meta description / OpenGraph / <title>
    const title = citationTitle
      || meta('og:title')
      || meta('twitter:title')
      || doc.querySelector('h1')?.textContent?.trim()
      || doc.title
      || '';

    // Auteurs : parser "Last, First" ou "First Last"
    const authors = (citationAuthors.length ? citationAuthors : citationAuthorsAlt);
    const creators = authors.flatMap(raw => {
      // citation_authors peut être "X; Y; Z"
      const names = raw.includes(';') ? raw.split(';').map(s => s.trim()) : [raw];
      return names.filter(Boolean).map(name => {
        if (name.includes(',')) {
          const [last, first] = name.split(',').map(s => s.trim());
          return { firstName: first || '', lastName: last || name, creatorType: 'author' };
        }
        const words = name.trim().split(/\s+/);
        if (words.length >= 2) {
          return {
            firstName: words.slice(0, -1).join(' '),
            lastName: words[words.length - 1],
            creatorType: 'author'
          };
        }
        return { lastName: name, creatorType: 'author' };
      });
    });

    const abstract = citationAbstract
      || meta('description')
      || meta('og:description')
      || meta('twitter:description')
      || '';

    const pages = citationFirstPage && citationLastPage
      ? `${citationFirstPage}-${citationLastPage}`
      : (citationFirstPage || null);

    return {
      itemType,
      title,
      creators,
      url: window.location.href,
      DOI: citationDOI || null,
      ISSN: citationISSN || null,
      ISBN: citationISBN || null,
      publicationTitle: citationJournal || (itemType === 'conferencePaper' ? citationConference : null),
      bookTitle: itemType === 'book' ? citationBook : null,
      publisher: citationPublisher || null,
      date: citationDate || null,
      volume: citationVolume || null,
      issue: citationIssue || null,
      pages,
      language: citationLanguage || null,
      abstractNote: abstract
    };
  }

  /**
   * Sauve la page courante dans Zotero.
   * Extrait automatiquement les métadonnées scholarly si disponibles.
   * Ajoute la note IA si présente dans l'état.
   */
  async function saveCurrentPageToZotero() {
    showZoteroToast('📚 Envoi vers Zotero…', 'loading');

    const metadata = extractScholarlyMetadata();

    // Si on a un résultat IA dans le panneau ouvert, l'inclure
    let aiNote = null;
    const resultText = state.panel?.querySelector('.mp-result-text');
    if (resultText) {
      aiNote = resultText.textContent.trim();
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveToZotero',
        payload: {
          metadata,
          aiNote,
          pageUrl: window.location.href,
          tags: []
        }
      });

      if (response.success) {
        showZoteroToast(
          `✓ Sauvé dans Zotero (${response.data.itemType === 'journalArticle' ? 'article' : 'page web'})`,
          'success'
        );
      } else {
        showZoteroToast(`⚠️ ${response.error}`, 'error');
      }
    } catch (err) {
      showZoteroToast(`⚠️ ${err.message}`, 'error');
    }
  }

  /**
   * Sauve un lien (sans le visiter) dans Zotero.
   * Fait un fetch via background pour récupérer les métadonnées.
   */
  async function saveLinkToZotero(url) {
    showZoteroToast('📚 Récupération du lien…', 'loading');

    try {
      // Demander au background de fetcher l'URL
      const fetchResp = await chrome.runtime.sendMessage({ action: 'fetchUrl', url });
      if (!fetchResp.success) {
        throw new Error(fetchResp.error);
      }

      const pageInfo = fetchResp.data;

      // Parser le HTML retourné pour extraire les métadonnées scholarly
      // Note : fetchUrl ne retourne pas le HTML brut, juste un extrait textuel.
      // On utilise donc les infos basiques disponibles.
      const metadata = {
        itemType: 'webpage',
        title: pageInfo.title || url,
        url,
        abstractNote: pageInfo.description || '',
        creators: []
      };

      showZoteroToast('📚 Envoi vers Zotero…', 'loading');

      const response = await chrome.runtime.sendMessage({
        action: 'saveToZotero',
        payload: {
          metadata,
          aiNote: null,
          pageUrl: url,
          tags: []
        }
      });

      if (response.success) {
        showZoteroToast('✓ Lien sauvé dans Zotero', 'success');
      } else {
        showZoteroToast(`⚠️ ${response.error}`, 'error');
      }
    } catch (err) {
      showZoteroToast(`⚠️ ${err.message}`, 'error');
    }
  }

  /**
   * Toast notification pour les opérations Zotero (visible même sans panel ouvert).
   */
  function showZoteroToast(message, type = 'success') {
    // Supprimer toast précédent
    document.getElementById('mp-zotero-toast')?.remove();

    const toast = document.createElement('div');
    toast.id = 'mp-zotero-toast';
    toast.className = `mp-zotero-toast mp-zotero-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove sauf en mode loading
    if (type !== 'loading') {
      setTimeout(() => {
        toast.classList.add('mp-zotero-toast-out');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

})();
