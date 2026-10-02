# Site « Vulnérabilité Rhône » - version de départ

Petit site statique (HTML + CSS + JavaScript, sans installation) en 3 pages :

| Page | Fichier | Contenu |
|---|---|---|
| Accueil | `index.html` + `js/accueil.js` | titre, recherche d'IRIS / de commune, chiffres clés, les 3 échelles, les 5 indicateurs, la méthode |
| Classification | `classification.html` + `js/classification.js` | onglets Département / Métropole / Hors Métropole : classes, profils, z-scores, croisement avec le département, ACP, silhouettes |
| Carte | `carte.html` + `js/carte.js` | carte Leaflet : choix de la classification, niveaux cochables, fiche de l'IRIS, QPV, limites, fonds de carte |

Fichiers communs : `css/style.css` (apparence), `js/commun.js` (chargement des données, formats, recherche),
`lib/leaflet/` (Leaflet 1.9.4, licence BSD-2, inclus pour marcher sans CDN).

## Ouvrir le site dans VS Code

Les pages lisent les fichiers `data/*.json` : **un double-clic sur `index.html` ne suffit pas**
(le navigateur bloque la lecture des fichiers locaux ; un bandeau rouge l'indique).

1. VS Code → *Fichier > Ouvrir le dossier…* → choisir le dossier `site`.
2. Installer l'extension **Live Server** (Ritwick Dey) si elle n'y est pas.
3. Clic droit sur `index.html` → **Open with Live Server**. Le site s'ouvre dans le navigateur et se
   recharge à chaque enregistrement.

## Où modifier quoi

- **Couleurs, polices, arrondis** : variables en haut de `css/style.css` (`:root { ... }`).
- **Textes des pages** : directement dans les fichiers `.html`.
- **Couleurs et libellés des niveaux** : ils viennent de `data/meta.json` (produit par R). Pour les changer
  durablement, modifier `palette_risque()` / `etiquettes_vulnerabilite()` dans `R/00_setup.R` et relancer la chaîne.
- **Fonds de carte** : objet `FONDS` au début de `js/carte.js`.

## Mettre à jour les données

Ne pas modifier `data/` à la main : relancer `LANCER_TOUT.R` dans RStudio. Le script `R/08_export_json.R`
réécrit `site/data/` (et seulement ce dossier : les pages ne sont jamais touchées).
La description de chaque fichier et de chaque champ est dans `data/README.md`.

## Adresses utiles (liens directs)

- `carte.html?territoire=metropole` : carte avec la classification de la Métropole
- `carte.html?iris=693830105` : carte centrée sur un IRIS (fiche ouverte)
- `carte.html?commune=69266` : carte centrée sur une commune
- `carte.html?territoire=hors_metropole&niveau=5` : un seul niveau affiché
- `classification.html#metropole` : onglet Métropole

## Mettre le site en ligne (plus tard)

Le dossier `site` peut être déposé tel quel sur n'importe quel hébergement statique
(GitHub Pages, Netlify, serveur de l'établissement…). Aucune base de données n'est nécessaire.
