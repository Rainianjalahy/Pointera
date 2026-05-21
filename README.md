# ✨ Magic Pointer

Extension Chrome qui transforme votre curseur en assistant IA. Compatible **Mistral AI** (recommandé, RGPD) et **Anthropic Claude**.

> Pointez. Recadrez. Demandez. Agissez.

---

## 🆕 Nouveau : Mode sélection interactive

Quand vous appuyez sur **`Alt+M`**, vous entrez en mode sélection, similaire à un éditeur photo ou un outil de capture d'écran :

- 🎯 **Zone redimensionnable** : 8 poignées (4 coins + 4 milieux des bords)
- 🖱️ **Déplaçable** : glissez la zone n'importe où sur la page
- ✏️ **Re-tracer** : glissez dans la zone sombre pour dessiner une nouvelle zone
- ⌨️ **Ajustement fin au clavier** : flèches pour déplacer, `Alt`+flèches pour redimensionner
- 📏 **Dimensions live** : affichage en temps réel des dimensions
- 🎨 **Règle des tiers** : grille de composition pour aligner visuellement
- 🔄 **Re-sélectionner** : bouton dans le panneau pour ajuster après capture
- Connection avec Zotero

---

## 📋 Fonctionnalités

- 🎯 Sélection visuelle précise avant capture (style Lightroom/Snipping Tool)
- 🤖 **Multi-provider** : Mistral (🇫🇷, RGPD) ou Claude (🇺🇸)
- ⌨️ Raccourci global : `Alt+M`
- 📋 Actions rapides : résumer, extraire, traduire, corriger, expliquer
- 📥 Insertion directe dans le champ pointé
- 🎨 UI minimaliste, dark mode, animations fluides
- 🔒 Clés API stockées localement
- 🌐 Interface en français, prompts personnalisables

---

## 🚀 Installation

### 1. Décompresser le ZIP
```
magic-pointer-extension.zip → décompressez dans un dossier
```

### 2. Charger l'extension dans Chrome
1. Ouvrez `chrome://extensions/`
2. Activez le **mode développeur** (toggle en haut à droite)
3. Cliquez **« Charger l'extension non empaquetée »**
4. Sélectionnez le dossier `magic-pointer/`

### 3. Configurer une clé API

#### Mistral AI (recommandé)
1. Créez une clé sur [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys/)
2. Icône Magic Pointer → **⚙️ Configuration**
3. Collez votre clé → **🔌 Tester** → **💾 Enregistrer**

---

## 💡 Utilisation détaillée

### Mode sélection (depuis Alt+M)

