# Désamorce! 3D

Version 3D de *Désamorce!* : une bombe en 3D que tu tournes au doigt, en mode portrait. Tout est fictif.
Projet distinct de la version 2D ([passcool17/desamorce](https://github.com/passcool17/desamorce)), qui reste inchangée.

**Jouer :** https://passcool17.github.io/desamorce-3d/

- Three.js r149 (CDN jsdelivr, build UMD) + JavaScript simple, aucune étape de build.
- `logic.js` : génération des énigmes (copie de la version 2D : solution d'abord, indices ensuite).
- `game3d.js` : scène 3D, modules dessinés sur des textures canvas et touchés par raycast, sons WebAudio.
- `index.html` / `style.css` : HUD (chrono, erreurs, navigation) et écrans titre/fin en HTML.

## Tests

```sh
node test/logic.test.js                                          # 5000 bombes, toutes solubles à partir des indices affichés
node test/e2e-cdp.mjs https://passcool17.github.io/desamorce-3d/ /tmp   # partie complète dans Chrome headless (WebGL) + captures
```

Concept, contrôles et prochaines idées : [GAME.md](GAME.md).
