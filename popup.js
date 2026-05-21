/**
 * Magic Pointer v1.1 - Popup
 */

const PROVIDER_NAMES = {
  mistral: '🇫🇷 Mistral AI',
  claude: '🇺🇸 Anthropic Claude'
};

const els = {
  statusIndicator: document.getElementById('statusIndicator'),
  statusValue: document.getElementById('statusValue'),
  providerName: document.getElementById('providerName'),
  providerModel: document.getElementById('providerModel'),
  activate: document.getElementById('activate'),
  captureFull: document.getElementById('captureFull'),
  openOptions: document.getElementById('openOptions'),
  changeProvider: document.getElementById('changeProvider'),
  helpLink: document.getElementById('helpLink'),
  aboutLink: document.getElementById('aboutLink')
};

// Charger l'état
chrome.storage.sync.get(null, (settings) => {
  const provider = settings.provider || 'mistral';
  const apiKey = provider === 'mistral' ? settings.mistralApiKey : settings.claudeApiKey;

  els.providerName.textContent = PROVIDER_NAMES[provider] || provider;
  els.providerModel.textContent = settings.model || '(défaut)';

  if (apiKey) {
    els.statusIndicator.classList.add('ready');
    els.statusValue.textContent = 'Prêt';
  } else {
    els.statusIndicator.classList.add('warning');
    els.statusValue.textContent = 'Clé API à configurer';
  }
});

// Activer Magic Pointer (sélection)
els.activate.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'activate' });
      window.close();
    }
  });
});

// NEW : Capture toute la fenêtre
els.captureFull.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'captureFullWindow' });
      window.close();
    }
  });
});

els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

els.changeProvider.addEventListener('click', () => {
  chrome.storage.sync.get(['provider'], (settings) => {
    const newProvider = settings.provider === 'mistral' ? 'claude' : 'mistral';
    const newModel = newProvider === 'mistral' ? 'pixtral-12b-2409' : 'claude-3-5-sonnet-20241022';

    chrome.storage.sync.set({ provider: newProvider, model: newModel }, () => {
      els.providerName.textContent = PROVIDER_NAMES[newProvider];
      els.providerModel.textContent = newModel;

      chrome.storage.sync.get(null, (s) => {
        const apiKey = newProvider === 'mistral' ? s.mistralApiKey : s.claudeApiKey;
        els.statusIndicator.className = 'status-indicator ' + (apiKey ? 'ready' : 'warning');
        els.statusValue.textContent = apiKey ? 'Prêt' : 'Clé API à configurer';
      });
    });
  });
});

els.helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

els.aboutLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://docs.mistral.ai/capabilities/vision/' });
});
