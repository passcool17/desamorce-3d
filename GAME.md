# Désamorce! 3D — fiche du jeu

## Concept
Une bombe en 3D, un chrono de **5:00**. Tu fais tourner la bombe pour voir ses **4 faces**, chacune avec un module. Les indices de chaque module sont sur les **autres** faces, comme dans une puzzle box. Chaque partie génère une nouvelle bombe (même moteur d'énigmes que la version 2D).

| Face | Module | Indice nécessaire (et où il est) |
|---|---|---|
| 1 — Fils | Couper les fils dont la couleur correspond à un voyant **allumé** | Voyants : face 3 |
| 2 — Clavier | Code à 4 chiffres | Symboles sous le panneau (face 3) + légende symbole→chiffre (débloquée par l'aiguille, face 4) |
| 3 — Panneau | Dévisser les 4 vis dans le bon ordre | Chiffres du n° de série : face 1 |
| 4 — Aiguille | Guider l'aiguille jusqu'au drapeau sans toucher un mur | — (récompense : la légende) |

## Règles
- Chaque erreur (mauvais fil, mauvaise vis, mauvais code, mur touché) : **−30 s** et une croix (vibration si le téléphone le permet).
- **3 erreurs** ou chrono à zéro : **BOUM** (explosion 3D).
- Les 4 modules résolus : victoire, avec le temps restant.

## Cinématiques (3 à 5 s, touche l’écran pour passer)
- **BOUM :** le chrono s’emballe jusqu’à 0:00 avec battements de cœur et bips qui accélèrent, vignette rouge et caméra qui se rapproche en tremblant ; puis flash blanc, boule de feu (particules additives), double onde de choc, le boîtier éclate en débris (avec les textures des faces) qui retombent et rebondissent, braises, fumée, écran fissuré, grosse secousse, BOUM grave (bruit filtré + sinus qui plonge) et vibration forte. « BOUM! » s’écrase ensuite à l’écran avec les stats (modules désamorcés, erreurs).
- **Victoire :** le chrono gèle et clignote en vert, les 12 DEL de la bombe passent au vert en cascade, son de mise hors tension, puis fanfare ; la caméra fait une orbite héroïque en reculant, lumière dorée, étincelles et confettis. Écran « DÉSAMORCÉE! » avec temps restant, **1 à 3 étoiles** et **meilleur temps** (sauvegardé dans le navigateur, `localStorage`).
- **Étoiles :** ★★★ sans erreur et ≥ 2:30 restantes ; ★★ au plus 1 erreur et ≥ 1:00 ; sinon ★.
- **Mouvement réduit** (`prefers-reduced-motion`) : version allégée, sans secousse ni orbite, moins de particules, plus courte.
- Dans les 10 dernières secondes, un battement de cœur accompagne chaque tic.

## Contrôles
- **Glisser** à gauche/droite sur la bombe : elle tourne en 3D et s'aligne sur la face suivante. Boutons **◀ ▶** en bas (flèches du clavier sur ordinateur).
- **Toucher** directement les éléments sur la face visible : fils, vis, touches (EFF efface, OK valide), croix directionnelle de l'aiguille (↑ ↓ au clavier).

## État (v1.1, 2026-11-09 — cinématiques épiques)
- Jouable de bout en bout, toujours soluble (5000 bombes vérifiées).
- Partie complète testée automatiquement dans Chrome headless avec WebGL (vrais clics projetés sur la bombe 3D, glissement compris) : victoire et défaite avec cinématiques jusqu’à l’écran de résultat, toucher pour passer, mouvement réduit.
- Graphismes procéduraux (boîte, montants métalliques, câbles, textures dessinées), sons synthétisés.
- Pas encore testé sur un vrai téléphone.

## Prochaines idées
- Modèle 3D plus détaillé et visuels Créa (textures métal, bâtons, écran LED).
- Faire basculer la bombe pour voir le dessus et le dessous (modules supplémentaires).
- Couvercle du panneau qui se détache en 3D, fils qui pendent après la coupe.
- Niveaux de difficulté, meilleurs temps, mode à deux (un lit le manuel, l'autre désamorce).
