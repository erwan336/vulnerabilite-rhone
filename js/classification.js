/* =============================================================================
   classification.js - page classification.html
   Onglets : #departement, #metropole, #hors_metropole
   ============================================================================= */
(function () {
  "use strict";
  const S = window.Site;
  let META, CLASSIF, ARBRES = null, stat = "medianes", terrActif = null, kArbre = 5, sensArbre = "horizontal";
  let focusArbre = new Set();   // regroupements mis en avant (clés « 1-2 », « 5 »…), gardés tant qu'ils existent

  S.chargerTout(["meta", "classifications", "arbres"], ["arbres"]).then(function (d) {
    META = d.meta; CLASSIF = d.classifications;
    ARBRES = d.arbres ? d.arbres.territoires : null;
    document.querySelectorAll("#arbre-k button").forEach(function (b) {
      b.addEventListener("click", function () { kArbre = +b.dataset.k; arbre(CLASSIF[terrActif]); });
    });
    // Orientation : classes en lignes (arbre couché à gauche) ou en colonnes (arbre debout au-dessus)
    document.querySelectorAll("#arbre-sens button").forEach(function (b) {
      b.addEventListener("click", function () { sensArbre = b.dataset.sens; arbre(CLASSIF[terrActif]); });
    });

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
    arbre(c);
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

  /* ---------- Arbre de Ward des 5 classes + profils (data/arbres.json) ----------
     Racine à gauche, feuilles à droite ; chaque feuille est alignée avec la ligne de sa classe,
     qui porte une barre par variable (écart à la moyenne en écarts-types, depuis 0). */
  // Lecture de l'arbre, par échelle ({k2} et {k5} : part de variance pour 2 et 5 classes)
  const LECTURES_ARBRE = {
    departement: [
      "<b>Première coupure ({k2} de la variance)</b> : la vulnérabilité <b>très élevée</b> (Vénissieux, Vaulx-en-Velin…) " +
        "se détache de tout le reste, avec des revenus très bas et beaucoup de non-diplômés et d'immigrés.",
      "<b>Très faible</b> et <b>faible</b> sont les classes les plus proches : elles fusionnent en premier, " +
        "puis la classe <b>élevée</b> (profil ouvrier, surtout rural) les rejoint.",
      "La classe <b>modérée</b> (centre dense) reste à part longtemps : c'est la suroccupation des logements, " +
        "pas le revenu, qui la distingue.",
      "Avec 5 classes, la typologie résume <b>{k5}</b> de la variance des 5 indicateurs."
    ],
    metropole: [
      "<b>Première coupure ({k2} de la variance)</b> : la vulnérabilité <b>très élevée</b> (Vénissieux, Vaulx-en-Velin, " +
        "Lyon 8e) contre le reste de la Métropole.",
      "Le reste se partage en deux familles : les quartiers aisés (<b>très faible</b> + <b>faible</b>) et les quartiers " +
        "intermédiaires (<b>modérée</b> + <b>élevée</b>).",
      "<b>Élevée</b> et <b>modérée</b> sont proches : la classe élevée s'en distingue surtout par la suroccupation " +
        "(centre de Lyon, Villeurbanne).",
      "Avec 5 classes, la typologie résume <b>{k5}</b> de la variance des 5 indicateurs."
    ],
    hors_metropole: [
      "<b>Première coupure ({k2} de la variance)</b> : les quartiers urbains défavorisés (<b>élevée</b> + <b>très élevée</b>, " +
        "Villefranche-sur-Saône, Tarare) contre le reste du territoire.",
      "Les 4 IRIS <b>très élevée</b> sont extrêmes : jusqu'à 5 écarts-types au-dessus de la moyenne pour la part d'immigrés " +
        "(barres coupées, valeur indiquée).",
      "<b>Faible</b> et <b>modérée</b> (bourgs ouvriers) sont proches ; la classe <b>très faible</b> (communes aisées comme " +
        "Genas ou Chaponost) s'en sépare ensuite.",
      "Avec 5 classes, la typologie résume <b>{k5}</b> de la variance des 5 indicateurs."
    ]
  };

  function arbre(c) {
    const bloc = document.getElementById("bloc-arbre");
    const a = ARBRES && ARBRES[c.id];
    bloc.hidden = !a;
    if (!a) return;
    const pct = function (k) { return S.nombre(a.part_variance_pct[k], 1) + " %"; };
    document.querySelectorAll("#arbre-k button").forEach(function (b) {
      b.setAttribute("aria-pressed", +b.dataset.k === kArbre);
    });
    document.querySelectorAll("#arbre-sens button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.sens === sensArbre);
    });
    document.getElementById("arbre-sens-texte").textContent = sensArbre === "vertical" ? "en bas" : "à droite";

    // Nœuds : feuilles "1" à "5" (codes de classe), fusions "n1" à "n4" (de la plus basse à la plus haute)
    const noeuds = {}, classes = {};
    c.classes.forEach(function (k) { classes[k.code] = k; noeuds[String(k.code)] = { h: 0, code: k.code }; });
    a.noeuds.forEach(function (n) { noeuds[n.id] = { h: n.hauteur, g: n.gauche, d: n.droite }; });
    const racine = a.noeuds[a.noeuds.length - 1].id;
    // Ordre des classes : toujours de « très faible » à « très élevée » (modérée au milieu).
    // Si l'arbre ne peut pas suivre cet ordre sans retourner ses branches, une branche en croise une autre :
    // le croisement est dessiné en « pont » (voir trait()) et expliqué sous le graphique.
    const ordre = c.classes.map(function (k) { return k.code; }).sort(function (x, y) { return x - y; });
    // Meilleur ordre sans croisement (on retourne les branches d'une fusion pour ranger au mieux) : sert à repérer l'écart
    const ordreSansCroisement = (function ranger(id) {
      const n = noeuds[id];
      if (!n.g) return [n.code];
      const g = ranger(n.g), d = ranger(n.d);
      let malRanges = 0;   // paires (g, d) inversées si g passe avant d
      g.forEach(function (x) { d.forEach(function (y) { if (x > y) malRanges++; }); });
      return malRanges <= g.length * d.length - malRanges ? g.concat(d) : d.concat(g);
    })(racine);

    // Coupure : entre la (5-K)e et la (5-K+1)e fusion ; groupes = classes reliées sous la coupure
    const hs = a.noeuds.map(function (n) { return n.hauteur; });
    const nb = 5 - kArbre;
    const hCoupe = ((nb ? hs[nb - 1] : 0) + hs[nb]) / 2;
    const groupe = {};
    (function marquer(id, g) {
      const n = noeuds[id];
      const gg = g || (n.h < hCoupe ? id : null);
      if (n.g) { marquer(n.g, gg); marquer(n.d, gg); } else groupe[n.code] = gg || id;
    })(racine, null);

    // Échelle des barres : ±2 ou ±3 écarts-types ; au-delà, la barre est coupée et la valeur affichée
    let maxZ = 0;
    c.classes.forEach(function (k) { META.variables.forEach(function (v) { maxZ = Math.max(maxZ, Math.abs(k.z_scores[v.id])); }); });
    const E = Math.min(3, Math.max(2, Math.ceil(maxZ)));

    // Classes sous chaque nœud (pour savoir quelles branches appartiennent à un regroupement mis en avant)
    function feuilles(id) { const n = noeuds[id]; return n.g ? feuilles(n.g).concat(feuilles(n.d)) : [n.code]; }
    const regroupements = [];
    ordre.forEach(function (code) {
      let r = regroupements.find(function (x) { return x.id === groupe[code]; });
      if (!r) { r = { id: groupe[code], codes: [] }; regroupements.push(r); }
      r.codes.push(code);
    });
    regroupements.forEach(function (r) { r.cle = r.codes.slice().sort().join("-"); });
    const fusions = a.noeuds.slice(0, -1).map(function (n) {
      const codes = feuilles(n.id);
      return { id: n.id, codes: codes, cle: codes.slice().sort().join("-") };
    });
    const clesValides = new Set(regroupements.concat(fusions).map(function (r) { return r.cle; }));
    focusArbre = new Set(Array.from(focusArbre).filter(function (k) { return clesValides.has(k); }));

    // Bandes de groupes : alternance à chaque changement de groupe sous la coupure
    const bandes = {};
    let precedentG = null, pariteG = 0;
    ordre.forEach(function (code) {
      const debut = precedentG !== null && groupe[code] !== precedentG;
      if (debut) pariteG = 1 - pariteG;
      precedentG = groupe[code];
      bandes[code] = { parite: pariteG, debut: debut };
    });
    function barre(k, v, vertical) {
      const z = k.z_scores[v.id], l = Math.min(Math.abs(z), E) / E * 50, coupe = Math.abs(z) > E;
      const pos = vertical ? (z >= 0 ? "bottom:50%;height:" : "top:50%;height:") : (z >= 0 ? "left:50%;width:" : "right:50%;width:");
      const val = vertical ? (z >= 0 ? "top:0" : "bottom:0") : (z >= 0 ? "right:0" : "left:0");
      return '<div class="axe-z' + (vertical ? " axe-z-v" : "") + '" data-niv="' + k.code + '" data-var="' + v.id + '">' +
        '<span class="barre-z' + (coupe ? " coupee" : "") + (z < 0 ? " negative" : "") + '" style="background:' + k.couleur + ";" +
        pos + l.toFixed(1) + '%"></span>' +
        (coupe ? '<span class="valeur-coupee" style="' + val + '">' + (z > 0 ? "+" : "") + S.nombre(z, 1) + "</span>" : "") + "</div>";
    }

    /* Classes en lignes : arbre couché à gauche (racine à gauche, feuilles à droite) */
    // Segment droit (x1,y1)-(x2,y2) ; le halo est raccourci aux deux bouts pour ne pas entamer les jonctions
    function trace(t) { return "M" + t.x1 + "," + t.y1 + "L" + t.x2 + "," + t.y2; }
    function traits(segments) {
      return segments.map(function (t) {
        const lx = t.x2 - t.x1, ly = t.y2 - t.y1, l = Math.hypot(lx, ly), r = 6;
        if (l <= 2 * r) return "";
        const ux = lx / l * r, uy = ly / l * r;
        return '<path class="halo" d="' + trace({ x1: t.x1 + ux, y1: t.y1 + uy, x2: t.x2 - ux, y2: t.y2 - uy }) + '"/>';
      }).join("") +
        segments.map(function (t) {
          return '<path class="branche' + (t.sous ? " sous-coupe" : "") + '" d="' + trace(t) + '" data-codes="' + t.codes.join(" ") + '"' +
            (t.coul ? ' style="stroke:' + t.coul + '"' : "") + ">" + (t.titre ? "<title>" + t.titre + "</title>" : "") + "</path>";
        }).join("");
    }

    // Cases posées sur la ligne de coupure, à l'endroit où elle croise la branche de chaque regroupement
    // (left / top : position en % de la zone de l'arbre)
    function coches(position) {
      return regroupements.map(function (r) {
        const p = position(r), noms = r.codes.map(function (cd) { return classes[cd].niveau; }).join(" + ");
        return '<label class="coche-coupure" style="left:' + p.left.toFixed(2) + "%;top:" + p.top.toFixed(2) + '%" title="Mettre en avant : ' +
          S.echapper(noms) + '"><input type="checkbox" value="' + r.cle + '"' + (focusArbre.has(r.cle) ? " checked" : "") +
          ' aria-label="Mettre en avant : ' + S.echapper(noms) + '"><span aria-hidden="true"></span></label>';
      }).join("");
    }

    // Cases rondes sur les points de fusion : mettent en avant toutes les classes que la fusion réunit
    function cochesFusions(position) {
      // Une fusion juste sous la coupure a déjà sa case carrée (mêmes classes) : pas de doublon
      const clesCoupure = new Set(regroupements.map(function (r) { return r.cle; }));
      return fusions.filter(function (f) { return !clesCoupure.has(f.cle); }).map(function (f) {
        const p = position(f), noms = f.codes.slice().sort().map(function (cd) { return classes[cd].niveau; }).join(" + ");
        return '<label class="coche-fusion" style="left:' + p.left.toFixed(2) + "%;top:" + p.top.toFixed(2) + '%" title="Mettre en avant la fusion : ' +
          S.echapper(noms) + '"><input type="checkbox" value="' + f.cle + '"' + (focusArbre.has(f.cle) ? " checked" : "") +
          ' aria-label="Mettre en avant la fusion : ' + S.echapper(noms) + '"><span aria-hidden="true"></span></label>';
      }).join("");
    }

    function dessinHorizontal() {
      const L = 64, W = 260, M = 12, hMax = hs[hs.length - 1];   // 260 px : fusions de hauteurs proches bien séparées
      const x = function (h) { return M + (1 - h / hMax) * (W - 2 * M); };
      const pos = {};
      ordre.forEach(function (code, i) { pos[String(code)] = { y: (i + 0.5) * L }; });
      let dessin = "";
      a.noeuds.forEach(function (n) {
        const g = pos[n.gauche], d = pos[n.droite], xn = x(n.hauteur), sous = n.hauteur < hCoupe;
        pos[n.id] = { y: (g.y + d.y) / 2 };
        const segments = [[n.gauche, g], [n.droite, d]].map(function (e) {
          // Branche vers une classe restée seule sous la coupure : couleur de la classe
          const enfant = noeuds[e[0]];
          return { x1: xn, y1: e[1].y, x2: x(enfant.h), y2: e[1].y, sous: sous, codes: feuilles(e[0]),
                   coul: enfant.code && !sous ? classes[enfant.code].couleur : null };
        });
        segments.push({ x1: xn, y1: g.y, x2: xn, y2: d.y, sous: sous, codes: feuilles(n.id) });
        dessin += traits(segments) + '<circle class="noeud" data-codes="' + feuilles(n.id).join(" ") + '" cx="' + xn + '" cy="' + pos[n.id].y + '" r="3"><title>Fusion à la hauteur ' +
          S.nombre(n.hauteur, 1) + "</title></circle>";
      });
      const xr = x(hMax), yr = pos[racine].y, xc = x(hCoupe);
      // Cases trop proches (branches voisines, croisement) : la case de la branche la plus longue glisse vers la droite,
      // en restant sur sa branche
      const posCoches = regroupements.map(function (r) {
        return { cle: r.cle, x: xc, y: pos[String(r.id)].y, xFin: x(noeuds[String(r.id)].h) };
      }).sort(function (p, q) { return p.y - q.y; });
      for (let i = 1; i < posCoches.length; i++) {
        const p = posCoches[i - 1], q = posCoches[i];
        if (q.y - p.y < 20) { const m = q.xFin > p.xFin ? q : p; m.x = Math.min(xc + 22, m.xFin - 6); }
      }
      const xCoche = {};
      posCoches.forEach(function (p) { xCoche[p.cle] = p.x; });
      dessin = '<path class="branche" d="M' + (xr - 8) + "," + yr + "H" + xr + '"/>' + dessin +
        '<line class="coupure" x1="' + xc + '" y1="2" x2="' + xc + '" y2="' + (5 * L - 2) + '"/>' +
        '<text class="coupure-texte" x="' + (xc + 4) + '" y="12">coupure</text>';
      const svg = '<svg class="arbre-svg" width="' + W + '" height="' + 5 * L + '" viewBox="0 0 ' + W + " " + 5 * L +
        '" role="img" aria-label="Arbre de classification des 5 classes">' + dessin + "</svg>";

      let h = '<div class="arbre-entete arbre-col-arbre"></div><div class="arbre-entete">Classe</div>' +
        META.variables.map(function (v) {
          return '<div class="arbre-entete arbre-var"><span>' + S.echapper(v.libelle) + "</span>" +
            '<span class="graduation"><i>−' + E + "</i><i>0</i><i>+" + E + "</i></span></div>";
        }).join("") +
        '<div class="arbre-col-arbre" style="grid-row: 2 / span 5"><div class="arbre-zone" style="width:' + W + "px;height:" + 5 * L + 'px">' +
        svg + coches(function (r) { return { left: xCoche[r.cle] / W * 100, top: pos[String(r.id)].y / (5 * L) * 100 }; }) +
        cochesFusions(function (f) { return { left: x(noeuds[f.id].h) / W * 100, top: pos[f.id].y / (5 * L) * 100 }; }) + "</div></div>";
      ordre.forEach(function (code, i) {
        const k = classes[code];
        const cls = "arbre-cellule groupe-" + bandes[code].parite + (bandes[code].debut ? " debut-groupe" : "");
        h += '<div class="' + cls + ' arbre-classe" data-code="' + code + '" style="grid-row:' + (i + 2) + '"><span class="pastille-couleur" style="background:' +
          k.couleur + '"></span><span>' + S.echapper(k.niveau) + "<small>" + S.nombre(k.n_iris) + " IRIS</small></span></div>" +
          META.variables.map(function (v) {
            return '<div class="' + cls + '" data-code="' + code + '" style="grid-row:' + (i + 2) + '">' + barre(k, v, false) + "</div>";
          }).join("");
      });
      return h;
    }

    /* Classes en colonnes : arbre debout au-dessus (racine en haut, feuilles en bas), barres verticales */
    function dessinVertical() {
      const W = 500, H = 180, M = 12, hMax = hs[hs.length - 1], pas = W / 5;
      const y = function (hh) { return M + (1 - hh / hMax) * (H - 2 * M); };
      const pos = {};
      ordre.forEach(function (code, i) { pos[String(code)] = { x: (i + 0.5) * pas }; });
      let dessin = "";
      a.noeuds.forEach(function (n) {
        const g = pos[n.gauche], d = pos[n.droite], yn = y(n.hauteur), sous = n.hauteur < hCoupe;
        pos[n.id] = { x: (g.x + d.x) / 2 };
        const titre = "Fusion à la hauteur " + S.nombre(n.hauteur, 1);
        const segments = [[n.gauche, g], [n.droite, d]].map(function (e) {
          const enfant = noeuds[e[0]];
          return { x1: e[1].x, y1: yn, x2: e[1].x, y2: y(enfant.h), sous: sous, titre: titre, codes: feuilles(e[0]),
                   coul: enfant.code && !sous ? classes[enfant.code].couleur : null };
        });
        segments.push({ x1: g.x, y1: yn, x2: d.x, y2: yn, sous: sous, codes: feuilles(n.id) });
        dessin += traits(segments);
      });
      const yc = y(hCoupe);
      dessin = '<path class="branche" d="M' + pos[racine].x + "," + (y(hMax) - 8) + "V" + y(hMax) + '"/>' + dessin +
        '<line class="coupure" x1="2" y1="' + yc + '" x2="' + (W - 2) + '" y2="' + yc + '"/>';
      // SVG étiré sur la largeur des colonnes (traits d'épaisseur constante) ; « coupure » en HTML pour ne pas être déformé
      let h = '<div class="arbre-v-arbre"><svg class="arbre-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" ' +
        'role="img" aria-label="Arbre de classification des 5 classes">' + dessin + "</svg>" +
        '<span class="coupure-etiquette" style="top:' + (yc / H * 100).toFixed(1) + '%">coupure</span>' +
        coches(function (r) { return { left: pos[String(r.id)].x / W * 100, top: yc / H * 100 }; }) +
        cochesFusions(function (f) { return { left: pos[f.id].x / W * 100, top: y(noeuds[f.id].h) / H * 100 }; }) + "</div>";
      h += '<div class="arbre-entete arbre-v-coin">Classe</div>';
      ordre.forEach(function (code, i) {
        const k = classes[code], bd = bandes[code];
        h += '<div class="arbre-cellule arbre-classe arbre-classe-v groupe-' + bd.parite + (bd.debut ? " debut-groupe-v" : "") +
          '" data-code="' + code + '" style="grid-column:' + (i + 2) + '"><span class="pastille-couleur" style="background:' + k.couleur + '"></span>' +
          "<span>" + S.echapper(k.niveau) + "<small>" + S.nombre(k.n_iris) + " IRIS</small></span></div>";
      });
      META.variables.forEach(function (v, r) {
        h += '<div class="arbre-entete arbre-var-v" style="grid-row:' + (r + 3) + '"><span>' + S.echapper(v.libelle) + "</span>" +
          '<span class="graduation-v"><i>+' + E + "</i><i>0</i><i>−" + E + "</i></span></div>";
        ordre.forEach(function (code, i) {
          const bd = bandes[code];
          h += '<div class="arbre-cellule groupe-' + bd.parite + (bd.debut ? " debut-groupe-v" : "") + '" data-code="' + code + '" style="grid-row:' + (r + 3) +
            ";grid-column:" + (i + 2) + '">' + barre(classes[code], v, true) + "</div>";
        });
      });
      return h;
    }

    const h = sensArbre === "vertical" ? dessinVertical() : dessinHorizontal();
    const grille = document.getElementById("arbre-grille");
    grille.classList.toggle("vertical", sensArbre === "vertical");
    grille.innerHTML = h;

    // « Mettre en avant » : cases sur la ligne de coupure (une par regroupement) ; les classes non cochées s'estompent
    const zoneFocus = document.getElementById("arbre-focus");
    zoneFocus.innerHTML = '<span class="arbre-etiquette">Cochez une branche sur la coupure (carré) ou une fusion (rond) pour la mettre en avant.</span>' +
      '<button type="button" class="tout-afficher"' + (focusArbre.size ? "" : " hidden") + ">Tout réafficher</button>";
    function appliquerFocus() {
      const actifs = new Set();
      focusArbre.forEach(function (cle) { cle.split("-").forEach(function (cd) { actifs.add(cd); }); });
      const filtre = actifs.size > 0;
      grille.classList.toggle("avec-focus", filtre);
      grille.querySelectorAll("[data-code]").forEach(function (el) {
        el.classList.toggle("estompe", filtre && !actifs.has(el.dataset.code));
      });
      grille.querySelectorAll("[data-codes]").forEach(function (el) {
        el.classList.toggle("estompe", filtre && !el.dataset.codes.split(" ").some(function (cd) { return actifs.has(cd); }));
      });
      zoneFocus.querySelector(".tout-afficher").hidden = !filtre;
    }
    const cases = grille.querySelectorAll(".coche-coupure input, .coche-fusion input");
    cases.forEach(function (cb) {
      cb.addEventListener("change", function () {
        if (cb.checked) focusArbre.add(cb.value); else focusArbre.delete(cb.value);
        // Même regroupement coché ailleurs (case de coupure et case de fusion identiques) : on synchronise
        cases.forEach(function (autre) { if (autre.value === cb.value) autre.checked = cb.checked; });
        appliquerFocus();
      });
    });
    zoneFocus.querySelector(".tout-afficher").addEventListener("click", function () {
      focusArbre.clear();
      cases.forEach(function (cb) { cb.checked = false; });
      appliquerFocus();
    });
    appliquerFocus();
    grille.querySelectorAll(".axe-z").forEach(function (el) {
      S.infobulle(el, function () {
        const k = classes[el.dataset.niv], v = el.dataset.var, z = k.z_scores[v];
        return "<strong>" + S.echapper(k.niveau_long) + "</strong><br>" + S.echapper(S.variable(META, v).libelle) + " : " +
          (z > 0 ? "+" : "") + S.nombre(z, 2) + " écart-type<br>moyenne " + S.valeur(META, v, k.moyennes[v]) + " contre " +
          S.valeur(META, v, c.ensemble.moyennes[v]) + " sur le territoire";
      });
    });

    document.getElementById("arbre-variance").innerHTML =
      '<strong>' + pct(kArbre) + "</strong><span>de la variance expliquée avec " + kArbre + " classes</span>" +
      '<span class="jauge"><i style="width:' + a.part_variance_pct[kArbre] + '%"></i></span>';
    // Croisement de branches (ordre strict impossible sans croiser) : on dit pourquoi
    const inversions = [];
    for (let i = 0; i + 1 < ordreSansCroisement.length; i++) {
      if (ordreSansCroisement[i] > ordreSansCroisement[i + 1]) {
        inversions.push([classes[ordreSansCroisement[i]], classes[ordreSansCroisement[i + 1]]]);
      }
    }
    const noteOrdre = document.getElementById("arbre-ordre");
    noteOrdre.hidden = !inversions.length;
    noteOrdre.innerHTML = inversions.map(function (p) {
      return "Pour garder les classes de « très faible » à « très élevée », la branche de <b>" + S.echapper(p[1].niveau) +
        "</b> passe par-dessus celle de <b>" + S.echapper(p[0].niveau) + "</b> (croisement dessiné en pont) : ici, la classe " +
        S.echapper(p[0].niveau.toLowerCase()) + " rejoint les classes plus favorisées avant la classe " +
        S.echapper(p[1].niveau.toLowerCase()) + ".";
    }).join(" ");

    document.getElementById("arbre-lecture").innerHTML = (LECTURES_ARBRE[c.id] ? "<ul>" + LECTURES_ARBRE[c.id].map(function (t) {
      return "<li>" + t.replace("{k2}", pct(2)).replace("{k5}", pct(5)) + "</li>";
    }).join("") + "</ul>" : "");
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
