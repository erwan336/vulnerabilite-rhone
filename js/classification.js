/* =============================================================================
   classification.js - page classification.html
   Onglets : #departement, #metropole, #hors_metropole
   ============================================================================= */
(function () {
  "use strict";
  const S = window.Site;
  let META, CLASSIF, stat = "medianes", terrActif = null;

  S.chargerTout(["meta", "classifications"]).then(function (d) {
    META = d.meta; CLASSIF = d.classifications;

    // Onglets
    const onglets = document.getElementById("onglets");
    META.territoires.forEach(function (t) {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.dataset.terr = t.id;
      b.textContent = t.titre_court;
      b.addEventListener("click", function () { history.replaceState(null, "", "#" + t.id); afficher(t.id); });
      onglets.appendChild(b);
    });
    document.querySelectorAll("#commutateur-stat button").forEach(function (b) {
      b.addEventListener("click", function () {
        stat = b.dataset.stat;
        document.querySelectorAll("#commutateur-stat button").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b);
        });
        tableProfils(CLASSIF[terrActif]);
      });
    });
    window.addEventListener("hashchange", function () { afficher(terrDepuisHash()); });
    afficher(terrDepuisHash());
  }).catch(function () {});

  function terrDepuisHash() {
    const h = window.location.hash.replace("#", "");
    return CLASSIF[h] ? h : META.territoires[0].id;
  }

  function afficher(id) {
    terrActif = id;
    const c = CLASSIF[id];
    document.querySelectorAll("#onglets button").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.terr === id);
    });
    kpi(c);
    document.getElementById("avertissement").textContent = c.avertissement;
    S.barreRepartition(document.getElementById("barre-iris"), c.classes.map(function (k) { return k.n_iris; }), META, "IRIS");
    S.barreRepartition(document.getElementById("barre-pop"), c.classes.map(function (k) { return k.population; }), META, "habitants");
    document.getElementById("legende-rep").innerHTML = S.legendeNiveaux(META);
    cartesClasses(c);
    tableProfils(c);
    tableZ(c);
    croisement(c);
    histoACP(c);
    histoK(c);
    tableACP(c);
  }

  /* ---------- Chiffres clés ---------- */
  function kpi(c) {
    const t = [
      { v: S.nombre(c.n_iris.classes), l: "IRIS classés sur " + S.nombre(c.n_iris.total) },
      { v: S.population(c.population_classee), l: "habitants dans les IRIS classés" },
      { v: S.nombre(c.cah.silhouette_moyenne, 3), l: "silhouette moyenne (K = " + c.cah.K + ")" },
      { v: S.nombre(c.acp.inertie_axes_retenus_pct, 1) + " %", l: "d'inertie sur les " + c.acp.n_axes_retenus + " axes retenus" }
    ];
    document.getElementById("kpi").innerHTML = t.map(function (x) {
      return '<div class="carte-info tuile"><div class="valeur">' + x.v + '</div><div class="libelle">' + x.l + "</div></div>";
    }).join("");
  }

  /* ---------- Cartes des classes ---------- */
  function cartesClasses(c) {
    document.getElementById("classes").innerHTML = c.classes.map(function (k) {
      const st = k.stabilite;
      return '<article class="carte-info classe" style="--couleur-classe:' + k.couleur + '">' +
        '<div class="profil">' + S.echapper(k.profil) + "</div>" +
        "<h3>" + S.echapper(k.niveau_long) + "</h3>" +
        '<p class="nom">' + S.echapper(k.nom) + "</p>" +
        '<div class="mini-stats">' +
        "<div><strong>" + S.nombre(k.n_iris) + "</strong><span>IRIS<br>" + S.nombre(k.part_iris_pct, 1) + " % du total</span></div>" +
        "<div><strong>" + S.nombre(k.population) + "</strong><span>habitants<br>" + S.nombre(k.part_population_pct, 1) + " % du total</span></div>" +
        "</div>" +
        (st ? '<div class="bloc-stabilite" title="Indice de Jaccard moyen sur ' + (META.methode.bootstrap_tirages || "") +
          ' tirages bootstrap"><span>Stabilité</span><span class="stabilite ' + S.echapper(st.qualification) + '">' +
          S.echapper(st.qualification) + " · " + S.nombre(st.jaccard, 2) + "</span></div>" : "") +
        '<p class="titre-communes">Communes principales (IRIS)</p>' +
        '<ul class="communes" style="margin-top:4px">' +
        k.communes_principales.slice(0, 3).map(function (x) {
          return "<li><span>" + S.echapper(x.commune.replace(/ Arrondissement$/, "")) + "</span><span>" + x.n_iris + "</span></li>";
        }).join("") + "</ul>" +
        '<p style="margin:14px 0 0"><a href="carte.html?territoire=' + terrActif + "&niveau=" + k.code + '">Voir sur la carte →</a></p>' +
        "</article>";
    }).join("");
  }

  /* ---------- Tableau des profils ---------- */
  function enteteVariables() {
    return META.variables.map(function (v) {
      return "<th scope=\"col\">" + S.echapper(v.libelle) + " (" + S.echapper(v.unite) + ")</th>";
    }).join("");
  }
  function tableProfils(c) {
    const lignes = c.classes.map(function (k) {
      return "<tr><td><span class=\"pastille-couleur\" style=\"background:" + k.couleur + "\"></span>" +
        S.echapper(k.niveau) + '</td><td>' + S.nombre(k.n_iris) + "</td>" +
        META.variables.map(function (v) { return "<td>" + S.valeur(META, v.id, k[stat][v.id]) + "</td>"; }).join("") + "</tr>";
    });
    lignes.push('<tr class="ensemble"><td>Ensemble du territoire</td><td>' + S.nombre(c.ensemble.n_iris) + "</td>" +
      META.variables.map(function (v) { return "<td>" + S.valeur(META, v.id, c.ensemble[stat][v.id]) + "</td>"; }).join("") + "</tr>");
    document.getElementById("table-profils").innerHTML =
      "<caption>" + (stat === "medianes" ? "Médianes" : "Moyennes") + " des IRIS de chaque classe - " + S.echapper(c.titre) + "</caption>" +
      "<thead><tr><th scope=\"col\">Vulnérabilité</th><th scope=\"col\">IRIS</th>" + enteteVariables() + "</tr></thead>" +
      "<tbody>" + lignes.join("") + "</tbody>";
  }

  /* ---------- Heatmap des z-scores ---------- */
  function couleurZ(z) {
    const a = Math.min(Math.abs(z) / 2.5, 1) * 0.85;
    const rgb = getComputedStyle(document.documentElement).getPropertyValue(z >= 0 ? "--div-haut" : "--div-bas");
    return "rgba(" + rgb.trim() + "," + a.toFixed(2) + ")";
  }
  function tableZ(c) {
    const corps = c.classes.map(function (k) {
      return "<tr><td><span class=\"pastille-couleur\" style=\"background:" + k.couleur + "\"></span>" + S.echapper(k.niveau) + "</td>" +
        META.variables.map(function (v) {
          const z = k.z_scores[v.id];
          return '<td class="cellule-z" style="background:' + couleurZ(z) + '" data-z="' + z + '" data-var="' + v.id +
            '" data-niv="' + S.echapper(k.niveau_long) + '">' + (z > 0 ? "+" : "") + S.nombre(z, 2) + "</td>";
        }).join("") + "</tr>";
    }).join("");
    const table = document.getElementById("table-z");
    table.innerHTML = "<caption>(moyenne de la classe − moyenne du territoire) / écart-type du territoire</caption>" +
      "<thead><tr><th scope=\"col\">Vulnérabilité</th>" + enteteVariables() + "</tr></thead><tbody>" + corps + "</tbody>";
    table.querySelectorAll("td.cellule-z").forEach(function (td) {
      S.infobulle(td, function () {
        const k = c.classes.find(function (x) { return x.niveau_long === td.dataset.niv; });
        const v = td.dataset.var;
        return "<strong>" + S.echapper(td.dataset.niv) + "</strong><br>" + S.echapper(S.variable(META, v).libelle) +
          " : moyenne " + S.valeur(META, v, k.moyennes[v]) + " contre " + S.valeur(META, v, c.ensemble.moyennes[v]) +
          " sur le territoire";
      });
    });
  }

  /* ---------- Croisement avec le département ---------- */
  function croisement(c) {
    const bloc = document.getElementById("bloc-croisement");
    const cr = c.croisement_departement;
    if (!cr) { bloc.hidden = true; return; }
    bloc.hidden = false;
    const niv = S.niveauxParCode(META);
    const K = c.classes.length;
    const m = {}; let max = 0;
    cr.cellules.forEach(function (x) { m[x.niveau_departement + "_" + x.niveau_territoire] = x.n_iris; max = Math.max(max, x.n_iris); });
    document.getElementById("croisement-intro").innerHTML =
      "Niveau de chaque IRIS dans la classification du <strong>département entier</strong> (lignes) et dans celle de " +
      "<strong>" + S.echapper(c.titre) + "</strong> (colonnes). " + S.nombre(cr.meme_niveau_pct, 1) +
      " % des IRIS gardent le même niveau (cases encadrées).";
    let h = "<thead><tr><th scope=\"col\">Département ↓ / " + S.echapper(c.titre_court) + " →</th>";
    for (let j = 1; j <= K; j++) h += "<th scope=\"col\"><span class=\"pastille-couleur\" style=\"background:" + niv[j].couleur + "\"></span>" + S.echapper(niv[j].libelle) + "</th>";
    h += "</tr></thead><tbody>";
    for (let i = 1; i <= K; i++) {
      h += "<tr><th scope=\"row\" style=\"text-align:left\"><span class=\"pastille-couleur\" style=\"background:" + niv[i].couleur + "\"></span>" + S.echapper(niv[i].libelle) + "</th>";
      for (let j = 1; j <= K; j++) {
        const n = m[i + "_" + j] || 0;
        const a = n ? (0.12 + 0.7 * n / max).toFixed(2) : 0;
        h += '<td class="cellule-croisement' + (i === j ? " diagonale" : "") + '" style="background:rgba(59,130,246,' + a + ')">' + (n || "·") + "</td>";
      }
      h += "</tr>";
    }
    document.getElementById("table-croisement").innerHTML = h + "</tbody>";
  }

  /* ---------- Petits histogrammes (HTML) ---------- */
  function histo(conteneur, barres, max, seuil) {
    let h = '<div class="histo">';
    if (seuil) h += '<div class="seuil" style="bottom:' + (100 * seuil.valeur / max) + '%"><span>' + seuil.texte + "</span></div>";
    barres.forEach(function (b, i) {
      h += '<div class="colonne"><span class="valeur-barre">' + b.texte + '</span><div class="barre ' + b.classe +
        '" data-i="' + i + '" style="height:' + Math.max(1, 100 * b.valeur / max) + '%"></div></div>';
    });
    h += '</div><div class="histo-etiquettes">' + barres.map(function (b) { return "<span>" + b.etiquette + "</span>"; }).join("") + "</div>";
    conteneur.innerHTML = h;
    conteneur.querySelectorAll(".barre").forEach(function (el) {
      S.infobulle(el, barres[+el.dataset.i].infobulle);
    });
  }
  function histoACP(c) {
    const vp = c.acp.valeurs_propres;
    const kaiser = 100 / vp.length;
    histo(document.getElementById("histo-acp"), vp.map(function (a) {
      return {
        valeur: a.inertie_pct, texte: S.nombre(a.inertie_pct, 1) + " %", etiquette: "Axe " + a.axe,
        classe: a.axe <= c.acp.n_axes_retenus ? "retenu" : "non-retenu",
        infobulle: "<strong>Axe " + a.axe + "</strong><br>Valeur propre " + S.nombre(a.valeur_propre, 2) +
          "<br>Inertie " + S.nombre(a.inertie_pct, 1) + " % (cumulée " + S.nombre(a.inertie_cumulee_pct, 1) + " %)"
      };
    }), Math.max.apply(null, vp.map(function (a) { return a.inertie_pct; })) * 1.15,
    { valeur: kaiser, texte: "Kaiser (" + S.nombre(kaiser, 0) + " %)" });
  }
  function histoK(c) {
    const ks = c.cah.comparaison_K;
    histo(document.getElementById("histo-k"), ks.map(function (k) {
      return {
        valeur: k.silhouette, texte: S.nombre(k.silhouette, 3), etiquette: "K = " + k.K,
        classe: k.K === c.cah.K ? "retenu" : "non-retenu",
        infobulle: "<strong>K = " + k.K + "</strong><br>Silhouette " + S.nombre(k.silhouette, 3) +
          "<br>Classe la plus petite : " + k.classe_min + " IRIS<br>La plus grande : " + k.classe_max + " IRIS"
      };
    }), Math.max.apply(null, ks.map(function (k) { return k.silhouette; })) * 1.2);
  }

  /* ---------- Contributions / corrélations ---------- */
  function tableACP(c) {
    const n = c.acp.n_axes_retenus;
    let h = "<caption>Contribution de chaque variable aux axes retenus (%) et corrélation avec l'axe</caption><thead><tr><th scope=\"col\">Variable</th>";
    for (let a = 1; a <= n; a++) h += "<th scope=\"col\">Contribution axe " + a + "</th>";
    for (let a = 1; a <= n; a++) h += "<th scope=\"col\">Corrélation axe " + a + "</th>";
    h += "</tr></thead><tbody>";
    c.acp.variables.forEach(function (v) {
      h += "<tr><td>" + S.echapper(S.variable(META, v.variable) ? S.variable(META, v.variable).libelle : v.variable) + "</td>";
      for (let a = 1; a <= n; a++) h += "<td>" + S.nombre(v["contribution_axe" + a], 1) + " %</td>";
      for (let a = 1; a <= n; a++) h += "<td>" + S.nombre(v["correlation_axe" + a], 2) + "</td>";
      h += "</tr>";
    });
    document.getElementById("table-acp").innerHTML = h + "</tbody>";
  }
})();
