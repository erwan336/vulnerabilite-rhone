/* =============================================================================
   accueil.js - page d'accueil (index.html)
   ============================================================================= */
(function () {
  "use strict";
  const S = window.Site;

  /* ---------- Carrousel des 3 échelles (carte du héros) ----------
     Pas de diapositives : la même carte se recolore en onde depuis Lyon, les IRIS hors de l'échelle
     passent en « fantôme », et le cadrage zoome sur la Métropole. Défilement automatique (pause au survol),
     arrêté dès que l'on choisit une échelle ; rien ne bouge si l'utilisateur limite les animations. */
  const TEXTES_ECHELLES = {
    departement: "Tous les IRIS du Rhône comparés entre eux : Lyon et sa banlieue face au périurbain et au rural.",
    metropole: "Les IRIS de la Métropole comparés entre eux : les écarts au sein de l'agglomération ressortent.",
    hors_metropole: "Les IRIS hors Métropole comparés entre eux : les pôles de Villefranche-sur-Saône et Tarare se détachent."
  };
  const LIBELLES_ECHELLES = { departement: "départementale", metropole: "de la Métropole de Lyon",
                              hors_metropole: "du Rhône hors Métropole" };
  const FANTOME = "#ECE7DD", DUREE_ECHELLE = 3000;   // 3 s par échelle

  function carrousel(meta) {
    const figure = document.getElementById("carrousel-echelles");
    const svg = document.querySelector("#mini-carte svg");
    if (!figure || !svg) return;
    const chemins = Array.prototype.slice.call(svg.querySelectorAll("path"));
    const niv = S.niveauxParCode(meta), terrs = meta.territoires;
    const animer = !!window.gsap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Onde : délai selon la distance au cœur de Lyon (centre des 80 plus petits IRIS)
    const boites = chemins.map(function (p) { return p.getBBox(); });
    const petits = boites.slice().sort(function (a, b) { return a.width * a.height - b.width * b.height; }).slice(0, 80);
    const cx = petits.reduce(function (s, b) { return s + b.x + b.width / 2; }, 0) / petits.length;
    const cy = petits.reduce(function (s, b) { return s + b.y + b.height / 2; }, 0) / petits.length;
    const dist = boites.map(function (b) { return Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy); });
    const dMax = Math.max.apply(null, dist);

    // Cadrage : tout le département, sauf pour la Métropole (zoom, même proportion 3:4 que le dessin)
    const vbTout = svg.getAttribute("viewBox");
    function cadrage(t) {
      if (t !== "metropole") return vbTout;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      chemins.forEach(function (p, i) {
        if (p.getAttribute("data-metropole") === "") return;
        const b = boites[i];
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      });
      let w = (x1 - x0) * 1.08, h = (y1 - y0) * 1.08;
      if (w / h > .75) h = w / .75; else w = h * .75;
      return [(x0 + x1 - w) / 2, (y0 + y1 - h) / 2, w, h].map(function (v) { return v.toFixed(1); }).join(" ");
    }
    function couleur(p, t) {
      const v = p.getAttribute("data-" + t);
      return v === "" ? FANTOME : (niv[v] || niv[0]).couleur;
    }

    // Onglets avec barre de progression
    const onglets = document.getElementById("echelles");
    onglets.innerHTML = terrs.map(function (t, i) {
      return '<button type="button" role="tab" data-i="' + i + '" aria-selected="' + (i === 0) + '" tabindex="' + (i ? -1 : 0) +
        '">' + S.echapper(t.titre_court.replace(/ entier$/, "")) + '<i class="progression" aria-hidden="true"></i></button>';
    }).join("");
    onglets.hidden = false;
    const boutons = Array.prototype.slice.call(onglets.querySelectorAll("button"));

    let actif = 0, ecoule = 0, auto = animer, pause = false, visible = true, precedent = null;
    function afficher(i) {
      actif = i; ecoule = 0;
      const t = terrs[i];
      boutons.forEach(function (b, j) {
        b.setAttribute("aria-selected", j === i); b.tabIndex = j === i ? 0 : -1;
        b.querySelector(".progression").style.transform = "scaleX(0)";
      });
      chemins.forEach(function (p) {
        const v = p.getAttribute("data-" + t.id);
        p.querySelector("title").textContent = p.getAttribute("data-nom") + " - " +
          (v === "" ? "hors de cette échelle" : (niv[v] || niv[0]).libelle_long);
      });
      if (animer) {
        gsap.to(chemins, { fill: function (j, p) { return couleur(p, t.id); }, duration: .6, ease: "power2.out",
          delay: function (j) { return dist[j] / dMax * .7; }, overwrite: "auto" });
        gsap.to(svg, { attr: { viewBox: cadrage(t.id) }, duration: 1.4, ease: "power3.inOut", overwrite: "auto" });
      } else {
        chemins.forEach(function (p) { p.style.fill = couleur(p, t.id); });
        svg.setAttribute("viewBox", cadrage(t.id));
      }
      const texte = document.getElementById("echelle-texte");
      texte.innerHTML = "<strong>" + S.echapper(t.titre) + "</strong><span>" + S.echapper(TEXTES_ECHELLES[t.id] || "") +
        '</span><span class="echelle-chiffres">' + S.nombre(t.n_iris_classes) + " IRIS classés · " +
        S.population(t.population_classee) + " habitants · silhouette " + S.nombre(t.silhouette, 2) + "</span>";
      if (animer) gsap.from(texte.children, { y: 10, autoAlpha: 0, duration: .5, stagger: .06, ease: "power2.out" });
      document.getElementById("echelle-libelle").textContent =
        "Niveau de vulnérabilité par IRIS, classification " + (LIBELLES_ECHELLES[t.id] || "") + ".";
      const lien = "carte.html?territoire=" + t.id;
      document.getElementById("lien-echelle").href = lien;
      document.getElementById("mini-carte").href = lien;
    }
    // Un choix de l'utilisateur arrête le défilement automatique
    boutons.forEach(function (b, i) { b.addEventListener("click", function () { auto = false; afficher(i); }); });
    onglets.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      auto = false;
      afficher((actif + (e.key === "ArrowRight" ? 1 : terrs.length - 1)) % terrs.length);
      boutons[actif].focus();
    });

    // Défilement automatique : pause au survol / au clavier, et quand la carte n'est plus à l'écran
    figure.addEventListener("mouseenter", function () { pause = true; });
    figure.addEventListener("mouseleave", function () { pause = false; });
    figure.addEventListener("focusin", function () { pause = true; });
    figure.addEventListener("focusout", function () { pause = false; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(figure);
    }
    afficher(0);
    if (!auto) return;
    (function boucle(t) {
      if (precedent !== null && auto && !pause && visible && !document.hidden) ecoule += t - precedent;
      precedent = t;
      if (auto && ecoule >= DUREE_ECHELLE) afficher((actif + 1) % terrs.length);
      boutons[actif].querySelector(".progression").style.transform =
        "scaleX(" + (auto ? Math.min(ecoule / DUREE_ECHELLE, 1) : 0) + ")";
      if (auto) requestAnimationFrame(boucle);
    })(performance.now());
  }

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
      const pr = f.properties, n = niv[pr.niveau_departement || 0] || niv[0];
      const nom = S.echapper(pr.nom_iris) + " (" + S.echapper(pr.commune) + ")";
      // Niveaux des 3 échelles gardés sur le tracé ("" = IRIS hors de cette échelle) : voir carrousel()
      const attrs = ["departement", "metropole", "hors_metropole"].map(function (t) {
        const v = pr["niveau_" + t];
        return " data-" + t + '="' + (v === null || v === undefined ? "" : v) + '"';
      }).join("");
      return '<path d="' + d + '" fill="' + n.couleur + '" data-nom="' + nom + '"' + attrs + "><title>" + nom +
        " - " + S.echapper(n.libelle_long) + "</title></path>";
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
    if (!window.gsap) compterChiffres(document.querySelectorAll("#chiffres dt"));   // sinon : accueil-anim.js

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
        (PHOTOS[v.id] ? '<div class="indicateur-image"><img src="' + PHOTOS[v.id] + '" alt="" loading="lazy"></div>' : "") +
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

    // Contenu en place : les animations d'entrée peuvent viser les cartes (accueil-anim.js)
    document.dispatchEvent(new CustomEvent("accueil:pret"));

    // ---- Mini-carte (fichier lourd : chargée en dernier, sans bloquer la page) ----
    S.charger("irisGeo", true).then(function (geo) {
      if (geo) {
        dessinerMiniCarte(geo, meta);
        carrousel(meta);
        document.dispatchEvent(new CustomEvent("accueil:minicarte"));   // animation (accueil-anim.js)
      }
    }).catch(function () { /* la mini-carte reste vide, le reste de la page fonctionne */ });
  }).catch(function () { /* bandeau d'erreur affiché par commun.js */ });

  /** Chiffres clés : comptent de 0 jusqu'à leur valeur quand ils arrivent à l'écran ("1,9 M", "752"…). */
  function compterChiffres(elements) {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        const el = e.target, final = el.textContent;
        const m = final.match(/^([\d\s  ]*\d(?:,\d+)?)(.*)$/);
        if (!m) return;
        const cible = parseFloat(m[1].replace(/[\s  ]/g, "").replace(",", "."));
        const dec = (m[1].split(",")[1] || "").length, debut = performance.now(), duree = 1400;
        (function etape(t) {
          const p = Math.min(1, (t - debut) / duree), v = cible * (1 - Math.pow(1 - p, 3));
          el.textContent = p < 1 ? v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[2] : final;
          if (p < 1) requestAnimationFrame(etape);
        })(debut);
      });
    }, { threshold: 0.6 });
    elements.forEach(function (el) { obs.observe(el); });
  }

  // ---- Partenaires : la liste est doublée pour que le défilement boucle sans saut ----
  const piste = document.getElementById("piste-partenaires");
  if (piste) {
    const copie = piste.querySelector(".logos").cloneNode(true);
    copie.setAttribute("aria-hidden", "true");
    copie.querySelectorAll("img").forEach(function (img) { img.alt = ""; });
    piste.appendChild(copie);
    piste.classList.add("anime");
  }
})();
