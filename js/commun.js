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
    actions:         "data/actions.geojson"         // lieux d'action 2022-2024 (fichier prévisionnel)
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

  window.Site = {
    charger: charger, chargerTout: chargerTout,
    nombre: nombre, population: population, valeur: valeur, variable: variable,
    niveauxParCode: niveauxParCode, badge: badge,
    echapper: echapper, normaliser: normaliser, parametre: parametre,
    infobulle: infobulle, barreRepartition: barreRepartition, legendeNiveaux: legendeNiveaux,
    recherche: recherche, afficherErreur: afficherErreur
  };
})();
