/* =============================================================================
   carte.js - page carte.html (Leaflet ; vue 3D optionnelle dans carte3d.js)
   Paramètres d'adresse possibles :
     carte.html?territoire=metropole     classification affichée au départ
     carte.html?iris=693830105           IRIS sélectionné et zoomé
     carte.html?commune=69266            zoom sur une commune
     carte.html?territoire=metropole&niveau=5   un seul niveau affiché
     carte.html?fond=3d&commune=69381    vue 3D (bâtiments) sur une commune
   ============================================================================= */
(function () {
  "use strict";
  const S = window.Site;

  /* ---------- Fonds de carte (sans clé d'API) ---------- */
  const IGN = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal" +
              "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";
  // CARTO renvoie désormais des tuiles « API KEY REQUIRED » : fonds gris Esri (sans clé).
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
  const fondEsri = nom => L.tileLayer(ESRI + nom + "/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 19, maxNativeZoom: 16, attribution: "&copy; Esri, HERE, Garmin, &copy; OpenStreetMap" });
  const FONDS = {
    sombre: fondEsri("World_Dark_Gray_Base"),
    clair: fondEsri("World_Light_Gray_Base"),
    ign: L.tileLayer(IGN + "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png",
      { maxZoom: 19, attribution: "&copy; IGN - Géoplateforme" }),
    photo: L.tileLayer(IGN + "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&FORMAT=image/jpeg",
      { maxZoom: 19, attribution: "&copy; IGN - Géoplateforme" }),
    aucun: null
  };
  const FONDS_CLAIRS = ["clair", "ign", "photo"];

  /* ---------- Carte ---------- */
  // Inertie adoucie : la carte s'arrête vite après un glisser au lieu de continuer sur sa lancée
  const map = L.map("carte", {
    zoomSnap: 0.5, inertiaDeceleration: 6000, inertiaMaxSpeed: 1200, easeLinearity: 0.4
  }).setView([45.87, 4.64], 9);
  window.carteLeaflet = map;   // accessible dans la console du navigateur (mise au point)
  map.createPane("qpv").style.zIndex = 440;
  const paneLimites = map.createPane("limites");
  paneLimites.style.zIndex = 450;
  paneLimites.style.pointerEvents = "none";
  L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);

  /* Une seule infobulle pour toute la carte (IRIS, QPV, bulles, lieux) : quand la souris passe vite
     d'une forme à l'autre, l'ancienne est remplacée au lieu de rester affichée par-dessus. */
  const infobulle = L.tooltip({ className: "etiquette-iris", direction: "top", opacity: 1 });
  let sourceInfobulle = null;
  function fermerInfobulle() { sourceInfobulle = null; map.closeTooltip(infobulle); }
  /** contenu : texte ou fonction ; decalage : [x, y] (par défaut au-dessus du curseur) ; fixe : ancrée sur le symbole. */
  function infobulleSur(couche, contenu, decalage, fixe) {
    couche.on("mouseover mousemove", function (e) {
      if (map.dragging.moving() || (e.originalEvent && e.originalEvent.buttons)) return;
      if (sourceInfobulle !== couche) {
        sourceInfobulle = couche;
        infobulle.options.offset = decalage || [0, -8];
        infobulle.setContent(typeof contenu === "function" ? contenu() : contenu);
      }
      infobulle.setLatLng(fixe && couche.getLatLng ? couche.getLatLng() : e.latlng);
      if (!map.hasLayer(infobulle)) map.openTooltip(infobulle);
    });
    couche.on("mouseout remove", function () { if (sourceInfobulle === couche) fermerInfobulle(); });
  }
  map.on("mouseout dragstart zoomstart", fermerInfobulle);

  let fondActif = null, nomFond = "sombre", mode3D = false;
  function changerFond(nom) {
    if (nom === "3d") { activer3D(); return; }
    if (mode3D) desactiver3D();
    if (fondActif) map.removeLayer(fondActif);
    nomFond = nom;
    fondActif = FONDS[nom];
    if (fondActif) fondActif.addTo(map);
    document.getElementById("carte").style.background = FONDS_CLAIRS.indexOf(nom) >= 0 ? "#F1F5F9" : "#0B1120";
    styliserLimites();
    if (groupeIris) groupeIris.eachLayer(function (l) { l.setStyle(styleIris(l.feature)); });
  }

  /* ---------- État ---------- */
  let DONNEES, META, NIV, CLASSIF, TERR = "departement", groupeIris = null, limites = null, qpv = null, selection = null;
  const calques = {};          // code_iris -> calque Leaflet
  let survole = null;          // IRIS sous la souris
  const visibles = {};         // code de niveau -> true/false
  const stats = {};            // territoire -> variable -> {tri, min, max, med}

  S.chargerTout(["meta", "classifications", "iris", "irisGeo", "limites", "qpv", "qpv2024", "actions"],
                ["qpv", "qpv2024", "actions"]).then(function (d) {
    DONNEES = d;
    META = d.meta; NIV = S.niveauxParCode(META); CLASSIF = d.classifications;
    META.niveaux.forEach(function (n) { visibles[n.code] = true; });

    // Paramètres d'adresse
    const pTerr = S.parametre("territoire");
    if (pTerr && META.territoires.some(function (t) { return t.id === pTerr; })) TERR = pTerr;
    const pNiv = S.parametre("niveau");
    if (pNiv !== null && NIV[pNiv]) META.niveaux.forEach(function (n) { visibles[n.code] = String(n.code) === pNiv; });

    calculerStats(d.iris);
    construireChoixTerritoire();
    creerLegende();

    // IRIS
    groupeIris = L.geoJSON(d.irisGeo, {
      style: styleIris,
      onEachFeature: function (f, l) {
        calques[f.properties.code_iris] = l;
        infobulleSur(l, function () { return etiquette(f.properties); });
        // Pas de surbrillance ni de bringToFront pendant un glisser : déplacer le <path> sous la souris
        // fait perdre le relâchement du bouton, et la carte continue de suivre le curseur.
        l.on("mouseover", function (e) {
          // Une seule surbrillance à la fois (bringToFront peut faire perdre un mouseout)
          if (survole && survole !== l) survole.setStyle(styleIris(survole.feature));
          survole = l;
          if (map.dragging.moving() || (e.originalEvent && e.originalEvent.buttons)) return;
          if (l !== selection) l.setStyle({ weight: 2, color: "#FFFFFF" });
          l.bringToFront();
        });
        l.on("mouseout", function (e) {
          l.setStyle(styleIris(f));
          if (selection && !(e.originalEvent && e.originalEvent.buttons)) selection.bringToFront();
        });
        l.on("click", function () { selectionner(f.properties.code_iris, false); });
      }
    }).addTo(map);

    // Limites
    limites = L.geoJSON(d.limites, { pane: "limites", interactive: false, style: styleLimite });
    limites.addTo(map);
    document.querySelectorAll("[data-limite]").forEach(function (cb) {
      cb.addEventListener("change", styliserLimites);
    });

    // QPV 2024 (ANCT) sur tout le département : rose, en tirets pour rester lisible
    // là où ils se superposent aux QPV de la Métropole (cyan, trait plein).
    if (d.qpv2024) {
      const qpv2024 = L.geoJSON(d.qpv2024, {
        pane: "qpv",
        style: { color: "#F472B6", weight: 2.5, dashArray: "6 4", fill: false, opacity: 1 },
        onEachFeature: function (f, l) {
          infobulleSur(l, "QPV 2024 : " + S.echapper(f.properties.nom) + "<br>" + S.echapper(f.properties.commune));
        }
      }).addTo(map);
      document.getElementById("couche-qpv2024").addEventListener("change", function (e) {
        if (e.target.checked) qpv2024.addTo(map); else map.removeLayer(qpv2024);
      });
    } else {
      document.getElementById("option-qpv2024").hidden = true;
    }

    // QPV
    if (d.qpv) {
      qpv = L.geoJSON(d.qpv, {
        pane: "qpv",
        style: { color: "#38BDF8", weight: 2, fill: false, opacity: 0.95 },
        onEachFeature: function (f, l) {
          infobulleSur(l, "QPV : " + S.echapper(f.properties.nom));
        }
      }).addTo(map);
      document.getElementById("couche-qpv").addEventListener("change", function (e) {
        if (e.target.checked) qpv.addTo(map); else map.removeLayer(qpv);
      });
    } else {
      document.getElementById("option-qpv").hidden = true;
    }

    if (d.actions) initialiserActions(d.actions);

    document.getElementById("fond").addEventListener("change", function (e) { changerFond(e.target.value); });
    changerFond("sombre");
    appliquer();

    // Recherche
    S.recherche(document.getElementById("recherche"), document.getElementById("resultats"), d.iris, function (e) {
      if (e.type === "iris") selectionner(e.code, true); else zoomCommune(e.code);
    });

    // Position de départ
    const pIris = S.parametre("iris"), pCom = S.parametre("commune");
    if (pIris && calques[pIris]) selectionner(pIris, true);
    else if (pCom) zoomCommune(pCom);
    else cadrerTerritoire();

    // Fond demandé dans l'adresse (ex. carte.html?fond=3d&commune=69123)
    const pFond = S.parametre("fond");
    if (pFond && document.querySelector('#fond option[value="' + pFond + '"]')) {
      document.getElementById("fond").value = pFond;
      changerFond(pFond);
    }

    // Panneau sur mobile
    document.getElementById("bouton-panneau").addEventListener("click", function () {
      basculerPanneau(!document.getElementById("panneau").classList.contains("ouvert"));
    });
  }).catch(function () {});

  /* ---------- Actions de prévention 2022-2024 (data/actions.geojson) ----------
     Sémiologie propre aux actions (distincte des aplats d'IRIS et des contours QPV/limites) :
     une bulle « verre » par IRIS, de surface proportionnelle au nombre d'actions, posée au centre
     des lieux d'action. De près, les bulles laissent place aux lieux eux-mêmes, colorés par type.
     Rien n'est affiché au départ. */
  const COULEURS_TYPES = {
    "Hébergement et accueil": "#3B82F6", "Associatif et communautaire": "#8B5CF6", "Festif": "#EC4899",
    "Soins et santé": "#14B8A6", "Commerce et vie quotidienne": "#F59E0B", "Spécifique": "#94A3B8"
  };
  const SEUIL_LIEUX = 14.5;    // zoom à partir duquel les lieux remplacent les bulles
  let ACTIONS = null, anneeActions = "2024", coucheBulles = null, coucheLieux = null, groupesActions = [];
  const actionsParIris = {};   // code IRIS -> { "2022": n, "2023": n, "2024": n }

  /** Rayon (px) d'une bulle : surface proportionnelle au nombre d'actions, atténuée quand on dézoome. */
  function rayonBulle(n, zoom) {
    const k = zoom == null ? 1 : Math.max(0.55, Math.min(1.15, 0.55 + (zoom - 10) * 0.15));
    return (2.5 + 3.4 * Math.sqrt(n)) * k;
  }

  function initialiserActions(geo) {
    ACTIONS = geo.features;
    ACTIONS.forEach(function (f) {
      const p = f.properties;
      const a = actionsParIris[p.code_iris] = actionsParIris[p.code_iris] || {};
      a[p.annee] = (a[p.annee] || 0) + 1;
    });
    map.createPane("actions").style.zIndex = 610;            // au-dessus des IRIS, des QPV et des limites
    document.getElementById("groupe-actions").hidden = false;
    document.getElementById("legende-types").innerHTML = Object.keys(COULEURS_TYPES).map(function (t) {
      return '<span><i style="background:' + COULEURS_TYPES[t] + '"></i>' + S.echapper(t) + "</span>";
    }).join("");
    document.querySelectorAll("#actions-annee button").forEach(function (b) {
      b.addEventListener("click", function () { anneeActions = b.dataset.annee; dessinerActions(); });
    });
    document.getElementById("actions-carte").addEventListener("change", dessinerActions);
    map.on("zoomend", afficherSelonZoom);
    dessinerActions();
  }

  /** De loin : bulles par IRIS ; de près : lieux par type. */
  function afficherSelonZoom() {
    if (!ACTIONS) return;
    const actif = document.getElementById("actions-carte").checked;
    const proche = map.getZoom() >= SEUIL_LIEUX;
    if (coucheBulles) map.removeLayer(coucheBulles);
    coucheBulles = null;
    if (actif && !proche) coucheBulles = construireBulles().addTo(map);
    if (coucheLieux) { if (actif && proche) coucheLieux.addTo(map); else map.removeLayer(coucheLieux); }
    document.getElementById("bloc-actions").hidden = !actif;
    document.getElementById("legende-actions").hidden = proche;
    document.getElementById("legende-types").hidden = !proche;
    document.getElementById("aide-lieux").hidden = proche;
  }

  function construireBulles() {
    const zoom = map.getZoom();
    const libAnnee = anneeActions === "tout" ? "en 2022-2024" : "en " + anneeActions;
    // Les plus grosses d'abord : les petites restent visibles par-dessus
    return L.layerGroup(groupesActions.slice().sort(function (a, b) { return b.n - a.n; }).map(function (g, i) {
      const d = Math.round(rayonBulle(g.n, zoom) * 2);
      const m = L.marker([g.lat, g.lng], {
        pane: "actions", zIndexOffset: i, keyboard: false,
        icon: L.divIcon({
          className: "bulle-action", iconSize: [d, d],
          html: "<span>" + (d >= 22 ? g.n : "") + "</span>"
        })
      });
      infobulleSur(m, function () {
        return "<strong>" + S.echapper(g.nom) + "</strong><br>" + S.echapper(g.commune) +
          "<br><br><strong>" + g.n + " action" + (g.n > 1 ? "s" : "") + " " + libAnnee + "</strong>" +
          (g.h ? " · " + S.nombre(g.h) + " h" : "") + "<br>" +
          Object.keys(g.types).sort(function (a, b) { return g.types[b] - g.types[a]; })
            .map(function (t) {
              return '<i class="pastille" style="background:' + (COULEURS_TYPES[t] || "#94A3B8") + '"></i>' +
                S.echapper(t) + " : " + g.types[t];
            }).join("<br>");
      }, [0, -d / 2 - 4], true);
      m.on("click", function () { selectionner(g.code, false); });
      return m;
    }));
  }

  /** Légende en cercles emboîtés (1, un tiers du maximum, maximum). */
  function legendeBulles(max) {
    const valeurs = [1, Math.max(2, Math.round(max / 3)), max].filter(function (v, i, t) { return t.indexOf(v) === i; });
    // Agrandie pour rester lisible, même quand le maximum est faible (une seule année)
    const echelle = Math.max(1.7, 30 / rayonBulle(max));
    const rayon = function (v) { return rayonBulle(v) * echelle; };
    const R = rayon(max), H = Math.ceil(R * 2) + 8, base = H - 2, cx = R + 2;
    // Étiquettes du haut vers le bas, écartées d'au moins 14 px
    let yTexte = -Infinity;
    const cercles = valeurs.slice().reverse().map(function (v) {
      const r = rayon(v), y = base - 2 * r;
      yTexte = Math.max(y + 4, yTexte + 14);
      return '<circle cx="' + cx + '" cy="' + (base - r) + '" r="' + r + '"/>' +
        '<polyline points="' + cx + "," + y + " " + (2 * R + 8) + "," + y + " " + (2 * R + 14) + "," + (yTexte - 4) + '"/>' +
        '<text x="' + (2 * R + 18) + '" y="' + yTexte + '">' + v + "</text>";
    }).join("");
    return '<svg width="' + Math.ceil(2 * R + 40) + '" height="' + Math.ceil(Math.max(H, yTexte + 4)) + '" aria-hidden="true">' + cercles + "</svg>" +
      "<span>Nombre d'actions par IRIS<small>Surface proportionnelle</small></span>";
  }

  function dessinerActions() {
    const annee = anneeActions, tout = annee === "tout";
    const libAnnee = tout ? "en 2022-2024" : "en " + annee;
    document.querySelectorAll("#actions-annee button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.annee === annee);
    });
    // Actions de l'année choisie, limitées au territoire affiché (Métropole, hors Métropole…)
    const choisies = ACTIONS.filter(function (f) {
      const l = calques[f.properties.code_iris];
      return (tout || f.properties.annee === annee) && l && codeNiveau(l.feature.properties) != null;
    });

    // Regroupement par IRIS : nombre, heures, types, centre des lieux
    const groupes = {};
    choisies.forEach(function (f) {
      const p = f.properties, c = f.geometry.coordinates;
      const g = groupes[p.code_iris] = groupes[p.code_iris] ||
        { code: p.code_iris, nom: p.nom_iris, commune: p.commune, n: 0, h: 0, types: {}, lat: 0, lng: 0 };
      g.n++; g.h += p.heures || 0;
      g.lat += c[1]; g.lng += c[0];
      g.types[p.categorie] = (g.types[p.categorie] || 0) + 1;
    });
    groupesActions = Object.values(groupes).map(function (g) { g.lat /= g.n; g.lng /= g.n; return g; })
      .sort(function (a, b) { return b.n - a.n || b.h - a.h; });

    const max = groupesActions.length ? groupesActions[0].n : 1;
    document.getElementById("legende-actions").innerHTML = legendeBulles(max);

    // Lieux d'action, colorés par type (à l'échelle de la rue)
    if (coucheLieux) map.removeLayer(coucheLieux);
    coucheLieux = L.layerGroup(choisies.map(function (f) {
      const p = f.properties, c = f.geometry.coordinates;
      const point = L.circleMarker([c[1], c[0]], {
        pane: "actions", radius: 5, weight: 1.5, color: "#FFFFFF", fillOpacity: 0.95,
        fillColor: COULEURS_TYPES[p.categorie] || "#94A3B8"
      });
      infobulleSur(point, "<strong>" + S.echapper(p.nom) + "</strong><br>" + S.echapper(p.type) + " · " + S.echapper(p.association) +
        "<br>" + p.annee + (p.frequence ? " · " + S.echapper(p.frequence) : "") + (p.heures ? " · " + S.nombre(p.heures) + " h/an" : "") +
        (p.publics ? "<br>Publics : " + S.echapper(p.publics) : "") +
        (p.approx ? "<br><em>Position approximative (centre de l'IRIS)</em>" : ""), [0, -10], true);
      return point;
    }));
    afficherSelonZoom();

    // Les IRIS avec le plus d'actions (repliés par défaut)
    document.getElementById("titre-top").innerHTML = "IRIS les plus actifs " + libAnnee +
      " <small>" + choisies.length + " actions · " + groupesActions.length + " IRIS</small>";
    const top = document.getElementById("top-actions");
    top.innerHTML = groupesActions.slice(0, 6).map(function (g) {
      return '<li><button type="button" data-code="' + g.code + '"><span>' + S.echapper(g.nom) +
        "<small>" + S.echapper(g.commune) + "</small></span><strong>" + g.n + "</strong></button></li>";
    }).join("");
    top.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { selectionner(b.dataset.code, true); });
    });
  }

  function blocActionsFiche(code) {
    if (!ACTIONS) return "";
    const a = actionsParIris[code] || {};
    const total = (a["2022"] || 0) + (a["2023"] || 0) + (a["2024"] || 0);
    return '<div class="variable"><div class="haut"><span>Actions de prévention</span><strong>' + total + " en 3 ans</strong></div>" +
      '<div class="note">2022 : ' + (a["2022"] || 0) + " · 2023 : " + (a["2023"] || 0) + " · 2024 : " + (a["2024"] || 0) + "</div></div>";
  }

  /* ---------- Vue 3D (MapLibre, voir carte3d.js) ---------- */
  function cadrer(b, zoomMax, marge) {
    if (mode3D) Carte3D.cadrer([[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]], zoomMax + 1);
    else map.fitBounds(b, { maxZoom: zoomMax, padding: marge });
  }
  function couleur3D(p) {
    const c = codeNiveau(p);
    if (c === null || c === undefined || !visibles[c] || !NIV[c]) return null;
    return NIV[c].couleur;
  }
  function deplacerLegende(versCarte3D) {
    const leg = document.querySelector(".legende-flottante");
    if (!leg) return;
    if (versCarte3D) {
      leg.dataset.parent = "leaflet";
      leg.classList.add("hors-leaflet");
      document.getElementById("carte3d").parentNode.appendChild(leg);
    } else if (leg.dataset.parent) {
      leg.classList.remove("hors-leaflet");
      document.querySelector(".leaflet-top.leaflet-right").appendChild(leg);
    }
  }
  function activer3D() {
    const c = map.getCenter();
    mode3D = true;
    deplacerLegende(true);
    Carte3D.ouvrir(document.getElementById("carte3d"), {
      irisGeo: DONNEES.irisGeo, limites: DONNEES.limites, qpv: DONNEES.qpv, qpv2024: DONNEES.qpv2024,
      couleur: couleur3D,
      selection: function () { return selection ? selection.feature.properties.code_iris : null; },
      etiquette: etiquette,
      onClic: function (code) { selectionner(code, false); }
    }, c, map.getZoom() + 1).catch(function () {
      // MapLibre ou le fond OpenFreeMap n'a pas pu être chargé : retour en 2D
      alert("La vue 3D n'a pas pu être chargée (connexion internet nécessaire).");
      document.getElementById("fond").value = "sombre";
      changerFond("sombre");
    });
  }
  function desactiver3D() {
    const v = Carte3D.vue();
    mode3D = false;
    Carte3D.fermer(document.getElementById("carte3d"));
    deplacerLegende(false);
    if (v) map.setView([v.lat, v.lng], Math.max(8, Math.min(18, Math.round((v.zoom - 1) * 2) / 2)), { animate: false });
    map.invalidateSize();
  }

  /* ---------- Styles ---------- */
  function codeNiveau(p) { return p["niveau_" + TERR]; }
  function styleIris(f) {
    const code = codeNiveau(f.properties);
    const n = NIV[code];
    const clair = FONDS_CLAIRS.indexOf(nomFond) >= 0;
    const sel = selection && selection.feature === f;
    return {
      fillColor: n ? n.couleur : "#000",
      fillOpacity: code === 0 ? 0.6 : 0.88,
      color: sel ? "#FFFFFF" : (clair ? "#FFFFFF" : "#0A0F1C"),
      weight: sel ? 3.5 : 0.6,
      opacity: 1
    };
  }
  function styleLimite(f) {
    const clair = FONDS_CLAIRS.indexOf(nomFond) >= 0;
    const coche = document.querySelector('[data-limite="' + f.properties.id + '"]');
    const visible = coche ? coche.checked : true;
    const base = {
      departement:    { color: clair ? "#111827" : "#F8FAFC", weight: 2.5, dashArray: null },
      metropole:      { color: clair ? "#7E22CE" : "#C084FC", weight: 2.5, dashArray: "8 6" },
      hors_metropole: { color: clair ? "#B45309" : "#FBBF24", weight: 2.5, dashArray: "2 6" }
    }[f.properties.id] || { color: "#fff", weight: 2 };
    base.fill = false;
    base.opacity = visible ? 1 : 0;
    return base;
  }
  function styliserLimites() { if (limites) limites.setStyle(styleLimite); }

  function etiquette(p) {
    const n = NIV[codeNiveau(p)];
    return "<strong>" + S.echapper(p.nom_iris) + "</strong><br>" + S.echapper(p.commune) +
      (n ? "<br>" + S.echapper(n.libelle_long) : "");
  }

  /* ---------- Application du territoire et des niveaux cochés ---------- */
  function appliquer() {
    const comptes = {}, pops = {};
    Object.keys(calques).forEach(function (code) {
      const l = calques[code], c = codeNiveau(l.feature.properties);
      if (c === null || c === undefined) { groupeIris.removeLayer(l); return; }
      comptes[c] = (comptes[c] || 0) + 1;
      pops[c] = (pops[c] || 0) + (l.feature.properties.population || 0);
      if (visibles[c]) {
        if (!groupeIris.hasLayer(l)) groupeIris.addLayer(l);
        l.setStyle(styleIris(l.feature));
      } else {
        groupeIris.removeLayer(l);
      }
    });
    if (selection) selection.bringToFront();
    construireLegende(comptes, pops);
    document.querySelectorAll("#choix-territoire button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.terr === TERR);
    });
    if (selection) afficherFiche(selection.feature.properties);
    if (mode3D) Carte3D.maj();
    if (ACTIONS) dessinerActions();          // les actions suivent le territoire affiché
  }

  function construireChoixTerritoire() {
    const div = document.getElementById("choix-territoire");
    div.innerHTML = META.territoires.map(function (t) {
      return '<button type="button" data-terr="' + t.id + '"><span>' + S.echapper(t.titre) +
        '</span><span class="nb">' + S.nombre(t.n_iris_classes) + " IRIS</span></button>";
    }).join("");
    div.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        TERR = b.dataset.terr;
        // IRIS sélectionné hors du nouveau territoire : on le désélectionne
        if (selection && codeNiveau(selection.feature.properties) == null) deselectionner();
        appliquer();
        const u = new URL(window.location.href);
        u.searchParams.set("territoire", TERR); history.replaceState(null, "", u);
      });
    });
  }

  /* ---------- Légende flottante (contrôle Leaflet en haut à droite) ---------- */
  function popCourte(x) {
    if (x >= 1e6) return S.nombre(x / 1e6, 1).replace(/,0$/, "") + " M";
    if (x >= 1e4) return S.nombre(x / 1e3) + " k";
    return S.nombre(x);
  }
  function creerLegende() {
    const ctrl = L.control({ position: "topright" });
    ctrl.onAdd = function () {
      const div = L.DomUtil.create("div", "legende-flottante");
      if (window.matchMedia("(max-width: 860px)").matches) div.classList.add("repliee");
      div.innerHTML =
        '<button type="button" class="legende-entete" aria-expanded="' + !div.classList.contains("repliee") + '">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>' +
        "<span>Légende</span>" +
        '<svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>' +
        '<div class="legende-corps" id="legende-corps"></div>';
      div.querySelector(".legende-entete").addEventListener("click", function () {
        const repliee = div.classList.toggle("repliee");
        this.setAttribute("aria-expanded", !repliee);
      });
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    ctrl.addTo(map);
  }

  // Commentaire court sous la légende, propre à chaque échelle (chiffres tirés de iris.json / classifications.json)
  const COMMENTAIRES = {
    departement:
      "<p>Le niveau <b>élevé</b> domine l'image, surtout à l'ouest et au nord : communes rurales avec plus d'ouvriers, " +
      "moins de diplômés et des revenus modestes.</p>" +
      "<p><b>Effet de surface</b> : ces IRIS ruraux sont très grands. Ils couvrent 46 % de la carte mais ne regroupent " +
      "que 18 % des habitants.</p>" +
      "<p><b>Effet d'échelle</b> : ils sont comparés à Lyon, plus riche et plus diplômée. Classés entre eux (hors Métropole), " +
      "87 de ces 103 IRIS ruraux redescendent en <i>modérée</i> ou <i>faible</i>.</p>",
    metropole:
      "<p>Comparés entre eux, les IRIS de la Métropole montrent des écarts plus nets. La vulnérabilité <b>très élevée</b> se " +
      "concentre à l'est et au sud (Vénissieux, Vaulx-en-Velin, Lyon 8e).</p>" +
      "<p>Le centre dense (Lyon 1er, 3e, 7e) ressort en <b>élevée</b> à cause de la suroccupation. " +
      "La première couronne (Villeurbanne, Saint-Priest, Décines) forme le profil <b>modéré</b>.</p>",
    hors_metropole:
      "<p>Territoire plutôt favorisé : 3 habitants sur 4 vivent dans un IRIS de vulnérabilité faible ou très faible.</p>" +
      "<p>Le niveau <b>modéré</b> correspond aux bourgs ouvriers du Beaujolais (Amplepuis, Belleville). La vulnérabilité " +
      "<b>élevée</b> se concentre à Villefranche-sur-Saône et Tarare.</p>" +
      "<p><b>Effet d'échelle</b> : ces 46 IRIS modérés sont classés <i>élevée</i> à l'échelle du département.</p>"
  };

  let commentaireOuvert = false;

  function construireLegende(comptes, pops) {
    const corps = document.getElementById("legende-corps");
    const terr = META.territoires.find(function (t) { return t.id === TERR; }) || {};
    const classes = META.niveaux.filter(function (n) { return n.code > 0; });
    const ordre = classes.concat(META.niveaux.filter(function (n) { return n.code === 0; }));
    const nClasses = classes.reduce(function (s, n) { return s + (comptes[n.code] || 0); }, 0);

    corps.innerHTML =
      '<p class="legende-sous-titre">ACP + CAH · ' + S.echapper(terr.titre) + " · IRIS</p>" +
      '<div class="legende-bornes"><span>Moins vulnérable</span><span>Plus vulnérable</span></div>' +
      '<div class="legende-degrade" style="background:linear-gradient(90deg,' +
        classes.map(function (n) { return n.couleur; }).join(",") + ')"></div>' +
      '<div class="legende-lignes">' + ordre.map(function (n) {
        const nb = comptes[n.code] || 0;
        return '<label class="' + (nb ? "" : "vide") + '"><input type="checkbox" data-code="' + n.code + '"' +
          (visibles[n.code] ? " checked" : "") + '><span class="rond" style="background:' + n.couleur + '"></span>' +
          '<span class="nom">' + S.echapper(n.libelle) + "</span>" +
          '<span class="nb">' + S.nombre(nb) + " · " + popCourte(pops[n.code] || 0) + " hab</span></label>";
      }).join("") + "</div>" +
      '<p class="legende-note">Population : recensement 2022</p>' +
      '<dl class="legende-resume">' +
        "<dt>IRIS classés</dt><dd>" + S.nombre(nClasses) + "</dd>" +
        "<dt>Méthode</dt><dd>ACP + CAH (Ward)</dd>" +
        "<dt>Données</dt><dd>RP 2022 · Filosofi 2021</dd>" +
        "<dt>Silhouette</dt><dd>" + S.nombre(terr.silhouette, 2) + "</dd></dl>" +
      '<button type="button" class="legende-bouton" id="bouton-commentaire" aria-expanded="' + commentaireOuvert +
        '" aria-controls="legende-commentaire">Comment lire cette carte ?<svg class="chevron" width="14" height="14" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>' +
      '<div class="legende-commentaire" id="legende-commentaire"' + (commentaireOuvert ? "" : " hidden") + ">" +
        (COMMENTAIRES[TERR] || "") +
        '<a class="lien-methode" href="classification.html#' + TERR + '">Méthode détaillée →</a></div>';

    // Commentaire masqué par défaut ; l'état ouvert/fermé est gardé quand on change de territoire
    corps.querySelector("#bouton-commentaire").addEventListener("click", function () {
      commentaireOuvert = !commentaireOuvert;
      this.setAttribute("aria-expanded", commentaireOuvert);
      corps.querySelector("#legende-commentaire").hidden = !commentaireOuvert;
    });

    corps.querySelectorAll("input").forEach(function (cb) {
      cb.addEventListener("change", function () { visibles[cb.dataset.code] = cb.checked; appliquer(); });
    });
  }

  /* ---------- Sélection / fiche ---------- */
  function selectionner(code, zoomer) {
    const l = calques[code];
    if (!l) return;
    if (codeNiveau(l.feature.properties) == null) {       // IRIS hors du territoire affiché
      TERR = "departement";
    }
    const c = codeNiveau(l.feature.properties);
    if (!visibles[c]) visibles[c] = true;
    const ancienne = selection;
    selection = l;
    if (ancienne) ancienne.setStyle(styleIris(ancienne.feature));
    appliquer();
    l.setStyle(styleIris(l.feature)); l.bringToFront();
    if (zoomer) cadrer(l.getBounds(), 15, [40, 40]);
    const u = new URL(window.location.href);
    u.searchParams.set("iris", code); history.replaceState(null, "", u);
  }
  function deselectionner() {
    const l = selection; selection = null;
    if (l) l.setStyle(styleIris(l.feature));
    document.getElementById("fiche").innerHTML = '<p class="tres-discret">Cliquez sur un IRIS de la carte.</p>';
  }
  function zoomCommune(codeCommune) {
    let b = null;
    Object.keys(calques).forEach(function (k) {
      const l = calques[k];
      if (l.feature.properties.code_commune === codeCommune) b = b ? b.extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast());
    });
    if (b) cadrer(b, 14, [30, 30]);
  }
  function cadrerTerritoire() {
    let b = null;
    groupeIris.eachLayer(function (l) { b = b ? b.extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast()); });
    if (b) map.fitBounds(b, { padding: [20, 20] });
  }

  const TYPES_IRIS = { H: "IRIS d'habitat", A: "IRIS d'activité", D: "IRIS divers", Z: "commune non découpée" };

  function afficherFiche(p) {
    const terrPropre = p.territoire;             // metropole / hors_metropole
    const titres = {};
    META.territoires.forEach(function (t) { titres[t.id] = t.titre; });
    const lignesNiveaux = ["departement", terrPropre].map(function (t) {
      const c = p["niveau_" + t];
      const n = NIV[c];
      return '<div class="ligne-niveau"' + (t === TERR ? ' style="font-weight:600"' : "") + "><span>" +
        S.echapper(titres[t]) + (t === TERR ? " (affichée)" : "") + "</span>" + S.badge(n, n ? n.libelle : "") + "</div>";
    }).join("");

    const st = stats[TERR];
    const variables = META.variables.map(function (v) {
      const x = p[v.id];
      if (x === null || x === undefined) {
        return '<div class="variable"><div class="haut"><span>' + S.echapper(v.libelle) + "</span><strong>n.d.</strong></div></div>";
      }
      const s = st[v.id];
      const medTerr = CLASSIF[TERR] ? CLASSIF[TERR].ensemble.medianes[v.id] : s.med;   // même valeur que la page Classification
      const pos = s.max > s.min ? Math.max(0, Math.min(1, (x - s.min) / (s.max - s.min))) : 0;
      const med = s.max > s.min ? (medTerr - s.min) / (s.max - s.min) : 0;
      const rang = centile(s.tri, x);
      return '<div class="variable"><div class="haut"><span>' + S.echapper(v.libelle) + "</span><strong>" +
        S.valeur(META, v.id, x) + "</strong></div>" +
        '<div class="jauge" title="Barre blanche : médiane du territoire"><div class="rempli" style="width:' + (100 * pos).toFixed(1) +
        '%"></div><div class="mediane" style="left:' + (100 * med).toFixed(1) + '%"></div></div>' +
        '<div class="note">Médiane du territoire : ' + S.valeur(META, v.id, medTerr) + " · plus élevé que " +
        rang + " % des IRIS</div>" +
        (v.id === "revenu_med" && p.revenu_source === "commune" ? '<div class="note" style="color:#FDE68A">Revenu de la commune (valeur de l\'IRIS non diffusée)</div>' : "") +
        "</div>";
    }).join("");

    document.getElementById("fiche").innerHTML =
      "<h3>" + S.echapper(p.nom_iris) + "</h3>" +
      '<div class="lieu">' + S.echapper(p.commune) + " · " + S.echapper(p.code_iris) + " · " +
      S.echapper(TYPES_IRIS[p.type_iris] || p.type_iris) + " · " + S.nombre(p.population) + " hab.</div>" +
      lignesNiveaux +
      (p.motif_non_classe ? '<p class="note" style="color:#FDE68A">' + S.echapper(p.motif_non_classe) + "</p>" : "") +
      variables + blocActionsFiche(p.code_iris) +
      '<p class="note" style="margin-top:10px">Jauge : position entre le minimum et le maximum des IRIS classés du territoire affiché.</p>';
    if (window.innerWidth <= 860) basculerPanneau(true);
  }

  function basculerPanneau(ouvrir) {
    document.getElementById("panneau").classList.toggle("ouvert", ouvrir);
    document.getElementById("bouton-panneau").textContent = ouvrir ? "Voir la carte" : "Réglages";
  }

  /* ---------- Statistiques de référence par territoire ---------- */
  function calculerStats(iris) {
    META.territoires.forEach(function (t) {
      const lignes = iris.filter(function (r) { return r["niveau_" + t.id] > 0; });
      stats[t.id] = {};
      META.variables.forEach(function (v) {
        const tri = lignes.map(function (r) { return r[v.id]; }).filter(function (x) { return x !== null; })
          .sort(function (a, b) { return a - b; });
        const m = tri.length;
        stats[t.id][v.id] = {
          tri: tri, min: tri[0], max: tri[m - 1],
          med: m % 2 ? tri[(m - 1) / 2] : (tri[m / 2 - 1] + tri[m / 2]) / 2
        };
      });
    });
  }
  function centile(tri, x) {
    let n = 0;
    for (let i = 0; i < tri.length; i++) if (tri[i] < x) n++;
    return Math.round(100 * n / tri.length);
  }
})();
