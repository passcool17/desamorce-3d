# Désamorce! 3D — fiche du jeu

**Jouer :** https://passcool17.github.io/desamorce-3d/ · **Manuel (mode duo) :** https://passcool17.github.io/desamorce-3d/manuel.html

## Concept
Une bombe fictive en 3D : un boîtier métallique avec des bâtons de dynamite, un écran DEL et un couvercle à loquet. Tu la tournes au doigt pour voir ses **4 côtés**, et tu la **bascules** pour voir le **dessus** et le **dessous** : **6 faces**. Les indices de chaque module sont sur une **autre** face (comme une boîte à énigmes). Chaque partie génère une nouvelle bombe, identifiée par un **code** (ex. `N-7K4QZ`).

| Face | Module | Indice nécessaire (et où il est) |
|---|---|---|
| 1 — Fils | Couper les fils dont la couleur est celle d'un voyant **allumé** (les fils coupés pendent) | Voyants : face 3 |
| 2 — Clavier | Code à 4 chiffres | 4 symboles sous le couvercle (face 3) + légende (récompense de l'Aiguille, face 4) |
| 3 — Panneau | Dévisser les 4 vis dans l'ordre ; le couvercle se détache et tombe sur la table | Chiffres du n° de série : face 1 |
| 4 — Aiguille | Guider la bille dans un labyrinthe dans le noir jusqu'au drapeau | — (récompense : la légende) |
| Dessus — Interrupteurs | Lever les interrupteurs dont la somme des valeurs = TENSION, puis VALIDER | TENSION : dessous |
| Dessous — Séquence | Des couleurs clignotent ; appuyer dans l'ordre la couleur donnée par la table | Table de correspondance : dessus |

## Niveaux (choisis au menu, mémorisés)
| Niveau | Modules | Chrono | Erreurs permises | Pénalité | Aiguille |
|---|---|---|---|---|---|
| Facile | 4 (côtés seulement) | 6:00 | 3 (la 4e = BOUM) | −20 s | 6×6, grand halo, pas de panne |
| Normal | 6 | 6:00 | 2 (la 3e = BOUM) | −30 s | 8×8, panne de lumière ~5 s, séquence de 4 |
| Difficile | 6, avec 6 fils | 5:00 | 1 (la 2e = BOUM) | −45 s | 8×8, petit halo, panne ~4 s, séquence de 5 |

Meilleur temps et étoiles mémorisés par niveau (et à part pour le duo).

## Mode duo (deux téléphones, sans serveur)
- Le **désamorceur** choisit « Duo » au menu. Avant le chrono, un écran montre le **code de la bombe**, un **code QR** et le lien court `manuel.html?code=…`. GO démarre le chrono.
- Le **lecteur** ouvre le manuel sur son téléphone (QR, lien, ou `manuel.html` + taper le code). Le manuel recalcule la bombe à partir du code : il marche hors ligne. Une faute de frappe dans le code est détectée (caractère de contrôle).
- En duo, certains indices ne sont **que dans le manuel** : voyants allumés, légende du clavier, valeur cible des interrupteurs, table de la séquence, et la **carte du labyrinthe** (le désamorceur est dans le noir). Le code reste affiché en haut (puce 📖, toucher = QR).

## Contrôles
- **Glisser à gauche/droite** : la bombe tourne et suit le doigt. **Glisser vers le bas** : voir le dessus ; **vers le haut** : voir le dessous (et l'inverse pour revenir).
- Boutons **◀ ▶** et **▲ Dessus / ▼ Dessous** en bas (à droite en paysage).
- **Toucher** les éléments de la face visible : fils, vis, touches, interrupteurs, boutons de couleur, croix de l'aiguille. Glisser sur le labyrinthe déplace la bille (une case tous les ~34 px) sans tourner la bombe.
- Clavier d'ordinateur : flèches pour tourner/basculer (sur l'Aiguille, les flèches bougent la bille ; Maj + flèches pour tourner), **M** pour le son.
- Portrait et paysage pris en charge.

## Son (v1.2 — plus de pression, sans irriter)
- Tout est synthétisé en WebAudio, sans fichier. Chaîne maître : passe-bas à 4 kHz (rien de perçant) → compresseur/limiteur.
- **Nappe de tension adaptative** : un drone grave (scies désaccordées filtrées + sinus sub) et une pulsation sourde en double battement, comme un cœur. Le tempo (52 → 130 bpm), l'ouverture du filtre et le désaccord montent à mesure que le chrono baisse, et encore après chaque erreur.
- **Tic-tac boisé**, doux : 1 par seconde, 2 par seconde sous 1:00, 3 par seconde sous 0:30. Une montée subtile joue dans les 15 dernières secondes.
- **Erreur** : une piqûre dissonante courte, et la nappe plonge puis repart plus tendue. **Module résolu** : un carillon doux, et la nappe se calme quelques secondes.
- La nappe se coupe net au moment du BOUM ou de la victoire, puis les sons de cinématique prennent le relais.
- Bouton **🔊/🔇** en haut à droite, mémorisé dans le navigateur. Le son démarre au premier toucher, comme l'exigent les navigateurs mobiles.

## Cinématiques (3 à 5 s, touche l’écran pour passer)
- **BOUM :** le chrono s’emballe jusqu’à 0:00 avec battements de cœur et bips qui accélèrent, vignette rouge et caméra qui se rapproche en tremblant ; puis flash blanc, boule de feu (particules additives), double onde de choc, le boîtier éclate en débris (avec les textures des faces) qui retombent et rebondissent, braises, fumée, écran fissuré, grosse secousse, BOUM grave (bruit filtré + sinus qui plonge) et vibration forte. « BOUM! » s’écrase ensuite à l’écran avec les stats (modules désamorcés, erreurs).
- **Victoire :** le chrono gèle et clignote en vert, les 12 DEL de la bombe passent au vert en cascade, son de mise hors tension, puis fanfare ; la caméra fait une orbite héroïque en reculant, lumière dorée, étincelles et confettis. Écran « DÉSAMORCÉE! » avec temps restant, **1 à 3 étoiles** et **meilleur temps** (sauvegardé dans le navigateur, `localStorage`).
- **Étoiles :** ★★★ sans erreur et ≥ 2:30 restantes ; ★★ au plus 1 erreur et ≥ 1:00 ; sinon ★.
- **Mouvement réduit** (`prefers-reduced-motion`) : version allégée, sans secousse ni orbite, moins de particules, plus courte.

## Technique
- **three.js 0.187.0** hébergé avec le jeu (`vendor/`, aucun CDN, décodeurs KTX2/Draco/meshopt locaux pour le futur modèle GLB). Modules ES + importmap, URL versionnées `?v=0.3.0`.
- Budget téléphone (Galaxy S20) : < 100 appels de dessin dans toutes les vues (29 à 43 mesurés), ~5 k triangles, aucune ombre dynamique (ombre portée simulée), pas de transmission, pixelRatio plafonné à 2. Particules instanciées (nombre d'appels fixe).
- **detect-gpu 5.0.70** hébergé (`detect-gpu-benchmarks/`) : palier ≤ 1 → pixelRatio 1, moins de particules, pas de poussière ni de faisceau. `?tier=2` force le mode normal.
- `?fps=1` : compteur (fps, appels, triangles, palier, GPU).
- **Service worker** maison : réseau d'abord pour HTML/JS/CSS, cache pour `vendor/` ; anciens caches supprimés à chaque version.
- **Bombe procédurale prête pour un GLB** : mêmes noms de nœuds que le futur modèle — `Bomb_Case`, `Bomb_Lid` (origine sur la charnière, détachable), `Bomb_Dynamite`, `Bomb_LED` (matériau `LED_Screen`, UV 0–1, chiffres dessinés par CanvasTexture), `Wire_<Couleur>` + `Wire_<Couleur>_CutA/_CutB`, ancres `Mount_Front/Back/Left/Right/Top/Bottom`. Remplacer par le GLB = changer le chargeur (`loadBombGLB` dans `js/bomb-model.js`, pas encore branché).

## Ressources et licences
- three.js 0.187.0 — MIT. detect-gpu 5.0.70 — MIT. qrcode-generator 2.0.4 (Kazuhiko Arase) — MIT. Copies dans `vendor/` avec leurs licences.
- Modèle 3D, textures (canvas) et sons (WebAudio) : faits par le jeu, procéduraux.
- Prévu (prochaine version, écran Crédits déjà prêt) : « Time Bomb » par st4ng et « Explosive Case » par kris vidotto (Sketchfab, CC BY 4.0).

## État (v0.3.0, 2026-11-16)
- Jouable de bout en bout dans les 3 niveaux, en solo et en duo. 5000 bombes × 3 niveaux vérifiées solubles (solo, et duo bombe + manuel) ; toutes les fautes de frappe d'un caractère dans un code sont détectées.
- Test tactile complet (vrais événements tactiles CDP) en 412×915 et 915×412 : 70 vérifications, 0 erreur console.
- Pas encore testé sur un vrai téléphone (les fps mesurés sur la machine de test ne sont pas ceux d'un S20).

## Prochaines étapes
- Brancher le modèle GLB (st4ng / kris vidotto) avec le contrat de noms ci-dessus, compressé (meshopt + KTX2).
- Essai sur un vrai Galaxy S20 (fps, chaleur, lisibilité des faces).
- Imprimer le manuel en PDF ; mode duo sur un seul appareil (manuel en plein écran à tour de rôle).
