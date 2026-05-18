/**
 * Magic Pointer - Content Script (v2 : sélection interactive)
 *
 * Flow :
 *   Alt+M → mode SÉLECTION (zone redimensionnable + draggable)
 *     ↓ Enter ou clic "Capturer"
 *   Capture → mode PANEL (panneau IA classique)
 *     ↓ bouton "Re-sélectionner"
 *   Retour mode SÉLECTION
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
    mode: 'idle',  // 'idle' | 'selecting' | 'panel'
    captureSize: 500,
    showOverlay: true,

    // Zone de sélection (coordonnées viewport)
    box: { x: 0, y: 0, w: 500, h: 500 },

    // DOM refs
    selectionUI: null,
    panel: null,

    // Capture
    lastCapture: null,

    // Pour préserver la commande lors d'une re-sélection
    pendingCommand: null
  };

  chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
    if (settings) {
      state.captureSize = settings.captureSize || 500;
      state.showOverlay = settings.showOverlay !== false;
    }
  });

  // ============================================================
  // SUIVI DU CURSEUR
  // ============================================================

  document.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
  }, { passive: true });

  // ============================================================
  // RACCOURCIS GLOBAUX
  // ============================================================

  document.addEventListener('keydown', (e) => {
    if (state.mode === 'idle') return;

    // Échap : sortir
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      deactivate();
      return;
    }

    // Mode sélection : Enter pour valider
    if (state.mode === 'selecting' && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      confirmSelection();
      return;
    }

    // Mode sélection : flèches pour ajuster finement
    if (state.mode === 'selecting') {
      const step = e.shiftKey ? 10 : 1;
      let handled = false;

      if (e.altKey) {
        // Alt + flèches = redimensionner
        if (e.key === 'ArrowRight') { state.box.w += step; handled = true; }
        if (e.key === 'ArrowLeft')  { state.box.w = Math.max(60, state.box.w - step); handled = true; }
        if (e.key === 'ArrowDown')  { state.box.h += step; handled = true; }
        if (e.key === 'ArrowUp')    { state.box.h = Math.max(60, state.box.h - step); handled = true; }
      } else if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key)) {
        // Flèches = déplacer
        if (e.key === 'ArrowRight') { state.box.x += step; }
        if (e.key === 'ArrowLeft')  { state.box.x -= step; }
        if (e.key === 'ArrowDown')  { state.box.y += step; }
        if (e.key === 'ArrowUp')    { state.box.y -= step; }
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
    if (message.action === 'activate') {
      if (state.mode !== 'idle') {
        deactivate();
      } else {
        enterSelectionMode(message.selectionText);
      }
    }
  });

  // ============================================================
  // MODE SÉLECTION
  // ============================================================

  function enterSelectionMode(preselectedText) {
    state.mode = 'selecting';

    // Init box centrée sur curseur
    const w = Math.min(state.captureSize, window.innerWidth - 40);
    const h = Math.min(state.captureSize, window.innerHeight - 40);
    state.box = {
      x: Math.max(20, state.mouseX - w / 2),
      y: Math.max(20, state.mouseY - h / 2),
      w,
      h
    };
    clampBox();

    // Construire l'UI
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
          <kbd>↵</kbd> capturer · <kbd>Esc</kbd> annuler · <kbd>↑↓←→</kbd> déplacer · <kbd>Alt</kbd>+flèches redimensionner · glisser dans la zone sombre = nouvelle sélection
        </div>
        <div class="mp-toolbar-actions">
          <button class="mp-toolbar-btn mp-btn-cancel" id="mp-cancel">Annuler</button>
          <button class="mp-toolbar-btn mp-btn-confirm" id="mp-confirm">
            <span class="mp-confirm-icon">✓</span>
            Capturer cette zone
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
    box.style.left   = state.box.x + 'px';
    box.style.top    = state.box.y + 'px';
    box.style.width  = state.box.w + 'px';
    box.style.height = state.box.h + 'px';

    const dims = state.selectionUI.querySelector('#mp-dims');
    dims.textContent = `${Math.round(state.box.w)} × ${Math.round(state.box.h)}`;

    // Position de la toolbar
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

    // Centrer horizontalement
    const toolbarW = 480;
    let toolbarX = state.box.x + state.box.w / 2 - toolbarW / 2;
    toolbarX = Math.max(12, Math.min(toolbarX, window.innerWidth - toolbarW - 12));
    toolbar.style.left = toolbarX + 'px';
  }

  // ============================================================
  // INTERACTIONS DRAG/RESIZE
  // ============================================================

  function setupSelectionInteractions() {
    const ui = state.selectionUI;
    const box = ui.querySelector('.mp-selection-box');
    const dimOverlay = ui.querySelector('.mp-dim-overlay');

    // Drag de la box (déplacement)
    box.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('mp-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      startDrag(e);
    });

    // Resize via poignées
    ui.querySelectorAll('.mp-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e, handle.dataset.handle);
      });
    });

    // Clic-glisser sur la zone sombre = nouvelle sélection
    dimOverlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startNewSelection(e);
    });

    // Boutons
    ui.querySelector('#mp-confirm').addEventListener('click', confirmSelection);
    ui.querySelector('#mp-cancel').addEventListener('click', deactivate);
  }

  function startDrag(e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = { ...state.box };
    document.body.style.cursor = 'grabbing';

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      state.box.x = startBox.x + dx;
      state.box.y = startBox.y + dy;
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
      n:  'ns-resize',   s:  'ns-resize',
      e:  'ew-resize',   w:  'ew-resize'
    };
    document.body.style.cursor = cursors[dir] || 'default';

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const minSize = 60;

      let { x, y, w, h } = startBox;

      if (dir.includes('e')) {
        w = Math.max(minSize, startBox.w + dx);
      }
      if (dir.includes('w')) {
        const newW = Math.max(minSize, startBox.w - dx);
        x = startBox.x + (startBox.w - newW);
        w = newW;
      }
      if (dir.includes('s')) {
        h = Math.max(minSize, startBox.h + dy);
      }
      if (dir.includes('n')) {
        const newH = Math.max(minSize, startBox.h - dy);
        y = startBox.y + (startBox.h - newH);
        h = newH;
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
    let hasMoved = false;

    const onMove = (ev) => {
      hasMoved = true;
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
  // CAPTURE
  // ============================================================

  async function confirmSelection() {
    const box = { ...state.box };

    // Retirer l'UI de sélection AVANT la capture
    if (state.selectionUI) {
      state.selectionUI.remove();
      state.selectionUI = null;
    }

    // Laisser le DOM se rafraîchir
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 50));

    state.mode = 'panel';
    showPanel(state.pendingCommand);

    try {
      const canvas = await html2canvas(document.body, {
        x: window.scrollX + box.x,
        y: window.scrollY + box.y,
        width:  box.w,
        height: box.h,
        useCORS: true,
        allowTaint: false,
        logging: false,
        scale: 1,
        backgroundColor: '#ffffff'
      });

      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      const element = document.elementFromPoint(centerX, centerY);
      const contextText = element ? (element.innerText || element.textContent || '').trim() : '';

      const base64 = canvas.toDataURL('image/png').split(',')[1];

      state.lastCapture = {
        imageBase64: base64,
        contextText,
        box
      };

      updatePreview();
    } catch (err) {
      console.error('[MagicPointer] Erreur de capture :', err);
      const preview = state.panel?.querySelector('.mp-preview');
      if (preview) {
        preview.innerHTML = `<div class="mp-preview-error">⚠️ ${err.message}</div>`;
      }
    }
  }

  // ============================================================
  // DÉSACTIVATION / RE-SÉLECTION
  // ============================================================

  function deactivate() {
    state.mode = 'idle';
    if (state.selectionUI) {
      state.selectionUI.remove();
      state.selectionUI = null;
    }
    if (state.panel) {
      state.panel.remove();
      state.panel = null;
    }
    state.pendingCommand = null;
    document.body.style.cursor = '';
  }

  function reSelect() {
    // Sauvegarder commande tapée
    const input = state.panel?.querySelector('.mp-input');
    if (input && input.value) {
      state.pendingCommand = input.value;
    }
    if (state.panel) {
      state.panel.remove();
      state.panel = null;
    }
    enterSelectionMode();
  }

  // ============================================================
  // PANNEAU IA (après capture)
  // ============================================================

  function showPanel(preselectedText) {
    state.panel = document.createElement('div');
    state.panel.className = 'mp-panel';
    state.panel.innerHTML = `
      <div class="mp-panel-header">
        <div class="mp-logo">
          <span class="mp-logo-dot"></span>
          <span class="mp-logo-text">Magic Pointer</span>
        </div>
        <div class="mp-header-actions">
          <button class="mp-reselect" title="Modifier la zone capturée">
            ⤡ Re-sélectionner
          </button>
          <button class="mp-close" title="Fermer (Échap)">×</button>
        </div>
      </div>
      <div class="mp-panel-body">
        <div class="mp-preview">
          <div class="mp-preview-loading">📸 Capture en cours…</div>
        </div>
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
        <div class="mp-suggestions">
          <button class="mp-suggestion" data-prompt="Résume ce contenu en 3 points clés">📝 Résumer</button>
          <button class="mp-suggestion" data-prompt="Extrais les données importantes au format JSON">📊 Extraire</button>
          <button class="mp-suggestion" data-prompt="Traduis ce texte en français">🌐 Traduire FR</button>
          <button class="mp-suggestion" data-prompt="Translate this to English">🌐 EN</button>
          <button class="mp-suggestion" data-prompt="Corrige les fautes d'orthographe et de grammaire">✏️ Corriger</button>
          <button class="mp-suggestion" data-prompt="Explique ce concept simplement">💡 Expliquer</button>
        </div>
        <div class="mp-result" style="display: none;"></div>
        <div class="mp-status"></div>
      </div>
    `;
    document.body.appendChild(state.panel);

    const input = state.panel.querySelector('.mp-input');
    const submit = state.panel.querySelector('.mp-submit');
    const close = state.panel.querySelector('.mp-close');
    const reselect = state.panel.querySelector('.mp-reselect');

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

    close.addEventListener('click', deactivate);
    reselect.addEventListener('click', reSelect);

    state.panel.querySelectorAll('.mp-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.prompt;
        handleSubmit();
      });
    });

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
  // APPEL IA
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
        displayResult(response.data);
      } else {
        result.innerHTML = `<div class="mp-error">❌ ${response.error}</div>`;
      }
    } catch (err) {
      result.innerHTML = `<div class="mp-error">❌ ${err.message}</div>`;
    }
  }

  function displayResult(data) {
    const result = state.panel.querySelector('.mp-result');
    const text = data.text || '(pas de réponse)';
    const escaped = escapeHTML(text).replace(/\n/g, '<br>');

    result.innerHTML = `
      <div class="mp-result-meta">
        <span class="mp-badge mp-badge-${data.provider}">${data.provider === 'mistral' ? '🇫🇷 Mistral' : '🇺🇸 Claude'}</span>
        <span class="mp-model">${data.model}</span>
      </div>
      <div class="mp-result-text">${escaped}</div>
      <div class="mp-result-actions">
        <button class="mp-action" data-action="copy">📋 Copier</button>
        <button class="mp-action" data-action="insert">📥 Insérer</button>
        <button class="mp-action" data-action="new">🔄 Nouvelle commande</button>
        <button class="mp-action" data-action="reselect">⤡ Re-sélectionner</button>
      </div>
    `;

    result.querySelectorAll('.mp-action').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, text));
    });
  }

  function handleAction(action, text) {
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
    }
  }

  function insertAtCursor(text) {
    const element = document.elementFromPoint(state.mouseX, state.mouseY);
    if (!element) {
      showStatus('⚠️ Élément introuvable', 'error');
      return;
    }
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      const s = element.selectionStart || 0;
      const e = element.selectionEnd || 0;
      element.value = element.value.slice(0, s) + text + element.value.slice(e);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      showStatus('✓ Texte inséré');
    } else if (element.isContentEditable) {
      document.execCommand('insertText', false, text);
      showStatus('✓ Texte inséré');
    } else {
      navigator.clipboard.writeText(text);
      showStatus('Pas de champ éditable. Texte copié à la place.');
    }
  }

  function resetPanel() {
    const result = state.panel.querySelector('.mp-result');
    const suggestions = state.panel.querySelector('.mp-suggestions');
    const input = state.panel.querySelector('.mp-input');
    result.style.display = 'none';
    suggestions.style.display = 'flex';
    input.value = '';
    input.focus();
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

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
