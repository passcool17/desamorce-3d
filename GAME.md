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

## Contrôles
- **Glisser** à gauche/droite sur la bombe : elle tourne en 3D et s'aligne sur la face suivante. Boutons **◀ ▶** en bas (flèches du clavier sur ordinateur).
- **Toucher** directement les éléments sur la face visible : fils, vis, touches (EFF efface, OK valide), croix directionnelle de l'aiguille (↑ ↓ au clavier).

## État (v1, 2026-11-09)
- Jouable de bout en bout, toujours soluble (5000 bombes vérifiées).
- Partie complète testée automatiquement dans Chrome headless avec WebGL (vrais clics projetés sur la bombe 3D, glissement compris), victoire et défaite.
- Graphismes procéduraux (boîte, montants métalliques, câbles, textures dessinées), sons synthétisés.
- Pas encore testé sur un vrai téléphone.

## Prochaines idées
- Modèle 3D plus détaillé et visuels Créa (textures métal, bâtons, écran LED).
- Faire basculer la bombe pour voir le dessus et le dessous (modules supplémentaires).
- Couvercle du panneau qui se détache en 3D, fils qui pendent après la coupe.
- Niveaux de difficulté, meilleurs temps, mode à deux (un lit le manuel, l'autre désamorce).
