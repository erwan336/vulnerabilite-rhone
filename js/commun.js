/* =============================================================================
   commun.js - fonctions partagées par les 3 pages
   Tout est rangé dans l'objet global `Site`.
   Les données viennent de data/*.json (produits par R/08_export_json.R).
   ============================================================================= */
(function () {
  "use strict";

  const FICHIERS = {
    meta:            "data/meta.json",
    classifications: "data/classifications.json",
    iris:            "data/iris.json",
    irisGeo:         "data/iris.geojson",
    limites:         "data/limites.geojson",
    qpv:             "data/qpv.geojson",
    qpv2024:         "data/qpv2024_rhone.geojson",  // QPV 2024 (ANCT), tout le département
    actions:         "data/actions.geojson",        // lieux d'action 2022-2024 (fichier prévisionnel)
    arbres:          "data/arbres.json"             // arbre de Ward des 5 classes, par territoire
  };
  const cache = {};

  /** Charge un fichier de données (une seule fois). */
  function charger(nom, optionnel) {
    if (!cache[nom]) {
      cache[nom] = fetch(FICHIERS[nom]).then(function (r) {
        if (!r.ok) {
          if (optionnel) return null;
          throw new Error(FICHIERS[nom] + " introuvable (" + r.status + ")");
        }
        return r.json();
      });
    }
    return cache[nom];
  }

  /** Charge plusieurs fichiers : chargerTout(["meta", "iris"]).then(d => d.meta ...) */
  function chargerTout(noms, optionnels) {
    optionnels = optionnels || [];
    return Promise.all(noms.map(function (n) { return charger(n, optionnels.indexOf(n) >= 0); }))
      .then(function (vals) {
        const res = {};
        noms.forEach(function (n, i) { res[n] = vals[i]; });
        return res;
      })
      .catch(function (err) { afficherErreur(err); throw err; });
  }

  /* ---------------- Formats (français) ---------------- */
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  function nombre(x, dec) {
    if (x === null || x === undefined || Number.isNaN(x)) return "–";
    return [nf0, nf1, nf2, nf3][dec || 0].format(x);
  }
  function population(x) {
    if (x === null || x === undefined) return "–";
    if (x >= 1e6) return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(x / 1e6) + " M";
    return nf0.format(x);
  }
  /** Valeur d'une variable avec son unité (définie dans meta.variables). */
  function valeur(meta, idVar, x) {
    if (x === null || x === undefined) return "n.d.";
    const def = variable(meta, idVar);
    const dec = def ? def.decimales : 1;
    const unite = def ? def.unite : "";
    return nombre(x, dec) + (unite ? " " + unite : "");
  }
  function variable(meta, idVar) {
    return meta.variables.find(function (v) { return v.id === idVar; });
  }

  /* ---------------- Niveaux ---------------- */
  function niveauxParCode(meta) {
    const res = {};
    meta.niveaux.forEach(function (n) { res[n.code] = n; });
    return res;
  }
  function badge(niv, texte) {
    if (!niv) return "";
    return '<span class="badge" style="background:' + niv.couleur + ";color:" + niv.couleur_texte + '">' +
      echapper(texte || niv.libelle_long) + "</span>";
  }

  /* ---------------- Outils ---------------- */
  function echapper(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normaliser(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function parametre(nom) {
    return new URLSearchParams(window.location.search).get(nom);
  }

  /* ---------------- Infobulle unique ---------------- */
  let bulle = null;
  function infobulle(el, contenuHtml) {
    if (!bulle) {
      bulle = document.createElement("div");
      bulle.className = "infobulle";
      bulle.hidden = true;
      document.body.appendChild(bulle);
    }
    function placer(e) {
      const x = Math.min(e.clientX + 14, window.innerWidth - bulle.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, window.innerHeight - bulle.offsetHeight - 8);
      bulle.style.left = x + "px";
      bulle.style.top = y + "px";
    }
    el.addEventListener("mouseenter", function (e) {
      bulle.innerHTML = typeof contenuHtml === "function" ? contenuHtml() : contenuHtml;
      bulle.hidden = false; placer(e);
    });
    el.addEventListener("mousemove", placer);
    el.addEventListener("mouseleave", function () { bulle.hidden = true; });
  }

  /* ---------------- Barre de répartition empilée ---------------- */
  /** effectifs : [n1..nK] ; niveaux : meta.niveaux (codes 1..K) */
  function barreRepartition(conteneur, effectifs, meta, unite) {
    const niv = niveauxParCode(meta);
    const total = effectifs.reduce(function (a, b) { return a + b; }, 0);
    conteneur.classList.add("repartition");
    conteneur.innerHTML = "";
    effectifs.forEach(function (n, i) {
      const code = i + 1;
      const seg = document.createElement("span");
      seg.style.flex = String(n);
      seg.style.background = niv[code].couleur;
      conteneur.appendChild(seg);
      infobulle(seg, "<strong>" + echapper(niv[code].libelle_long) + "</strong><br>" +
        nombre(n) + " " + (unite || "IRIS") + " (" + nombre(100 * n / total, 1) + " %)");
    });
  }
  function legendeNiveaux(meta) {
    return '<div class="legende-niveaux">' + meta.niveaux.filter(function (n) { return n.code > 0; })
      .map(function (n) { return '<span><i style="background:' + n.couleur + '"></i>' + echapper(n.libelle) + "</span>"; })
      .join("") + "</div>";
  }

  /* ---------------- Recherche d'IRIS / de communes ---------------- */
  /**
   * champ : <input>, liste : <ul>, iris : tableau de data/iris.json
   * choisir({type: "iris"|"commune", code, libelle}) est appelé au choix
   */
  function recherche(champ, liste, iris, choisir) {
    const communes = {};
    iris.forEach(function (r) {
      if (!communes[r.code_commune]) communes[r.code_commune] = { code: r.code_commune, nom: r.commune, n: 0 };
      communes[r.code_commune].n++;
    });
    const index = iris.map(function (r) {
      return { type: "iris", code: r.code_iris, libelle: r.nom_iris, sous: r.commune,
               cle: normaliser(r.nom_iris + " " + r.commune + " " + r.code_iris) };
    }).concat(Object.values(communes).map(function (c) {
      return { type: "commune", code: c.code, libelle: c.nom, sous: c.n + " IRIS",
               cle: normaliser(c.nom + " " + c.code) };
    }));
    let courant = [], actif = -1;

    function afficher() {
      const q = normaliser(champ.value.trim());
      if (q.length < 2) { liste.hidden = true; return; }
      const mots = q.split(/\s+/);
      courant = index.filter(function (e) { return mots.every(function (m) { return e.cle.indexOf(m) >= 0; }); })
        .sort(function (a, b) {                     // communes d'abord, puis ordre alphabétique
          if (a.type !== b.type) return a.type === "commune" ? -1 : 1;
          return a.libelle.localeCompare(b.libelle, "fr");
        }).slice(0, 10);
      actif = -1;
      liste.innerHTML = courant.length ? courant.map(function (e, i) {
        return '<li role="option" data-i="' + i + '"><span><strong>' + echapper(e.libelle) + "</strong><br>" +
          '<span class="tres-discret">' + echapper(e.sous) + "</span></span>" +
          '<span class="type">' + (e.type === "commune" ? "Commune" : "IRIS") + "</span></li>";
      }).join("") : '<li class="vide">Aucun résultat</li>';
      liste.hidden = false;
    }
    function valider(i) {
      const e = courant[i];
      if (!e) return;
      liste.hidden = true;
      champ.value = e.libelle;
      choisir(e);
    }
    champ.addEventListener("input", afficher);
    champ.addEventListener("focus", afficher);
    champ.addEventListener("keydown", function (ev) {
      if (liste.hidden) return;
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        actif = Math.max(0, Math.min(courant.length - 1, actif + (ev.key === "ArrowDown" ? 1 : -1)));
        Array.from(liste.children).forEach(function (li, i) { li.setAttribute("aria-selected", i === actif); });
      } else if (ev.key === "Enter") {
        ev.preventDefault(); valider(actif >= 0 ? actif : 0);
      } else if (ev.key === "Escape") {
        liste.hidden = true;
      }
    });
    liste.addEventListener("mousedown", function (ev) {
      const li = ev.target.closest("li[data-i]");
      if (li) { ev.preventDefault(); valider(+li.dataset.i); }
    });
    champ.addEventListener("blur", function () { setTimeout(function () { liste.hidden = true; }, 150); });
  }

  /* ---------------- Erreurs de chargement ---------------- */
  function afficherErreur(err) {
    if (document.querySelector(".bandeau-erreur")) return;
    const b = document.createElement("div");
    b.className = "bandeau-erreur";
    b.innerHTML = window.location.protocol === "file:"
      ? "Les données ne peuvent pas être lues quand la page est ouverte par double-clic. " +
        "Dans VS Code : clic droit sur <code>index.html</code> → <strong>Open with Live Server</strong>."
      : "Erreur de chargement des données : " + echapper(err && err.message) +
        ". Vérifiez que le dossier <code>data/</code> a été produit par <code>R/08_export_json.R</code>.";
    document.body.prepend(b);
  }

  /* ---------------- Au chargement de chaque page ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    const page = document.body.dataset.page;
    document.querySelectorAll(".nav a").forEach(function (a) {
      if (a.dataset.page === page) { a.classList.add("actif"); a.setAttribute("aria-current", "page"); }
    });
    if (window.location.protocol === "file:") afficherErreur();
    charger("meta").then(function (meta) {
      document.querySelectorAll("[data-date-export]").forEach(function (el) {
        el.textContent = new Date(meta.projet.date_export).toLocaleDateString("fr-FR",
          { day: "numeric", month: "long", year: "numeric" });
      });
    }).catch(function () { /* bandeau déjà affiché */ });
  });

  /* ---------- Mode sombre (pages Accueil et Classification ; la Carte est déjà sombre) ----------
     Icône « Dark mode » (Uicons solid straight, Flaticon : crédit dans le pied de page). */
  function boutonTheme() {
    const nav = document.querySelector(".nav");
    if (!nav || !document.body.classList.contains("theme-clair")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "bouton-theme";
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 300 300" aria-hidden="true"><path fill="currentColor" transform="translate(0 298) scale(1 -1)" d="' +
      'M100 225H63V250H100ZM38 250H0V225H38ZM300 113V38Q300 22 289.0 11.0Q278 0 262 0H163V150H263Q278 150 289.0 139.0Q300 128 300 112ZM235 75Q235 90 244.5 102.0Q254 114 269 118Q257 125 244 125Q223 125 208.5 110.5Q194 96 194.0 75.0Q194 54 208.5 39.5Q223 25 244 25Q257 25 269 32Q254 36 244.5 48.0Q235 60 235 75ZM234 196 252 179 293 220Q300 227 300.0 237.5Q300 248 293 255L252 296L234 279L263 250H125V225H262ZM38 150H138V0H38Q22 0 11.0 11.0Q0 22 0 38V113Q0 128 11.0 139.0Q22 150 38 150ZM45 103 32 111 19 89 32 82Q31 78 31.0 75.0Q31 72 32 68L19 61L32 39L45 47Q50 42 56 40V25H81V40Q88 42 93 47L106 39L118 61L106 68Q106 72 106.0 75.0Q106 78 106 82L118 89L106 111L93 103Q88 108 81 110V125H56V110Q50 108 45 103Z"/></svg>';
    function maj() {
      const sombre = document.documentElement.getAttribute("data-theme") === "sombre";
      const texte = sombre ? "Passer en mode clair" : "Passer en mode sombre";
      b.setAttribute("aria-pressed", sombre); b.setAttribute("aria-label", texte); b.title = texte;
    }
    b.addEventListener("click", function () {
      const t = document.documentElement.getAttribute("data-theme") === "sombre" ? "clair" : "sombre";
      document.documentElement.setAttribute("data-theme", t);
      try { localStorage.setItem("theme", t); } catch (e) { /* navigation privée : choix non mémorisé */ }
      maj();
      document.dispatchEvent(new CustomEvent("theme:change", { detail: t }));
    });
    maj();
    nav.appendChild(b);
  }

  /* ---------- Bandeau cookies : information honnête, un seul bouton ----------
     Le site ne dépose aucun cookie de suivi ; il garde seulement des préférences dans le navigateur. */
  function bandeauCookies() {
    try { if (localStorage.getItem("bandeau-cookies") === "vu") return; } catch (e) { /* on l'affiche */ }
    const aside = document.createElement("aside");
    aside.className = "bandeau-cookies";
    aside.setAttribute("aria-label", "Cookies");
    aside.innerHTML = "<p><strong>Pas de cookie de suivi.</strong> Ce site ne mesure pas votre visite et n'affiche aucune " +
      "publicité. Votre navigateur garde seulement vos préférences d'affichage (thème, ce message). " +
      "Les polices de caractères sont chargées depuis Google Fonts.</p>" +
      '<button type="button" class="bouton">Compris</button>';
    aside.querySelector("button").addEventListener("click", function () {
      try { localStorage.setItem("bandeau-cookies", "vu"); } catch (e) { /* fermé pour cette page seulement */ }
      aside.remove();
    });
    document.body.appendChild(aside);
  }

  /* Flèches des liens (« Voir la carte → ») : isolées pour avancer au survol */
  function flechesLiens(racine) {
    (racine || document).querySelectorAll("a").forEach(function (a) {
      const t = a.lastChild;
      if (!t || t.nodeType !== 3 || !/→\s*$/.test(t.nodeValue) || a.querySelector(".fleche")) return;
      t.nodeValue = t.nodeValue.replace(/\s*→\s*$/, " ");
      const f = document.createElement("span");
      f.className = "fleche"; f.setAttribute("aria-hidden", "true"); f.textContent = "→";
      a.appendChild(f);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    boutonTheme();
    bandeauCookies();
    flechesLiens();
  });

  window.Site = {
    charger: charger, chargerTout: chargerTout,
    nombre: nombre, population: population, valeur: valeur, variable: variable,
    niveauxParCode: niveauxParCode, badge: badge,
    echapper: echapper, normaliser: normaliser, parametre: parametre,
    infobulle: infobulle, barreRepartition: barreRepartition, legendeNiveaux: legendeNiveaux,
    recherche: recherche, afficherErreur: afficherErreur, flechesLiens: flechesLiens
  };
})();
