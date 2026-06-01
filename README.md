# 🗺 Territoire

Ton journal cartographique personnel. Explore et découvre les rues que tu as déjà parcourues.

## Ce que fait l'app

- **Carte en temps réel** avec OpenStreetMap
- **Tracking GPS** : appuie sur ▶ pour démarrer une exploration, ⏹ pour arrêter
- **Journal** : toutes tes rues explorées avec date et distance
- **Stats** : km parcourus, jours actifs, streak, succès
- **PWA** : installable sur iPhone comme une vraie app

---

## Déploiement gratuit sur Vercel (5 minutes)

### Option A — Drag & Drop (le plus simple)

1. Va sur **vercel.com** et crée un compte gratuit
2. Sur le dashboard, clique **"Add New Project"**
3. Clique **"Deploy from file"** ou glisse le dossier `territoire` directement
4. Vercel te donne une URL du type `territoire-xxx.vercel.app` — c'est ton app en ligne !

### Option B — Via GitHub (recommandé pour les mises à jour)

1. Crée un compte **github.com**
2. Crée un nouveau repository "territoire"
3. Upload tous les fichiers de ce dossier
4. Va sur **vercel.com**, connecte ton GitHub, sélectionne le repo
5. Vercel déploie automatiquement à chaque modification

---

## Installer sur iPhone

1. Ouvre l'URL de ton app dans **Safari** (pas Chrome, ça ne marche qu'avec Safari sur iOS)
2. Appuie sur le bouton **Partager** (carré avec une flèche)
3. Sélectionne **"Sur l'écran d'accueil"**
4. L'app apparaît comme une vraie app sur ton iPhone !

---

## Structure des fichiers

```
territoire/
├── index.html        ← L'app complète
├── manifest.json     ← Config PWA (icône, nom, couleurs)
├── sw.js             ← Service worker (mode offline)
└── js/
    └── app.js        ← Toute la logique (GPS, carte, stockage)
```

---

## Limitations actuelles (MVP)

- Le GPS en arrière-plan est limité sur iOS Safari : l'écran doit rester allumé pendant l'exploration
- Les noms de rues sont générés automatiquement (coordonnées) — la prochaine étape serait d'intégrer l'API Nominatim pour avoir les vrais noms
- Les données sont stockées localement sur ton téléphone

## Prochaines fonctionnalités à ajouter

- [ ] Vrais noms de rues (reverse geocoding avec Nominatim, gratuit)
- [ ] Quartiers et arrondissements
- [ ] Export de tes données
- [ ] Partage optionnel d'une rue ou d'une session
