/**
 * Magic Pointer v1.1 - Background Service Worker
 *
 * Nouveautés v1.1 :
 *  - Context menu pour aperçu de liens
 *  - Endpoint fetchUrl pour récupérer + extraire le contenu d'une page
 *  - Endpoint captureFullWindow déclenché depuis le popup
 *  - Migration : initialise customPrompts au premier lancement
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
// PROMPTS PAR DÉFAUT (utilisés au premier lancement)
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
// INSTALLATION & SETUP
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  // Menu contextuel : sélection / image / page
  chrome.contextMenus.create({
    id: 'magic-pointer-selection',
    title: '✨ Magic Pointer : analyser',
    contexts: ['selection', 'image', 'page']
  });

  // NEW : menu contextuel sur les liens
  chrome.contextMenus.create({
    id: 'magic-pointer-link',
    title: '🔍 Aperçu IA de ce lien',
    contexts: ['link']
  });

  // NEW v1.2 : Zotero - sauvegarder la page courante
  chrome.contextMenus.create({
    id: 'magic-pointer-zotero-page',
    title: '📚 Sauver cette page dans Zotero',
    contexts: ['page', 'selection']
  });

  // NEW v1.2 : Zotero - sauvegarder un lien
  chrome.contextMenus.create({
    id: 'magic-pointer-zotero-link',
    title: '📚 Sauver ce lien dans Zotero',
    contexts: ['link']
  });

  // Valeurs par défaut + migration
  chrome.storage.sync.get(null, (settings) => {
    const updates = {};
    if (!settings.provider) {
      updates.provider = 'mistral';
      updates.model = PROVIDERS.mistral.defaultModel;
      updates.captureSize = 500;
      updates.showOverlay = true;
    }
    // Migration : créer customPrompts s'il n'existe pas
    if (!settings.customPrompts) {
      updates.customPrompts = DEFAULT_PROMPTS;
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.sync.set(updates);
    }
  });
});

// ============================================================
// RACCOURCIS CLAVIER
// ============================================================

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    if (command === 'activate-magic-pointer') {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'activate' });
    } else if (command === 'capture-full-window') {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'captureFullWindow' });
    }
  });
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
  } else if (info.menuItemId === 'magic-pointer-link') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'inspectLink',
      url: info.linkUrl
    });
  } else if (info.menuItemId === 'magic-pointer-zotero-page') {
    // NEW v1.2 : sauver la page courante
    chrome.tabs.sendMessage(tab.id, { action: 'saveCurrentPageToZotero' });
  } else if (info.menuItemId === 'magic-pointer-zotero-link') {
    // NEW v1.2 : sauver un lien (sans le visiter)
    chrome.tabs.sendMessage(tab.id, {
      action: 'saveLinkToZotero',
      url: info.linkUrl
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
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.sync.get(null, (settings) => sendResponse(settings));
    return true;
  }

  // NEW : récupérer + extraire le contenu d'une URL
  if (message.action === 'fetchUrl') {
    fetchAndExtract(message.url)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // NEW v1.2 : Zotero
  if (message.action === 'pingZotero') {
    pingZotero()
      .then(running => sendResponse({ success: true, running }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'saveToZotero') {
    saveToZotero(message.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ============================================================
// NEW : FETCH URL + EXTRACTION DE TEXTE
// ============================================================

async function fetchAndExtract(url) {
  if (!url || !url.startsWith('http')) {
    throw new Error('URL invalide');
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Magic Pointer)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return {
        url,
        title: '(contenu non textuel)',
        description: '',
        content: `Type de contenu : ${contentType}. L'aperçu IA ne fonctionne que sur des pages HTML.`,
        truncated: false
      };
    }

    const html = await response.text();
    return extractPageInfo(url, html);

  } catch (err) {
    // CORS, DNS, timeout, etc.
    throw new Error(`Impossible d'accéder à ${url} : ${err.message}`);
  }
}

/**
 * Extrait titre, description et contenu principal d'un HTML.
 * Heuristique simple inspirée de Readability.
 */
