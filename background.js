/**
 * Magic Pointer - Background Service Worker
 *
 * Rôle :
 *  - Gérer les appels API (Mistral, Claude)
 *  - Stocker les clés API en sécurité
 *  - Communiquer avec content scripts via messages
 *  - Raccourci clavier global
 *  - Menu contextuel
 */

// ============================================================
// CONFIGURATION DES PROVIDERS
// ============================================================

const PROVIDERS = {
  mistral: {
    name: 'Mistral AI',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    models: {
      vision: 'pixtral-12b-2409',
      large: 'mistral-large-latest',
      small: 'mistral-small-latest'
    },
    defaultModel: 'pixtral-12b-2409'
  },
  claude: {
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: {
      sonnet: 'claude-3-5-sonnet-20241022',
      haiku: 'claude-3-5-haiku-20241022'
    },
    defaultModel: 'claude-3-5-sonnet-20241022'
  }
};

// ============================================================
// INSTALLATION & SETUP
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  // Menu contextuel
  chrome.contextMenus.create({
    id: 'magic-pointer-selection',
    title: '✨ Magic Pointer : analyser',
    contexts: ['selection', 'image', 'page']
  });

  // Valeurs par défaut
  chrome.storage.sync.get(['provider', 'model'], (result) => {
    if (!result.provider) {
      chrome.storage.sync.set({
        provider: 'mistral',
        model: PROVIDERS.mistral.defaultModel,
        captureSize: 500,
        showOverlay: true
      });
    }
  });
});

// ============================================================
// RACCOURCI CLAVIER
// ============================================================

chrome.commands.onCommand.addListener((command) => {
  if (command === 'activate-magic-pointer') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'activate' });
      }
    });
  }
});

// ============================================================
// MENU CONTEXTUEL
// ============================================================

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'magic-pointer-selection') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'activate',
      selectionText: info.selectionText,
      srcUrl: info.srcUrl
    });
  }
});

// ============================================================
// COMMUNICATION AVEC CONTENT SCRIPT
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'callAI') {
    handleAICall(message.payload)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get(null, (settings) => sendResponse(settings));
    return true;
  }
});

// ============================================================
// APPEL API - DISPATCHER
// ============================================================

async function handleAICall({ imageBase64, command, contextText, contextHTML }) {
  const settings = await chrome.storage.sync.get([
    'provider', 'model', 'mistralApiKey', 'claudeApiKey', 'systemPrompt'
  ]);

  const provider = settings.provider || 'mistral';

  if (provider === 'mistral') {
    return await callMistral({
      apiKey: settings.mistralApiKey,
      model: settings.model || PROVIDERS.mistral.defaultModel,
      imageBase64,
      command,
      contextText,
      contextHTML,
      systemPrompt: settings.systemPrompt
    });
  } else if (provider === 'claude') {
    return await callClaude({
      apiKey: settings.claudeApiKey,
      model: settings.model || PROVIDERS.claude.defaultModel,
      imageBase64,
      command,
      contextText,
      contextHTML,
      systemPrompt: settings.systemPrompt
    });
  }

  throw new Error(`Provider inconnu : ${provider}`);
}

// ============================================================
// API MISTRAL (Pixtral / Mistral Large)
// ============================================================

async function callMistral({ apiKey, model, imageBase64, command, contextText, contextHTML, systemPrompt }) {
  if (!apiKey) {
    throw new Error('Clé API Mistral manquante. Configurez-la dans les options.');
  }

  const userPrompt = buildPrompt(command, contextText, contextHTML);

  const messages = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  messages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: userPrompt
      },
      {
        type: 'image_url',
        image_url: `data:image/png;base64,${imageBase64}`
      }
    ]
  });

  const response = await fetch(PROVIDERS.mistral.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: 1500,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Mistral API : ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.message || errorJson.error?.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();

  return {
    provider: 'mistral',
    model: model,
    text: data.choices[0].message.content,
    usage: data.usage
  };
}

// ============================================================
// API CLAUDE (Anthropic)
// ============================================================

async function callClaude({ apiKey, model, imageBase64, command, contextText, contextHTML, systemPrompt }) {
  if (!apiKey) {
    throw new Error('Clé API Claude manquante. Configurez-la dans les options.');
  }

  const userPrompt = buildPrompt(command, contextText, contextHTML);

  const body = {
    model: model,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: userPrompt
          }
        ]
      }
    ]
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(PROVIDERS.claude.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Claude API : ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.error?.message || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();

  return {
    provider: 'claude',
    model: model,
    text: data.content[0].text,
    usage: data.usage
  };
}

// ============================================================
// CONSTRUCTION DU PROMPT
// ============================================================

function buildPrompt(command, contextText, contextHTML) {
  let prompt = `Tu vois une capture d'écran d'une zone autour du curseur souris (point rouge au centre).

`;

  if (contextText && contextText.trim()) {
    prompt += `Texte de l'élément pointé : "${contextText.substring(0, 500)}"\n\n`;
  }

  prompt += `Commande de l'utilisateur : "${command}"

Instructions :
- Analyse l'image et le contexte
- Réponds de manière concise et directe
- Si c'est une extraction de données, donne-les en format clair (tableau, liste, JSON)
- Si c'est une transformation, fournis directement le résultat
- Si c'est une question, réponds en 2-3 phrases maximum
- En français sauf si on te demande autrement`;

  return prompt;
}
