/**
 * Magic Pointer v1.1 - Options Page
 *
 * Nouveautés :
 *  - CRUD complet des prompts personnalisés (ajout, édition inline, suppression, reset)
 *  - Stockage dans chrome.storage.sync.customPrompts
 */

// ============================================================
// PROMPTS PAR DÉFAUT (alignés avec background.js)
// ============================================================

const DEFAULT_PROMPTS = [
  { id: 'p_summary',   emoji: '📝', title: 'Résumer',    prompt: 'Résume ce contenu en 3 points clés' },
  { id: 'p_extract',   emoji: '📊', title: 'Extraire',   prompt: 'Extrais les données importantes au format JSON' },
  { id: 'p_translate', emoji: '🌐', title: 'Traduire',   prompt: 'Traduis ce texte en français' },
  { id: 'p_correct',   emoji: '✏️', title: 'Corriger',   prompt: 'Corrige les fautes d\'orthographe et de grammaire' },
  { id: 'p_explain',   emoji: '💡', title: 'Expliquer',  prompt: 'Explique ce concept simplement' },
  { id: 'p_apa',       emoji: '📚', title: 'Format APA', prompt: 'Extrais et formate les références bibliographiques au format APA 7e édition' }
];

// ============================================================
// REFS DOM
// ============================================================

const els = {
  providers: document.querySelectorAll('input[name="provider"]'),
  mistralConfig: document.getElementById('mistral-config'),
  claudeConfig: document.getElementById('claude-config'),
  mistralApiKey: document.getElementById('mistralApiKey'),
  claudeApiKey: document.getElementById('claudeApiKey'),
  mistralModel: document.getElementById('mistralModel'),
  claudeModel: document.getElementById('claudeModel'),
  captureSize: document.getElementById('captureSize'),
  captureSizeValue: document.getElementById('captureSizeValue'),
  systemPrompt: document.getElementById('systemPrompt'),
  save: document.getElementById('save'),
  testConnection: document.getElementById('testConnection'),
  status: document.getElementById('status'),
  toggleButtons: document.querySelectorAll('.toggle-visibility'),

  // Prompts management
  promptsList: document.getElementById('prompts-list'),
  addPromptBtn: document.getElementById('add-prompt'),
  resetPromptsBtn: document.getElementById('reset-prompts'),
  promptTemplate: document.getElementById('prompt-template'),

  // NEW v1.2 : Zotero
  zoteroStatusDot: document.getElementById('zoteroStatusDot'),
  zoteroStatusTitle: document.getElementById('zoteroStatusTitle'),
  zoteroStatusDetail: document.getElementById('zoteroStatusDetail'),
  testZoteroBtn: document.getElementById('testZotero'),
  zoteroAutoTag: document.getElementById('zoteroAutoTag'),
  zoteroAutoNote: document.getElementById('zoteroAutoNote')
};

// ============================================================
// CHARGEMENT
// ============================================================

function loadSettings() {
  chrome.storage.sync.get(null, (settings) => {
    const provider = settings.provider || 'mistral';
    document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
    updateProviderVisibility(provider);

    if (settings.mistralApiKey) els.mistralApiKey.value = settings.mistralApiKey;
    if (settings.claudeApiKey) els.claudeApiKey.value = settings.claudeApiKey;

    if (settings.model) {
      if (provider === 'mistral') els.mistralModel.value = settings.model;
      else els.claudeModel.value = settings.model;
    }

    if (settings.captureSize) {
      els.captureSize.value = settings.captureSize;
      els.captureSizeValue.textContent = settings.captureSize + 'px';
    }

    if (settings.systemPrompt) els.systemPrompt.value = settings.systemPrompt;

    // NEW v1.2 : Zotero
    if (settings.zoteroAutoTag) els.zoteroAutoTag.value = settings.zoteroAutoTag;
    if (settings.zoteroAutoNote !== undefined) els.zoteroAutoNote.checked = settings.zoteroAutoNote;
    else els.zoteroAutoNote.checked = true;

    // Charger les prompts (avec fallback sur les défauts)
    const prompts = settings.customPrompts || DEFAULT_PROMPTS;
    renderPrompts(prompts);

    // Test Zotero au chargement (silencieux)
    pingZotero();
  });
}

// ============================================================
// PROVIDER VISIBILITY
// ============================================================

function updateProviderVisibility(provider) {
  els.mistralConfig.style.display = provider === 'mistral' ? '' : 'none';
  els.claudeConfig.style.display = provider === 'claude' ? '' : 'none';
}

els.providers.forEach(radio => {
  radio.addEventListener('change', (e) => updateProviderVisibility(e.target.value));
});

// ============================================================
// SLIDERS
// ============================================================

els.captureSize.addEventListener('input', (e) => {
  els.captureSizeValue.textContent = e.target.value + 'px';
});

// ============================================================
// TOGGLE PASSWORD
// ============================================================

els.toggleButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (input.type === 'password') {
      input.type = 'text'; btn.textContent = '🙈';
    } else {
      input.type = 'password'; btn.textContent = '👁';
    }
  });
});

// ============================================================
// NEW : GESTION DES PROMPTS
// ============================================================

function renderPrompts(prompts) {
  els.promptsList.innerHTML = '';
  prompts.forEach(prompt => addPromptToDOM(prompt, false));
}

function addPromptToDOM(prompt, isNew = false) {
  const clone = els.promptTemplate.content.cloneNode(true);
  const item = clone.querySelector('.prompt-item');
  item.dataset.id = prompt.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const emojiInput = item.querySelector('.prompt-emoji');
  const titleInput = item.querySelector('.prompt-title');
  const textInput = item.querySelector('.prompt-text');
  const deleteBtn = item.querySelector('.prompt-delete');

  emojiInput.value = prompt.emoji || '⚡';
  titleInput.value = prompt.title || '';
  textInput.value = prompt.prompt || '';

  if (isNew) item.classList.add('new');

  deleteBtn.addEventListener('click', () => {
    item.style.transition = 'all 0.2s ease';
    item.style.opacity = '0';
    item.style.transform = 'translateX(-12px)';
    setTimeout(() => item.remove(), 200);
  });

  els.promptsList.appendChild(item);
}

