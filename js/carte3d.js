/* =============================================================================
   carte3d.js - vue 3D de la page carte (MapLibre GL + fond OpenFreeMap, sans clé)
   Bâtiments en relief (OpenStreetMap), IRIS colorés au sol, QPV et limites.
   Piloté par carte.js via window.Carte3D ; MapLibre n'est chargé qu'au premier passage en 3D.
   ============================================================================= */
(function () {
  "use strict";

  const STYLE = "https://tiles.openfreemap.org/styles/liberty";
  // Altitudes (tuiles « terrarium » d'AWS / Mapzen, libres et sans clé)
  const RELIEF = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
  const COULEUR_BATI = "#ECE7DF";        // bâtiment hors IRIS affiché
  let carte = null, opts = null, pret = null, popup = null;
  let indexIris = null;                  // IRIS avec emprise, pour retrouver l'IRIS d'un bâtiment
  const irisDuBati = new Map();          // id OSM du bâtiment -> code IRIS (ou null)

  /* ---------- Rattachement des bâtiments aux IRIS (centre du bâtiment dans le polygone) ---------- */
  function preparerIndex() {
    indexIris = opts.irisGeo.features.map(function (f) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      polys.forEach(function (p) { p[0].forEach(function (c) {
        if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
      }); });
      return { code: f.properties.code_iris, polys: polys, b: [x0, y0, x1, y1] };
    });
  }
  function dansAnneau(x, y, a) {
    let dedans = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      if ((a[i][1] > y) !== (a[j][1] > y) && x < (a[j][0] - a[i][0]) * (y - a[i][1]) / (a[j][1] - a[i][1]) + a[i][0]) dedans = !dedans;
    }
    return dedans;
  }
  let dernier = null;                    // les bâtiments voisins tombent souvent dans le même IRIS
  function irisDuPoint(x, y) {
    const essai = function (e) {
      if (x < e.b[0] || x > e.b[2] || y < e.b[1] || y > e.b[3]) return false;
      return e.polys.some(function (p) {
        return dansAnneau(x, y, p[0]) && !p.slice(1).some(function (trou) { return dansAnneau(x, y, trou); });
      });
    };
    if (dernier && essai(dernier)) return dernier.code;
    for (let i = 0; i < indexIris.length; i++) if (essai(indexIris[i])) { dernier = indexIris[i]; return dernier.code; }
    return null;
  }
  function centre(g) {
    const a = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0];
    let x = 0, y = 0;
    for (let i = 0; i < a.length; i++) { x += a[i][0]; y += a[i][1]; }
    return [x / a.length, y / a.length];
  }
  const couleurIris = {};                // code IRIS -> couleur courante (ou null si masqué)
  function etatBati(id, code) {
    carte.setFeatureState({ source: "openmaptiles", sourceLayer: "building", id: id },
      { c: (code && couleurIris[code]) || null });
  }
  /** Rattache les bâtiments nouvellement chargés (appelé quand la carte est au repos). */
  function rattacherBatiments() {
    if (!carte || carte.getZoom() < 13.5 || !carte.getSource("openmaptiles")) return;
    carte.querySourceFeatures("openmaptiles", { sourceLayer: "building" }).forEach(function (f) {
      if (f.id === undefined || irisDuBati.has(f.id)) return;
      const c = centre(f.geometry);
      const code = irisDuPoint(c[0], c[1]);
      irisDuBati.set(f.id, code);
      etatBati(f.id, code);
    });
  }

  function chargerMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    return new Promise(function (ok, ko) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "lib/maplibre/maplibre-gl.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = "lib/maplibre/maplibre-gl.js"; js.onload = ok; js.onerror = ko;
      document.head.appendChild(js);
    });
  }

  /* Couches ajoutées sous les bâtiments 3D (IRIS au sol) ou au-dessus (contours) */
  function ajouterCouches() {
    const avantBatiments = carte.getLayer("building") ? "building" : undefined;

    carte.addSource("iris", { type: "geojson", data: opts.irisGeo, promoteId: "code_iris" });
    carte.addLayer({
      id: "iris-fond", type: "fill", source: "iris",
      paint: {
        "fill-color": ["coalesce", ["feature-state", "c"], "#000000"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "v"], false], 0.6, 0]
      }
    }, avantBatiments);
    carte.addLayer({
      id: "iris-contour", type: "line", source: "iris",
      paint: {
        "line-color": "#FFFFFF",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.2, 14, 0.8],
        "line-opacity": ["case", ["boolean", ["feature-state", "v"], false], 0.7, 0]
      }
    }, avantBatiments);

    if (opts.limites) {
      carte.addSource("limites", { type: "geojson", data: opts.limites });
      [["departement", "#111827", null], ["metropole", "#7E22CE", [3, 2]], ["hors_metropole", "#B45309", [1, 2]]]
        .forEach(function (x) {
          const paint = { "line-color": x[1], "line-width": 2.5 };
          if (x[2]) paint["line-dasharray"] = x[2];
          carte.addLayer({ id: "limite-" + x[0], type: "line", source: "limites", filter: ["==", ["get", "id"], x[0]], paint: paint });
        });
    }
    if (opts.qpv) {
      carte.addSource("qpv", { type: "geojson", data: opts.qpv });
      carte.addLayer({ id: "qpv", type: "line", source: "qpv", paint: { "line-color": "#0284C7", "line-width": 2.5 } });
    }
    if (opts.qpv2024) {
      carte.addSource("qpv2024", { type: "geojson", data: opts.qpv2024 });
      carte.addLayer({ id: "qpv2024", type: "line", source: "qpv2024",
        paint: { "line-color": "#DB2777", "line-width": 3, "line-dasharray": [2, 1.5] } });
    }
    carte.addLayer({
      id: "iris-selection", type: "line", source: "iris", filter: ["==", ["get", "code_iris"], ""],
      paint: { "line-color": "#111827", "line-width": 4 }
    });

    // Bâtiments colorés selon le niveau de leur IRIS (état posé par rattacherBatiments)
    if (carte.getLayer("building-3d")) {
      carte.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.92);
      carte.setPaintProperty("building-3d", "fill-extrusion-color",
        ["coalesce", ["feature-state", "c"], COULEUR_BATI]);
      preparerIndex();
      carte.on("idle", rattacherBatiments);
    }

    // Relief : terrain en altitude (légèrement accentué) + ombrage discret sous les IRIS
    carte.addSource("relief", { type: "raster-dem", tiles: [RELIEF], encoding: "terrarium", tileSize: 256, maxzoom: 15,
      attribution: "Relief : Mapzen / AWS Terrain Tiles" });
    carte.addSource("relief-ombre", { type: "raster-dem", tiles: [RELIEF], encoding: "terrarium", tileSize: 256, maxzoom: 15 });
    carte.addLayer({ id: "ombrage", type: "hillshade", source: "relief-ombre",
      paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5B4B35", "hillshade-highlight-color": "#FFFFFF" } }, "iris-fond");
    // Case « Relief (vue 3D) » du panneau : couper le relief allège nettement le rendu
    const caseRelief = document.getElementById("couche-relief");
    const appliquerRelief = function () {
      const avec = !caseRelief || caseRelief.checked;
      carte.setTerrain(avec ? { source: "relief", exaggeration: 1.5 } : null);
      carte.setLayoutProperty("ombrage", "visibility", avec ? "visible" : "none");
    };
    if (caseRelief) caseRelief.addEventListener("change", appliquerRelief);
    appliquerRelief();

    // Survol et clic sur les IRIS
    popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "popup-iris", offset: 12 });
    carte.on("mousemove", "iris-fond", function (e) {
      const f = e.features[0];
      const etat = carte.getFeatureState({ source: "iris", id: f.properties.code_iris });
      if (!etat.v) { popup.remove(); carte.getCanvas().style.cursor = ""; return; }
      carte.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setHTML(opts.etiquette(f.properties)).addTo(carte);
    });
    carte.on("mouseleave", "iris-fond", function () { popup.remove(); carte.getCanvas().style.cursor = ""; });
    carte.on("click", "iris-fond", function (e) {
      const code = e.features[0].properties.code_iris;
      if (carte.getFeatureState({ source: "iris", id: code }).v) opts.onClic(code);
    });

    // Cases à cocher des couches (panneau de gauche)
    const cases = [["couche-qpv", ["qpv"]], ["couche-qpv2024", ["qpv2024"]]];
    document.querySelectorAll("[data-limite]").forEach(function (cb) { cases.push([cb, ["limite-" + cb.dataset.limite]]); });
    cases.forEach(function (x) {
      const cb = typeof x[0] === "string" ? document.getElementById(x[0]) : x[0];
      if (!cb) return;
      const appliquerCase = function () {
        x[1].forEach(function (id) { if (carte.getLayer(id)) carte.setLayoutProperty(id, "visibility", cb.checked ? "visible" : "none"); });
      };
      cb.addEventListener("change", appliquerCase);
      appliquerCase();
    });
  }

  /** Recalcule couleurs / visibilité des IRIS et le contour de sélection. */
  function maj() {
    if (!carte || !carte.getSource("iris")) return;
    opts.irisGeo.features.forEach(function (f) {
      const c = opts.couleur(f.properties);           // null = IRIS masqué
      couleurIris[f.properties.code_iris] = c;
      carte.setFeatureState({ source: "iris", id: f.properties.code_iris }, { c: c || "#000000", v: !!c });
    });
    irisDuBati.forEach(function (code, id) { etatBati(id, code); });   // bâtiments déjà rattachés
    carte.setFilter("iris-selection", ["==", ["get", "code_iris"], opts.selection() || ""]);
  }

  window.Carte3D = {
    /** Ouvre (ou réaffiche) la vue 3D centrée sur la vue 2D courante. */
    ouvrir: function (conteneur, options, centre, zoom) {
      opts = options;
      conteneur.hidden = false;
      if (carte) {
        carte.resize();
        carte.jumpTo({ center: [centre.lng, centre.lat], zoom: zoom });
        maj();
        return pret;
      }
      pret = chargerMapLibre().then(function () {
        carte = new maplibregl.Map({
          container: conteneur, style: STYLE,
          center: [centre.lng, centre.lat], zoom: Math.max(zoom, 12.5),
          pitch: 60, bearing: -20, maxPitch: 75, antialias: true
        });
        carte.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
        carte.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
        window.carteMapLibre = carte;   // mise au point dans la console
        return new Promise(function (ok) {
          carte.on("load", function () { ajouterCouches(); maj(); ok(); });
        });
      });
      return pret;
    },
    fermer: function (conteneur) {
      conteneur.hidden = true;
      if (popup) popup.remove();
    },
    maj: maj,
    /** Vue courante, pour revenir en 2D au même endroit. */
    vue: function () {
      if (!carte) return null;
      const c = carte.getCenter();
      return { lat: c.lat, lng: c.lng, zoom: carte.getZoom() };
    },
    /** bornes : [[sud, ouest], [nord, est]] */
    cadrer: function (bornes, zoomMax) {
      if (!carte) return;
      carte.fitBounds([[bornes[0][1], bornes[0][0]], [bornes[1][1], bornes[1][0]]],
        { padding: 60, maxZoom: zoomMax || 16, pitch: 60, duration: 900 });
    }
  };
})();
