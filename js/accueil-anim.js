/* =============================================================================
   accueil-anim.js - animations de la page d'accueil (GSAP 3.13 + ScrollTrigger + SplitText, lib/gsap)
   - héros : titre qui monte ligne par ligne, texte et carte en cascade, photo en léger parallaxe
   - mini-carte : les IRIS apparaissent en onde depuis Lyon
   - chiffres clés : compteur ; barres des territoires qui se déploient (pas de fondu générique au défilement)
   Le <head> pose la classe "anim-gsap" (sauf si l'utilisateur limite les animations) ;
   sans GSAP ou en cas d'erreur, on la retire et la page s'affiche normalement.
   ============================================================================= */
(function () {
  "use strict";
  const racine = document.documentElement;
  if (!racine.classList.contains("anim-gsap")) return;
  if (!window.gsap || !window.ScrollTrigger || !window.SplitText) { racine.classList.remove("anim-gsap"); return; }
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const montrerTout = function () { racine.classList.remove("anim-gsap"); };
  const surEcranLarge = window.matchMedia("(min-width: 981px)").matches;

  /* ---------- Héros : entrée en cascade (une fois les polices chargées, pour couper les bonnes lignes) ---------- */
  function intro() {
    // Titre découpé en lignes et gardé découpé (pas de saut de mise en page à la fin) ;
    // autoSplit recalcule les lignes si la largeur change, sans rejouer l'animation.
    SplitText.create(".heros h1", {
      type: "lines", mask: "lines", autoSplit: true,
      onSplit: function (self) {
        return gsap.from(self.lines, { yPercent: 105, duration: 1, stagger: .09, ease: "power3.out", delay: .25 });
      }
    });
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".heros .kicker", { y: 14, autoAlpha: 0, duration: .6 })
      .from(".heros .accroche", { y: 22, autoAlpha: 0, duration: .8 }, "-=.6")
      .from([".heros .recherche", ".heros .actions"], { y: 22, autoAlpha: 0, duration: .7, stagger: .1 }, "-=.55")
      .from(".heros-carte", { x: surEcranLarge ? 50 : 0, y: surEcranLarge ? 0 : 30, autoAlpha: 0, duration: 1.1 }, .25);
    montrerTout();   // les états de départ sont déjà appliqués : plus de risque de clignement
  }

  /* ---------- Défilement : parallaxe, en-tête, titres de section ---------- */
  function defilement() {
    if (surEcranLarge) {
      // La photo de Lyon glisse plus lentement que la page, la carte un peu plus vite
      gsap.fromTo(".heros", { backgroundPosition: "0% 0%, 70% 55%" }, {
        backgroundPosition: "0% 0%, 70% 85%", ease: "none",
        scrollTrigger: { trigger: ".heros", start: "top top", end: "bottom top", scrub: true }
      });
      gsap.to(".heros-carte", {
        y: -50, ease: "none",
        scrollTrigger: { trigger: ".heros", start: "top top", end: "bottom top", scrub: true }
      });
    }
    // En-tête : ombre légère dès que la page défile
    ScrollTrigger.create({ start: 8, end: "max", toggleClass: { targets: ".entete", className: "defile" } });

  }

  /* ---------- Contenu chargé : chiffres, cartes, étapes ---------- */
  function contenu() {
    // Chiffres clés : cascade + compteur de 0 à la valeur ("1,9 M", "752"…)
    document.querySelectorAll("#chiffres dt").forEach(function (el) {
      const final = el.textContent;
      const m = final.match(/^([\d\s  ]*\d(?:,\d+)?)(.*)$/);
      if (!m) return;
      const dec = (m[1].split(",")[1] || "").length;
      const o = { v: 0 };
      gsap.to(o, {
        v: parseFloat(m[1].replace(/[\s  ]/g, "").replace(",", ".")), duration: 1.6, ease: "power2.out",
        scrollTrigger: { trigger: "#chiffres", start: "top 88%", once: true },
        onUpdate: function () {
          el.textContent = o.v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[2];
        },
        onComplete: function () { el.textContent = final; }
      });
    });

    // Barres de répartition des territoires : les segments se déploient quand la carte arrive à l'écran
    // (animation des données elles-mêmes ; les blocs, eux, ne font pas de fondu au défilement)
    gsap.utils.toArray("#territoires .repartition").forEach(function (barre) {
      gsap.from(barre.children, { scaleX: 0, transformOrigin: "left center", duration: .7, stagger: .07, ease: "power2.out",
        scrollTrigger: { trigger: barre, start: "top 90%", once: true } });
    });
    ScrollTrigger.refresh();
  }

  /* ---------- Mini-carte : les IRIS apparaissent en onde depuis le cœur de Lyon ---------- */
  function miniCarte() {
    const chemins = gsap.utils.toArray("#mini-carte path");
    if (!chemins.length) return;
    const boites = chemins.map(function (p) { return p.getBBox(); });
    // Cœur de l'onde : centre des 80 plus petits IRIS (le centre dense de Lyon)
    const petits = boites.slice().sort(function (a, b) { return a.width * a.height - b.width * b.height; }).slice(0, 80);
    const cx = petits.reduce(function (s, b) { return s + b.x + b.width / 2; }, 0) / petits.length;
    const cy = petits.reduce(function (s, b) { return s + b.y + b.height / 2; }, 0) / petits.length;
    const dist = boites.map(function (b) { return Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy); });
    const dMax = Math.max.apply(null, dist);
    gsap.from(chemins, {
      scale: 0, autoAlpha: 0, transformOrigin: "50% 50%", duration: .55, ease: "back.out(1.7)",
      delay: function (i) { return .2 + dist[i] / dMax * 1.3; },
      onComplete: function () { gsap.set(chemins, { clearProps: "transform,opacity,visibility" }); }
    });
    ScrollTrigger.refresh();
  }

  try {
    const pret = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    pret.then(function () {
      try { intro(); defilement(); } catch (e) { montrerTout(); }
    });
    document.addEventListener("accueil:pret", function () { try { contenu(); } catch (e) { montrerTout(); } });
    document.addEventListener("accueil:minicarte", function () { try { miniCarte(); } catch (e) { /* carte déjà visible */ } });
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });   // images chargées : positions à jour
  } catch (e) {
    montrerTout();
  }
})();
