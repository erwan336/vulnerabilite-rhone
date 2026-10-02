# Données du site - typologie de vulnérabilité socio-économique (Rhône, IRIS)

Généré automatiquement par `R/08_export_json.R` le 2026-09-25. Ne pas modifier à la main : relancer la chaîne R (LANCER_TOUT.R).

## Fichiers

| Fichier | Contenu |
|---|---|
| `meta.json` | projet, sources, méthode, variables (définitions), niveaux (libellés + couleurs), territoires, chiffres clés |
| `classifications.json` | un objet par territoire (`departement`, `metropole`, `hors_metropole`) : ACP, CAH, classes, croisement avec le département |
| `iris.json` | tableau des IRIS (une ligne par IRIS, sans géométrie) : recherche, tableaux |
| `iris.geojson` | mêmes champs + contours (WGS84, 6 décimales) : carte |
| `limites.geojson` | contours du département, de la Métropole et du Rhône hors Métropole |
| `qpv.geojson` | quartiers prioritaires (si le fichier QPV est présent) |

## Codes de niveau (`niveau_departement`, `niveau_metropole`, `niveau_hors_metropole`)

| Code | Signification |
|---|---|
| 1 | Vulnérabilité très faible (profil : Très favorisé) - couleur #1B5E20 |
| 2 | Vulnérabilité faible (profil : Favorisé) - couleur #66BB6A |
| 3 | Vulnérabilité modérée (profil : Intermédiaire) - couleur #FFD54F |
| 4 | Vulnérabilité élevée (profil : Défavorisé) - couleur #FF8A65 |
| 5 | Vulnérabilité très élevée (profil : Très défavorisé) - couleur #D32F2F |
| 0 | IRIS du territoire non classé : Sans information (couleur #BDBDBD) |
| null | IRIS hors du territoire de cette classification (ne pas l'afficher) |

Les libellés et couleurs sont dans `meta.json > niveaux` : chercher le niveau par son `code`.

**Attention** : les niveaux sont RELATIFS au territoire (3 classifications indépendantes).
Un IRIS de niveau 4 dans la Métropole n'est pas comparable à un IRIS de niveau 4 hors Métropole.

## Champs de `iris.json` / `iris.geojson` (properties)

| Champ | Description |
|---|---|
| `code_iris` | code INSEE de l'IRIS (9 caractères) |
| `nom_iris` | nom de l'IRIS (IGN) |
| `commune` | commune ou arrondissement de Lyon |
| `code_commune` | code INSEE de la commune / de l'arrondissement |
| `zone` | 69M = Métropole de Lyon, 69D = Rhône hors Métropole |
| `territoire` | metropole ou hors_metropole (territoire propre de l'IRIS) |
| `type_iris` | H habitat, A activité, D divers, Z commune non découpée |
| `population` | population 2022 (RP, arrondie) |
| `revenu_med` | Revenu disponible médian par unité de consommation (€) |
| `pct_sansdip` | Part des 15 ans ou plus non scolarisés sans diplôme ou au plus BEPC / brevet (%) |
| `pct_ouvriers` | Part des ouvriers parmi les 15 ans ou plus (%) |
| `pct_immigres` | Part des personnes immigrées (%) |
| `pct_surocc` | Part des résidences principales suroccupées (modérée + accentuée) (%) |
| `revenu_source` | iris = revenu de l'IRIS ; commune = médiane de la commune (IRIS non diffusé) |
| `niveau_departement` | code de niveau dans la classification Département du Rhône (69) |
| `niveau_metropole` | code de niveau dans la classification Métropole de Lyon |
| `niveau_hors_metropole` | code de niveau dans la classification Rhône hors Métropole |
| `classe` | true si l'IRIS est classé dans le département entier |
| `motif_non_classe` | raison de l'absence de classement (sinon null) |
| `valeur_imputee` | true si une valeur a été imputée (méthode 'imputation' seulement) |

## Structure de `classifications.json`

```
{ "departement": {
    "titre", "n_iris": {total, classes, sans_information}, "population_classee",
    "acp": {n_axes_retenus, inertie_axes_retenus_pct, valeurs_propres[], variables[] (contributions, corrélations)},
    "cah": {K, silhouette_moyenne, comparaison_K[]},
    "classes": [ {code, niveau, profil, nom, couleur, n_iris, population, medianes{}, moyennes{},
                  z_scores{}, stabilite{jaccard, silhouette, qualification}, v_tests[], communes_principales[]} ],
    "ensemble": {medianes{}, moyennes{}, ecarts_types{}},
    "croisement_departement": null (ou, pour metropole / hors_metropole : cellules[] niveau département x niveau territoire)
  }, "metropole": {...}, "hors_metropole": {...} }
```

`z_scores` = (moyenne de la classe - moyenne du territoire) / écart-type du territoire.

## Lire les fichiers depuis une page web

```js
const meta  = await fetch('data/meta.json').then(r => r.json());
const iris  = await fetch('data/iris.geojson').then(r => r.json());
const niv   = Object.fromEntries(meta.niveaux.map(n => [n.code, n]));
// couleur d'un IRIS dans la classification Métropole :
// const c = feature.properties.niveau_metropole; if (c !== null) niv[c].couleur
```

`fetch()` ne fonctionne pas si la page est ouverte en double-cliquant (file://) :
ouvrir le site avec un petit serveur local (extension VS Code *Live Server*).