function extractPageInfo(url, html) {
  // Limiter la taille pour éviter d'exploser la mémoire
  const truncated = html.length > 500_000;
  const trimmed = truncated ? html.substring(0, 500_000) : html;

  // Pas de DOMParser dans le service worker → regex simple
  const titleMatch = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim().replace(/\s+/g, ' ')) : '';

  const descMatch = trimmed.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || trimmed.match(/<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const description = descMatch ? decodeEntities(descMatch[1].trim()) : '';

  // Extraire le corps principal : enlever scripts, styles, nav, footer
  let body = trimmed;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  body = body.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  body = body.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  body = body.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  body = body.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  body = body.replace(/<header[\s\S]*?<\/header>/gi, ' ');

  // Essayer de prendre le contenu d'<article> ou <main> si présent
  let mainText = '';
  const articleMatch = body.match(/<article[\s\S]*?<\/article>/i)
    || body.match(/<main[\s\S]*?<\/main>/i)
    || body.match(/<div[^>]*role=["']main["'][\s\S]*?<\/div>/i);
  if (articleMatch) {
    mainText = articleMatch[0];
  } else {
    mainText = body;
  }

  // Enlever toutes les balises HTML restantes
  let text = mainText.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  text = text.replace(/\s+/g, ' ').trim();

  // Limiter à ~4000 caractères (suffisant pour un bon résumé)
  const MAX_CHARS = 4000;
  if (text.length > MAX_CHARS) {
    text = text.substring(0, MAX_CHARS) + '…';
  }

  return {
    url,
    title,
    description,
    content: text,
    truncated
  };
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// ============================================================
// APPEL API - DISPATCHER (inchangé)
// ============================================================

async function handleAICall({ imageBase64, command, contextText, contextHTML, textOnly }) {
  const settings = await chrome.storage.sync.get([
    'provider', 'model', 'mistralApiKey', 'claudeApiKey', 'systemPrompt'
  ]);

  const provider = settings.provider || 'mistral';
  const params = {
    apiKey: provider === 'mistral' ? settings.mistralApiKey : settings.claudeApiKey,
    model: settings.model || PROVIDERS[provider].defaultModel,
    imageBase64,
    command,
    contextText,
    contextHTML,
    systemPrompt: settings.systemPrompt,
    textOnly  // NEW : mode texte uniquement (pour inspecteur de liens)
  };

  if (provider === 'mistral') return await callMistral(params);
  if (provider === 'claude') return await callClaude(params);
  throw new Error(`Provider inconnu : ${provider}`);
}

// ============================================================
// MISTRAL (étendu : support text-only)
// ============================================================

async function callMistral({ apiKey, model, imageBase64, command, contextText, contextHTML, systemPrompt, textOnly }) {
  if (!apiKey) throw new Error('Clé API Mistral manquante. Configurez-la dans les options.');

  const userPrompt = buildPrompt(command, contextText, contextHTML, textOnly);
  const messages = [];

  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

  if (textOnly) {
    // Mode texte uniquement (pour résumer un lien)
    messages.push({ role: 'user', content: userPrompt });
  } else {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: `data:image/png;base64,${imageBase64}` }
      ]
    });
  }

  // Pour text-only, on peut utiliser un modèle moins cher
  const finalModel = textOnly && model.startsWith('pixtral') ? 'mistral-small-latest' : model;

  const response = await fetch(PROVIDERS.mistral.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: finalModel,
      messages,
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
    model: finalModel,
    text: data.choices[0].message.content,
    usage: data.usage
  };
}

// ============================================================
// CLAUDE (étendu : support text-only)
// ============================================================

async function callClaude({ apiKey, model, imageBase64, command, contextText, contextHTML, systemPrompt, textOnly }) {
  if (!apiKey) throw new Error('Clé API Claude manquante. Configurez-la dans les options.');

  const userPrompt = buildPrompt(command, contextText, contextHTML, textOnly);

  const content = textOnly
    ? [{ type: 'text', text: userPrompt }]
    : [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: userPrompt }
      ];

  const body = {
    model,
    max_tokens: 1500,
    messages: [{ role: 'user', content }]
  };
  if (systemPrompt) body.system = systemPrompt;

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
    model,
    text: data.content[0].text,
    usage: data.usage
  };
}

// ============================================================
// CONSTRUCTION DU PROMPT (étendue)
// ============================================================

