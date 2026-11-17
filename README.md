# Désamorce! 3D

Version 3D de *Désamorce!* : une bombe fictive en 3D, six faces, trois niveaux et un mode à deux. Tout est fictif.
Projet distinct de la version 2D ([passcool17/desamorce](https://github.com/passcool17/desamorce)), qui reste inchangée.

**Jouer :** https://passcool17.github.io/desamorce-3d/ — **Manuel :** https://passcool17.github.io/desamorce-3d/manuel.html

- `logic.js` : génération des bombes (seed 20 bits → code `N-XXXXC`), niveaux, solveur, manuel du mode duo.
- `js/main.js` : scène, gestes, HUD, écrans ; `js/bomb-model.js` : bombe procédurale (noms de nœuds du futur GLB) ; `js/faces.js` : faces dessinées sur canvas ; `js/fx.js` : particules instanciées ; `js/audio.js` : sons WebAudio.
- `manuel.html` + `js/manual.js` : manuel du lecteur, calculé à partir du code (hors ligne).
- `vendor/` : three.js 0.187.0, detect-gpu 5.0.70, qrcode-generator 2.0.4, régénérés par `tools/build-vendor.sh`. Aucun CDN.
- `sw.js` : service worker (réseau d'abord pour HTML/JS/CSS).

## Tests

```sh
node test/logic.test.js                      # 5000 bombes × 3 niveaux, solo et duo, codes
node test/e2e-touch.mjs                      # partie complète au toucher (CDP) en 412x915 et 915x412, serveur local
node test/e2e-touch.mjs https://passcool17.github.io/desamorce-3d/ ./captures   # même chose sur le site publié
```

Paramètres d'URL : `?fps=1` (compteur), `?tier=0..3` (forcer le palier GPU), `?nosw=1` (sans service worker), `?autostart=1&seed=N`.

Concept, contrôles, licences et prochaines étapes : [GAME.md](GAME.md).
