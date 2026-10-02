/* =============================================================================
   accueil.js - page d'accueil (index.html)
   ============================================================================= */
(function () {
  "use strict";
  const S = window.Site;

  /* Carte du héros : IRIS colorés selon le niveau départemental (SVG, sans Leaflet) */
  function dessinerMiniCarte(geo, meta) {
    const conteneur = document.getElementById("mini-carte");
    const niv = S.niveauxParCode(meta);
    const W = 300, H = 400;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const kx = Math.cos(45.9 * Math.PI / 180);          // longitude corrigée à la latitude du Rhône
    function anneaux(g) { return g.type === "Polygon" ? g.coordinates : [].concat.apply([], g.coordinates); }
    geo.features.forEach(function (f) {
      anneaux(f.geometry).forEach(function (a) {
        a.forEach(function (p) {
          const x = p[0] * kx, y = -p[1];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        });
      });
    });
    const e = Math.min((W - 8) / (x1 - x0), (H - 8) / (y1 - y0));
    const dx = (W - (x1 - x0) * e) / 2, dy = (H - (y1 - y0) * e) / 2;
    const chemins = geo.features.map(function (f) {
      const d = anneaux(f.geometry).map(function (a) {
        let px = null, py = null;
        return a.reduce(function (s, p) {
          const x = ((p[0] * kx - x0) * e + dx).toFixed(1), y = ((-p[1] - y0) * e + dy).toFixed(1);
          if (x === px && y === py) return s;             // points confondus à cette échelle
          px = x; py = y;
          return s + (s ? "L" : "M") + x + " " + y;
        }, "") + "Z";
      }).join("");
      const n = niv[f.properties.niveau_departement || 0] || niv[0];
      return '<path d="' + d + '" fill="' + n.couleur + '"><title>' + S.echapper(f.properties.nom_iris) +
        " (" + S.echapper(f.properties.commune) + ") - " + S.echapper(n.libelle_long) + "</title></path>";
    }).join("");
    conteneur.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Carte des niveaux de vulnérabilité des IRIS du Rhône">' +
      chemins + "</svg>";
  }

  S.chargerTout(["meta", "classifications", "iris"]).then(function (d) {
    const meta = d.meta, cc = meta.chiffres_cles;

    // ---- Ligne d'introduction + chiffres clés ----
    document.getElementById("pastille-info").textContent =
      "Rhône (69) · " + S.nombre(cc.n_iris) + " IRIS · recensement 2022, Filosofi 2021";
    document.getElementById("legende-mini").innerHTML = S.legendeNiveaux(meta);

    const chiffres = [
      { v: S.population(cc.population_totale), l: "habitants au recensement 2022" },
      { v: S.nombre(cc.n_iris), l: "IRIS dans le département, dont " + S.nombre(cc.n_iris_classes) + " classés" },
      { v: cc.n_variables, l: "indicateurs socio-économiques" },
      { v: cc.n_classes, l: "niveaux de vulnérabilité, sur " + cc.n_territoires + " échelles" }
    ];
    document.getElementById("chiffres").innerHTML = chiffres.map(function (t) {
      return '<div><dt class="num">' + S.echapper(t.v) + "</dt><dd>" + S.echapper(t.l) + "</dd></div>";
    }).join("");

    // ---- Cartes des 3 territoires ----
    const conteneur = document.getElementById("territoires");
    meta.territoires.forEach(function (t) {
      const c = d.classifications[t.id];
      const carte = document.createElement("article");
      carte.className = "carte-info";
      carte.innerHTML =
        "<h3>" + S.echapper(t.titre) + "</h3>" +
        '<p class="discret num" style="margin:0">' + S.nombre(t.n_iris_classes) + " IRIS classés · " +
        S.population(t.population_classee) + " habitants</p>" +
        '<div class="barre"></div>' + S.legendeNiveaux(meta) +
        '<p class="tres-discret num" style="margin:12px 0 14px">Silhouette ' + S.nombre(t.silhouette, 2) +
        " · " + S.nombre(c.acp.inertie_axes_retenus_pct, 1) + " % d'inertie sur " + c.acp.n_axes_retenus + " axes</p>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="bouton" href="carte.html?territoire=' + t.id + '">Carte</a>' +
        '<a class="bouton secondaire" href="classification.html#' + t.id + '">Détails</a></div>';
      conteneur.appendChild(carte);
      S.barreRepartition(carte.querySelector(".barre"), t.effectifs, meta);
    });

    // ---- Indicateurs : photo en tête de carte ----
    const PHOTOS = {
      revenu_med: "image/REVENU_MED.jpg", pct_sansdip: "image/pct_sansdip.jpg",
      pct_ouvriers: "image/pct_ouvriers.jpg", pct_immigres: "image/pct_immigres.jpg",
      pct_surocc: "image/pct_surocc.jpg"
    };
    document.getElementById("indicateurs").innerHTML = meta.variables.map(function (v) {
      return '<article class="indicateur">' +
        (PHOTOS[v.id] ? '<img src="' + PHOTOS[v.id] + '" alt="" loading="lazy">' : "") +
        '<div class="indicateur-texte"><h3>' + S.echapper(v.libelle) + ' <span class="unite">' + S.echapper(v.unite) + "</span></h3>" +
        '<p class="definition">' + S.echapper(v.libelle_long) + "</p>" +
        '<p class="sens">' + S.echapper(v.sens) + "</p>" +
        '<p class="source">' + S.echapper(v.source) + "</p></div></article>";
    }).join("");

    // ---- Méthode : "Titre : détail" ou "Titre (détail)" -> titre en gras + détail ----
    document.getElementById("etapes").innerHTML = meta.methode.etapes.map(function (e) {
      const m = e.match(/^(.+?)\s*(?::\s*|\((?=.*\)$))(.+?)\)?$/);
      return m ? "<li><strong>" + S.echapper(m[1]) + '</strong><span>' + S.echapper(m[2]) + "</span></li>"
               : "<li><strong>" + S.echapper(e) + "</strong></li>";
    }).join("");

    // ---- Sources ----
    document.getElementById("sources").innerHTML = "Sources : " +
      meta.sources.map(function (s) { return S.echapper(s.libelle); }).join(" · ");

    // ---- Recherche ----
    let choix = null;
    const champ = document.getElementById("recherche");
    S.recherche(champ, document.getElementById("resultats"), d.iris, function (e) {
      choix = e; aller();
    });
    function aller() {
      if (!choix) { champ.focus(); return; }
      window.location.href = "carte.html?" + (choix.type === "commune" ? "commune=" : "iris=") + encodeURIComponent(choix.code);
    }
    document.getElementById("bouton-recherche").addEventListener("click", aller);

    // ---- Mini-carte (fichier lourd : chargée en dernier, sans bloquer la page) ----
    S.charger("irisGeo", true).then(function (geo) {
      if (geo) dessinerMiniCarte(geo, meta);
    }).catch(function () { /* la mini-carte reste vide, le reste de la page fonctionne */ });
  }).catch(function () { /* bandeau d'erreur affiché par commun.js */ });
})();
