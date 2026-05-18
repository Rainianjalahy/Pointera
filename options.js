/**
 * Magic Pointer - Options Page Logic
 */

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
  showOverlay: document.getElementById('showOverlay'),
  systemPrompt: document.getElementById('systemPrompt'),
  save: document.getElementById('save'),
  testConnection: document.getElementById('testConnection'),
  status: document.getElementById('status'),
  toggleButtons: document.querySelectorAll('.toggle-visibility')
};

// ============================================================
// CHARGEMENT DES PARAMÈTRES
// ============================================================

function loadSettings() {
  chrome.storage.sync.get(null, (settings) => {
    const provider = settings.provider || 'mistral';
    document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
    updateProviderVisibility(provider);

    if (settings.mistralApiKey) els.mistralApiKey.value = settings.mistralApiKey;
    if (settings.claudeApiKey) els.claudeApiKey.value = settings.claudeApiKey;

    // Le model est partagé mais on l'attribue au bon select
    if (settings.model) {
      if (provider === 'mistral') {
        els.mistralModel.value = settings.model;
      } else {
        els.claudeModel.value = settings.model;
      }
    }

    if (settings.captureSize) {
      els.captureSize.value = settings.captureSize;
      els.captureSizeValue.textContent = settings.captureSize + 'px';
    }

    if (settings.showOverlay !== undefined) {
      els.showOverlay.checked = settings.showOverlay;
    }

    if (settings.systemPrompt) {
      els.systemPrompt.value = settings.systemPrompt;
    }
  });
}

// ============================================================
// AFFICHAGE CONDITIONNEL DES PROVIDERS
// ============================================================

function updateProviderVisibility(provider) {
  if (provider === 'mistral') {
    els.mistralConfig.style.display = '';
    els.claudeConfig.style.display = 'none';
  } else {
    els.mistralConfig.style.display = 'none';
    els.claudeConfig.style.display = '';
  }
}

els.providers.forEach(radio => {
  radio.addEventListener('change', (e) => {
    updateProviderVisibility(e.target.value);
  });
});

// ============================================================
// SLIDER : LIVE UPDATE
// ============================================================

els.captureSize.addEventListener('input', (e) => {
  els.captureSizeValue.textContent = e.target.value + 'px';
});

// ============================================================
// TOGGLE VISIBILITY DES CLÉS API
// ============================================================

els.toggleButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁';
    }
  });
});

// ============================================================
// ENREGISTREMENT
// ============================================================

els.save.addEventListener('click', () => {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const model = provider === 'mistral' ? els.mistralModel.value : els.claudeModel.value;

  // Validation
  if (provider === 'mistral' && !els.mistralApiKey.value.trim()) {
    showStatus('⚠️ Veuillez entrer une clé API Mistral', 'error');
    return;
  }
  if (provider === 'claude' && !els.claudeApiKey.value.trim()) {
    showStatus('⚠️ Veuillez entrer une clé API Claude', 'error');
    return;
  }

  const settings = {
    provider,
    model,
    mistralApiKey: els.mistralApiKey.value.trim(),
    claudeApiKey: els.claudeApiKey.value.trim(),
    captureSize: parseInt(els.captureSize.value),
    showOverlay: els.showOverlay.checked,
    systemPrompt: els.systemPrompt.value.trim()
  };

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      showStatus('❌ Erreur : ' + chrome.runtime.lastError.message, 'error');
    } else {
      showStatus('✓ Paramètres enregistrés avec succès', 'success');
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

  showStatus('🔌 Test de connexion en cours…', 'info');
  els.testConnection.disabled = true;

  try {
    if (provider === 'mistral') {
      await testMistral(apiKey, els.mistralModel.value);
    } else {
      await testClaude(apiKey, els.claudeModel.value);
    }
    showStatus('✓ Connexion réussie ! Clé API valide.', 'success');
  } catch (err) {
    showStatus('❌ ' + err.message, 'error');
  } finally {
    els.testConnection.disabled = false;
  }
});

async function testMistral(apiKey, model) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: 'Réponds juste : OK' }],
      max_tokens: 10
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `Mistral : ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      msg = errJson.message || errJson.error?.message || msg;
    } catch {}
    throw new Error(msg);
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
    body: JSON.stringify({
      model: model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Réponds juste : OK' }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let msg = `Claude : ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      msg = errJson.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }
}

// ============================================================
// STATUS HELPER
// ============================================================

function showStatus(message, type = 'info') {
  els.status.textContent = message;
  els.status.className = `status show ${type}`;

  if (type !== 'info') {
    setTimeout(() => {
      els.status.classList.remove('show');
    }, 4000);
  }
}

// ============================================================
// INIT
// ============================================================

loadSettings();