function collectPrompts() {
  const prompts = [];
  els.promptsList.querySelectorAll('.prompt-item').forEach(item => {
    const id = item.dataset.id;
    const emoji = item.querySelector('.prompt-emoji').value.trim() || '⚡';
    const title = item.querySelector('.prompt-title').value.trim();
    const prompt = item.querySelector('.prompt-text').value.trim();

    // Ne pas inclure les prompts vides
    if (title && prompt) {
      prompts.push({ id, emoji, title, prompt });
    }
  });
  return prompts;
}

els.addPromptBtn.addEventListener('click', () => {
  addPromptToDOM({
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    emoji: '⚡',
    title: '',
    prompt: ''
  }, true);

  // Focus sur le nouveau titre
  const lastItem = els.promptsList.querySelector('.prompt-item:last-child');
  lastItem?.querySelector('.prompt-title')?.focus();
});

els.resetPromptsBtn.addEventListener('click', () => {
  if (confirm('Restaurer les commandes par défaut ?\n\nVos commandes personnalisées seront remplacées.')) {
    renderPrompts(DEFAULT_PROMPTS);
    showStatus('✓ Commandes par défaut restaurées (n\'oubliez pas d\'enregistrer)', 'info');
  }
});

// ============================================================
// ENREGISTREMENT
// ============================================================

els.save.addEventListener('click', () => {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const model = provider === 'mistral' ? els.mistralModel.value : els.claudeModel.value;

  if (provider === 'mistral' && !els.mistralApiKey.value.trim()) {
    showStatus('⚠️ Veuillez entrer une clé API Mistral', 'error');
    return;
  }
  if (provider === 'claude' && !els.claudeApiKey.value.trim()) {
    showStatus('⚠️ Veuillez entrer une clé API Claude', 'error');
    return;
  }

  const customPrompts = collectPrompts();

  const settings = {
    provider,
    model,
    mistralApiKey: els.mistralApiKey.value.trim(),
    claudeApiKey: els.claudeApiKey.value.trim(),
    captureSize: parseInt(els.captureSize.value),
    systemPrompt: els.systemPrompt.value.trim(),
    customPrompts,
    // NEW v1.2 : Zotero
    zoteroAutoTag: els.zoteroAutoTag.value.trim(),
    zoteroAutoNote: els.zoteroAutoNote.checked
  };

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      showStatus('❌ Erreur : ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus(`✓ Enregistré (${customPrompts.length} commandes)`, 'success');
    }
  });
});

// ============================================================
// TEST DE CONNEXION
// ============================================================

els.testConnection.addEventListener('click', async () => {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const apiKey = provider === 'mistral' ? els.mistralApiKey.value : els.claudeApiKey.value;

  if (!apiKey.trim()) {
    showStatus('⚠️ Entrez d\'abord votre clé API', 'error');
    return;
  }

  showStatus('🔌 Test en cours…', 'info');
  els.testConnection.disabled = true;

  try {
    if (provider === 'mistral') await testMistral(apiKey, els.mistralModel.value);
    else await testClaude(apiKey, els.claudeModel.value);
    showStatus('✓ Connexion réussie ! Clé valide.', 'success');
  } catch (err) {
    showStatus('❌ ' + err.message, 'error');
  } finally {
    els.testConnection.disabled = false;
  }
});

async function testMistral(apiKey, model) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'OK?' }], max_tokens: 10 })
  });
  if (!response.ok) {
    const t = await response.text();
    try {
      const j = JSON.parse(t);
      throw new Error(j.message || j.error?.message || `${response.status}`);
    } catch (e) {
      if (e.message) throw e;
      throw new Error(`${response.status}`);
    }
  }
}

async function testClaude(apiKey, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'OK?' }] })
  });
  if (!response.ok) {
    const t = await response.text();
    try {
      const j = JSON.parse(t);
      throw new Error(j.error?.message || `${response.status}`);
    } catch (e) {
      if (e.message) throw e;
      throw new Error(`${response.status}`);
    }
  }
}

// ============================================================
// STATUS
// ============================================================

function showStatus(message, type = 'info') {
  els.status.textContent = message;
  els.status.className = `status show ${type}`;
  if (type !== 'info') {
    setTimeout(() => els.status.classList.remove('show'), 4000);
  }
}

// ============================================================
// INIT
// ============================================================

loadSettings();

// ============================================================
// NEW v1.2 : ZOTERO
// ============================================================

async function pingZotero() {
  setZoteroStatus('checking', 'Vérification…', 'Test de la connexion à Zotero');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'pingZotero' });

    if (response.success && response.running) {
      setZoteroStatus('ok', '✓ Zotero détecté', 'Vous pouvez sauver vos pages dans Zotero');
    } else {
      setZoteroStatus('warning', '⚠️ Zotero non détecté',
        'Ouvrez l\'application Zotero desktop, puis cliquez "Tester"');
    }
  } catch (err) {
    setZoteroStatus('error', '❌ Erreur', err.message);
  }
}

function setZoteroStatus(level, title, detail) {
  els.zoteroStatusDot.className = 'zotero-status-indicator zotero-status-' + level;
  els.zoteroStatusTitle.textContent = title;
  els.zoteroStatusDetail.textContent = detail;
}

if (els.testZoteroBtn) {
  els.testZoteroBtn.addEventListener('click', pingZotero);
}