function buildPrompt(command, contextText, contextHTML, textOnly) {
  if (textOnly) {
    // Mode texte (inspecteur de liens)
    return `${command}

Contenu à analyser :
"""
${contextText}
"""

Réponds en français, de manière concise et directe.`;
  }

  let prompt = `Tu vois une capture d'écran d'une zone autour du curseur souris.\n\n`;

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

// ============================================================
// NEW v1.2 : INTÉGRATION ZOTERO (API LOCALE)
// ============================================================

const ZOTERO_BASES = [
  'http://127.0.0.1:23119',
  'http://localhost:23119'
];

/**
 * Trouve une base Zotero qui répond. Retourne null si aucune.
 * Cache le résultat pendant la session pour éviter les pings répétés.
 */
let _zoteroBase = null;
async function findZoteroBase() {
  if (_zoteroBase) return _zoteroBase;

  for (const base of ZOTERO_BASES) {
    try {
      // Zotero moderne attend POST avec header de version d'API
      let response = await fetch(`${base}/connector/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zotero-Connector-API-Version': '3'
        },
        body: '{}',
        signal: AbortSignal.timeout(2000)
      });

      // Fallback GET pour versions plus anciennes (Zotero 5.x, 6.x early)
      if (response.status === 405 || response.status === 404) {
        response = await fetch(`${base}/connector/ping`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
      }

      if (response.ok) {
        _zoteroBase = base;
        console.log('[Magic Pointer] Zotero détecté sur', base);
        return base;
      }
    } catch (e) {
      // Continue avec la base suivante (connection refused, timeout, etc.)
    }
  }
  return null;
}

async function pingZotero() {
  const base = await findZoteroBase();
  return base !== null;
}

/**
 * Sauve un item dans Zotero via l'API locale.
 *
 * Format attendu (subset du payload Zotero connector) :
 *   {
 *     metadata: {
 *       itemType, title, creators, url, abstractNote,
 *       date, publicationTitle, DOI, ...
 *     },
 *     aiNote: 'texte du résumé Magic Pointer (optionnel)',
 *     pageUrl: 'url de la page d'où vient l'item',
 *     tags: ['tag1', 'tag2']
 *   }
 */
async function saveToZotero({ metadata, aiNote, pageUrl, tags = [] }) {
  const base = await findZoteroBase();
  if (!base) {
    _zoteroBase = null;  // reset au cas où
    throw new Error('Zotero ne répond pas. Vérifiez qu\'il est ouvert sur votre ordinateur.');
  }

  const settings = await chrome.storage.sync.get(['zoteroAutoTag', 'zoteroAutoNote']);

  // Construction de l'item
  const item = {
    itemType: metadata.itemType || 'webpage',
    title: metadata.title || 'Sans titre',
    url: metadata.url || pageUrl || '',
    accessDate: new Date().toISOString().substring(0, 10)
  };

  // Champs optionnels
  if (metadata.creators?.length) item.creators = metadata.creators;
  if (metadata.date) item.date = metadata.date;
  if (metadata.DOI) item.DOI = metadata.DOI;
  if (metadata.ISSN) item.ISSN = metadata.ISSN;
  if (metadata.ISBN) item.ISBN = metadata.ISBN;
  if (metadata.publicationTitle) item.publicationTitle = metadata.publicationTitle;
  if (metadata.volume) item.volume = metadata.volume;
  if (metadata.issue) item.issue = metadata.issue;
  if (metadata.pages) item.pages = metadata.pages;
  if (metadata.publisher) item.publisher = metadata.publisher;
  if (metadata.language) item.language = metadata.language;

  // Abstract : combiner métadonnée + note IA
  const abstractParts = [];
  if (metadata.abstractNote) abstractParts.push(metadata.abstractNote);
  if (aiNote && settings.zoteroAutoNote !== false) {
    // Préfixer la note IA pour qu'elle soit identifiable
    abstractParts.push(`\n\n--- Note Magic Pointer ---\n${aiNote}`);
  }
  if (abstractParts.length) item.abstractNote = abstractParts.join('\n');

  // Tags : combiner tags fournis + auto-tag
  const allTags = [...tags];
  if (settings.zoteroAutoTag) {
    const autoTags = settings.zoteroAutoTag.split(',').map(t => t.trim()).filter(Boolean);
    allTags.push(...autoTags);
  }
  if (allTags.length) {
    item.tags = allTags.map(t => ({ tag: t }));
  }

  // Payload final
  const payload = {
    items: [item],
    uri: pageUrl || item.url || ''
  };

  const response = await fetch(`${base}/connector/saveItems`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Zotero-Connector-API-Version': '3'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {}
    throw new Error(`Zotero a refusé (HTTP ${response.status})${detail ? ' : ' + detail.substring(0, 200) : ''}`);
  }

  // Tenter de parser la réponse pour avoir l'ID de l'item créé
  let responseData = null;
  try {
    responseData = await response.json();
  } catch {}

  return {
    ok: true,
    itemType: item.itemType,
    title: item.title,
    response: responseData
  };
}