```
┌─────────────────────────────────────────────────────┐
│  ███████████████████████████████████████████████   │
│  ███   ┌──┐──────────────────────────┌──┐  █████   │
│  ███   │NW│ ZONE SÉLECTIONNÉE         │NE│  █████   │
│  ███   └──┘ (déplacez en glissant)    └──┘  █████   │
│  ███       │                              │  █████   │
│  ███       │     280 × 180                │  █████   │
│  ███       │                              │  █████   │
│  ███   ┌──┐                              ┌──┐  █████│
│  ███   │SW│                              │SE│  █████│
│  ███   └──┘──────────────────────────────└──┘  █████│
│  ███████████████████████████████████████████████   │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │ ↵ capturer · Esc annuler · ↑↓←→ bouger  │       │
│  │      [ Annuler ]  [ ✓ Capturer ]        │       │
│  └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

### Raccourcis du mode sélection

| Touche | Action |
|--------|--------|
| `↵` Entrée | Capturer la zone sélectionnée |
| `Esc` | Annuler |
| `↑↓←→` | Déplacer la zone (1px) |
| `Shift + flèches` | Déplacer (10px) |
| `Alt + flèches` | Redimensionner (1px) |
| `Alt + Shift + flèches` | Redimensionner (10px) |

### Interactions souris

| Action | Résultat |
|--------|----------|
| Glisser le centre de la zone | Déplace la zone |
| Glisser une poignée | Redimensionne |
| Glisser dans la zone sombre | Trace une nouvelle zone |
| Clic « Capturer cette zone » | Lance l'analyse IA |

### Re-sélectionner après capture

Si la zone capturée n'était pas optimale, cliquez **« ⤡ Re-sélectionner »** dans le panneau de résultat. Votre commande tapée est conservée.

---

## 🎯 Workflow type pour la recherche

### Exemple 1 : Extraire une citation depuis un PDF en ligne

1. Ouvrez le PDF dans Chrome
2. `Alt+M` → la zone apparaît
3. Redimensionnez précisément autour du paragraphe pertinent
4. `↵` → capture
5. Tapez : *« Extrais cette citation au format APA 7e avec numéro de page »*
6. Cliquez **📋 Copier** → collez dans Zotero/votre thèse

### Exemple 2 : Analyser un tableau de données

1. Sur la page d'un article scientifique
2. `Alt+M` → ajustez sur le tableau uniquement
3. Tapez : *« Convertis ce tableau en JSON »*
4. Résultat structuré → import dans Excel/R/Python

### Exemple 3 : Comparaison multi-zones

1. Capturez zone A → notez le résultat (📋 Copier)
2. `Alt+M` → capturez zone B → comparez les deux résultats
3. Ou utilisez **⤡ Re-sélectionner** pour re-cadrer

---

## ⚙️ Configuration avancée

### Prompt système personnalisé

Dans **Options → Préférences → Prompt système**, définissez un contexte permanent. Exemple pour la recherche :

```
Tu es un assistant pour la rédaction d'une thèse de master en
entrepreneuriat marginalisé. Réponds en français académique
impersonnel et hedgé (semble, pourrait, paraît). Préserve les
citations. Conventions francophones : figures captions, élaboration
personnelle, numérotation des sections.
```

### Taille initiale de la zone

La taille de capture par défaut peut être ajustée dans les options (200-900px). Cette valeur est utilisée à l'apparition de la zone, mais reste ajustable manuellement.

---

## 🏗️ Architecture

```
magic-pointer/
├── manifest.json          # Manifest V3
├── background.js          # Service worker (API calls)
├── content.js             # Sélection interactive + panneau
├── content.css            # Styles UI flottante
├── popup.html/.css/.js    # Popup de l'extension
├── options.html/.css/.js  # Page de configuration
├── lib/
│   └── html2canvas.min.js # Capture DOM → image
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### Flux de données

```
Alt+M
  ↓
[Mode SÉLECTION] : afficher zone interactive
  ↓ (Enter / Capturer)
[Capture] : html2canvas sur les coordonnées choisies
  ↓
[Mode PANEL] : panneau avec preview + input
  ↓ (saisie commande)
Background → Mistral/Claude API
  ↓
Affichage résultat (Copier / Insérer / Re-sélectionner)
```

---

## 💰 Coûts estimés

**Mistral Pixtral** (recommandé) : ~0.15 $/M tokens
- ~500-2000 tokens par action → ~0.0001-0.0003 $
- **1000 actions/mois ≈ 0.30 $**

**Claude 3.5 Sonnet** : plus précis, ~3 $/1000 actions

---

## 🔒 Sécurité

- Clés API stockées dans `chrome.storage.sync` (chiffré, synchronisé)
- Données envoyées **uniquement** aux API que vous configurez
- Aucune télémétrie, aucun serveur tiers
- Code open source, inspectable

---

## 🐛 Dépannage

| Problème | Solution |
|----------|----------|
| « Clé API manquante » | Options → entrer la clé → Enregistrer |
| Erreur 401/403 | Clé invalide, regénérez sur la console du provider |
| Erreur 429 | Quota dépassé, attendez ou ajoutez du crédit |
| Capture vide | html2canvas ne supporte pas tout : essayez sur une page publique |
| `Alt+M` ne fonctionne pas | `chrome://extensions/shortcuts` pour reconfigurer |
| Mode sélection figé | `Esc` puis `Alt+M` à nouveau |

---

## 📜 Licence

MIT — libre d'utilisation, modification, distribution.

## 🙏 Crédits

- Inspiré par [Google DeepMind Magic Pointer](https://9to5google.com/2026/05/12/deepmind-googlebook-magic-pointer/)
- [html2canvas](https://html2canvas.hertzen.com/) — capture DOM
- [Mistral AI](https://mistral.ai/) — Pixtral
- [Anthropic](https://anthropic.com/) — Claude

---

**Made with ✨ for thinkers, researchers, and curious minds.**
