# CIT: 404 — Recovery Protocol

Plateforme de jeu pour l'événement CIT : une application **opérateur** (les
équipes) et une plateforme **admin** (supervision), sur une base PostgreSQL
commune.

```
CIT_404/
├── frontend/                     React 19 + TypeScript + Vite + Tailwind v4
│   └── src/
│       ├── components/ui/        primitives (style shadcn, thème terminal)
│       ├── components/layout/    OperatorLayout · AdminLayout
│       ├── pages/                Home · Challenges · Missions · Market · Story
│       ├── pages/admin/          Dashboard · Teams · Items · Inventory · Ledger
│       ├── store/                auth.tsx (session) · game.tsx (état temps réel)
│       └── lib/                  api.ts · socket.ts · utils.ts
├── Backend/                      Express + Socket.IO + PostgreSQL
│   ├── lib/economy.js            TOUS les mouvements de CIT$ passent ici
│   ├── lib/tokens.js             JWT + refresh tokens révocables
│   ├── routes/                   auth · game · admin
│   └── scripts/seed.js           équipes, codes d'accès, admin, challenges
└── Infrastructure & Deployment/
    ├── init.sql                  schéma + vues admin
    ├── seed.sql                  catalogue d'items et missions
    └── docker-compose.yml        PostgreSQL en une commande
```

---

## 1. Démarrage

### La base de données — sans Docker (voie recommandée)

Le script installe des binaires PostgreSQL **portables** : rien dans
`Program Files`, aucun service Windows, aucun droit administrateur. Tout vit
dans `%USERPROFILE%\pgsql-portable`.

```powershell
.\"Infrastructure & Deployment\setup-local-db.ps1"
```

Il télécharge les binaires (~300 Mo, une seule fois), crée un cluster sur le
port 5432, applique `init.sql` et `seed.sql`, puis écrit `DATABASE_URL` dans
`Backend\.env`. Le cluster n'écoute que sur `localhost`.

Après un redémarrage de la machine, il faut relancer le serveur :

```powershell
.\"Infrastructure & Deployment\setup-local-db.ps1" -Action start
```

`-Action stop`, `-Action status` et `-Action reset` (repartir de zéro) existent
aussi.

Docker reste disponible si vous le préférez :

```bash
docker compose -f "Infrastructure & Deployment/docker-compose.yml" up -d
```

### Le reste

```bash
cd Backend && npm install && npm run seed
```

`npm run seed` affiche **une seule fois** le mot de passe admin et les 12 codes
d'accès d'équipe. Notez-les : ils sont hashés en base et irrécupérables.

Deux terminaux :

```bash
cd Backend && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

Opérateurs : http://localhost:5174 · Admin : http://localhost:5174/admin/login

---

## 2. Où sont stockés les items de chaque équipe

En base PostgreSQL, jamais dans le navigateur. Trois tables, chacune avec un
rôle distinct :

| Table            | Contenu                                   | Écriture |
| ---------------- | ----------------------------------------- | -------- |
| `items`          | Le **catalogue** : nom, prix, type, effet  | Admin    |
| `team_inventory` | L'**état courant** : une ligne par (équipe, item) avec `quantity` | Projection |
| `ledger`         | Le **journal** : chaque mouvement, horodaté et signé | Append-only |

### Pourquoi trois tables et pas une

`team_inventory` répond vite à « qu'est-ce que l'équipe 7 possède maintenant ? » —
une clé primaire `(team_id, item_id)`, une seule requête indexée pour afficher
le panneau INVENTORY.

`ledger` répond à « que s'est-il passé ? ». Il n'est jamais mis à jour ni
supprimé : chaque ligne porte le montant signé, le solde résultant
(`balance_after`), l'opérateur qui a agi et l'item concerné. C'est ce qui permet
à l'admin de trancher un litige (« on n'a jamais acheté ça ») et de reconstruire
`cit_balance` et `team_inventory` si une projection dérive.

Le `payload JSONB` de `items` porte les paramètres de l'effet — `{"minutes":15}`
pour un Time Boost, `{"multiplier":2}` pour Double Reward. Ajouter un item ne
demande donc aucune migration de schéma.

### Les vues que consomme la plateforme admin

| Vue                | Question à laquelle elle répond                       |
| ------------------ | ----------------------------------------------------- |
| `v_team_stats`     | Une ligne par équipe : solde, énergie, résolutions par catégorie, missions, items, gagné/dépensé, dernière activité |
| `v_team_items`     | Quel item possède quelle équipe, en quelle quantité     |
| `v_item_popularity`| Quels items se vendent, combien de CIT$ ils absorbent   |
| `v_leaderboard`    | Le classement live                                      |

La page **Inventory** de l'admin affiche la matrice équipes × items, avec une
intensité de couleur proportionnelle aux quantités : on voit d'un coup d'œil qui
thésaurise et qui a tout dépensé.

### Concurrence

Trois opérateurs partagent un portefeuille et jouent simultanément. Deux achats
lancés en même temps ne doivent pas lire le même solde. Tout passe donc par
`Backend/lib/economy.js`, qui verrouille la ligne équipe
(`SELECT … FOR UPDATE`) avant tout calcul et écrit portefeuille, inventaire et
ledger **dans une seule transaction**. Une contrainte `CHECK (cit_balance >= 0)`
sert de garde-fou en base.

---

## 3. Méthode d'authentification retenue

**JWT à deux rôles, avec sessions révocables en base.**

| | Opérateur | Admin |
| --- | --- | --- |
| Identifiant | Nom d'équipe + code d'accès partagé | Login + mot de passe |
| Stockage du secret | `bcrypt` dans `teams.join_code_hash` | `bcrypt` dans `admins.password_hash` |
| Pseudo | Saisi par chacun, sert à l'attribution | — |

### Le flux

1. Les trois opérateurs saisissent **le même code d'équipe** et **leur propre
   pseudo**. Le pseudo n'est pas un secret : il sert à écrire « qui a soumis ce
   flag » dans le ledger.
2. Le serveur renvoie un **access token JWT de 15 minutes**, gardé **en mémoire**
   dans le module `lib/api.ts` — jamais dans `localStorage`.
3. Un **refresh token** de 256 bits part en cookie `httpOnly` + `SameSite`. Il est
   stocké **hashé** dans `sessions`, avec le user-agent et l'IP.
4. Sur 401, le front rejoue silencieusement `/api/auth/refresh`. Le refresh token
   est **tourné** à chaque usage : un cookie volé n'est valide que jusqu'au
   prochain rafraîchissement du vrai appareil.
5. Le handshake Socket.IO porte le même token. Le serveur décide des rooms : une
   équipe ne peut pas s'abonner au portefeuille d'une autre.

### Pourquoi pas autre chose

**Pas d'OAuth / Google.** L'événement dure quelques heures, dans une salle. Une
dépendance à un fournisseur externe ajoute un point de panne réseau pour zéro
bénéfice, et un compte Google est personnel alors que le compte de jeu est
collectif.

**Pas de compte par personne.** Le règlement dit : une équipe, un portefeuille,
un inventaire. Modéliser trois comptes puis les rattacher à une équipe ajoute
une jointure et une classe de bugs (« pourquoi mon solde diffère du sien ? »)
pour rien.

**Pas de session serveur classique.** Il faudrait un store partagé dès qu'on
passe à deux instances. Le JWT court + refresh en base donne la révocation sans
cette contrainte.

**Pas de token long stocké dans `localStorage`.** C'est le défaut le plus courant
et il est mauvais ici : un CTF est un environnement où l'on écrit du XSS pour le
sport. Un token en mémoire meurt avec l'onglet ; un token en `localStorage`
survit et se lit en une ligne de JavaScript.

### Ce que ça donne concrètement

- **Un opérateur rafraîchit la page** → le cookie restaure la session, il ne
  retape pas le code au milieu d'une mission.
- **Un téléphone est prêté à une autre équipe** → l'admin voit les appareils
  connectés sur la fiche équipe et en révoque un seul (bouton corbeille), sans
  déconnecter les deux autres.
- **Une équipe triche** → `POST /api/admin/teams/:id/lock` gèle le compte ; le
  verrou est vérifié dans `economy.js`, donc aucune transaction ne passe.
- **Brute-force du code d'équipe** → `express-rate-limit` à 20 tentatives / 10 min
  par IP, et la comparaison bcrypt tourne même quand l'équipe n'existe pas, pour
  ne pas révéler par le temps de réponse qu'un nom est valide.

### À faire avant l'événement

- `JWT_SECRET` : générer une vraie valeur (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). Le serveur refuse de démarrer en production sans.
- Servir en **HTTPS** : le cookie passe en `Secure` + `SameSite=None` dès que `NODE_ENV=production`.
- Imprimer les codes d'équipe et les distribuer en main propre.

---

## 4. Choix d'interface

**Vite + React 19 + TypeScript + Tailwind CSS v4**, avec des primitives Radix
restylées (l'approche shadcn/ui : les composants sont dans le repo, pas dans une
dépendance, donc entièrement modifiables).

Pourquoi pas MUI / Chakra / Mantine : leurs design systems sont conçus pour des
applications d'entreprise. Les surcharger jusqu'à obtenir un terminal CRT coûte
plus cher que de partir de primitives non stylées.

Radix apporte ce qui est pénible à écrire correctement — piège de focus des
modales, touche Échap, attributs ARIA. La version d'origine ouvrait ses panneaux
avec des classes CSS : le focus restait derrière l'overlay et Échap ne faisait rien.

Le thème garde la palette d'origine (`#00ff41` vert terminal, `#ff003c` rouge
alerte) et y ajoute l'ambre, le cyan et le magenta dont les graphiques admin ont
besoin pour distinguer leurs séries. Grille phosphore, scanlines CRT et titres à
aberration chromatique sont dans `src/index.css` — et tous désactivés sous
`prefers-reduced-motion`.

Le bundle admin (Recharts, tableaux) est chargé en `lazy()` : les opérateurs sur
téléphone téléchargent **~149 kB gzip**, pas les 266 kB de l'ensemble.

---

## 5. Déploiement

Le backend tient des **WebSockets** ouverts. Les fonctions serverless de Vercel
ne les gardent pas : déployez `Backend/` sur un hébergeur à processus persistant
(Render, Railway, Fly.io) et le `frontend/dist` où vous voulez. Le `vercel.json`
fourni ne convient que si vous retirez Socket.IO au profit de polling.

Variables à définir côté backend : `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`,
`CORS_ORIGINS` (l'origine exacte du front, credentials obligent).

---

## 6. Pilotage pendant l'événement

### Les phases s'excluent

Une seule phase est jouable à la fois. Les onglets des autres s'affichent
verrouillés, **et le backend refuse les requêtes correspondantes** — le cadenas
n'est pas qu'une décoration. Au démarrage, tout est scellé (`LOBBY`).

| Phase | Ce qui s'ouvre | Chrono par défaut |
| --- | --- | --- |
| `LOBBY` | Rien | — |
| `CHALLENGES` | Digital Arena : CP / CTF / DATA | 2 h |
| `MISSIONS` | Missions de terrain | 3 h |
| `ENDGAME` | Les six fragments finaux | 1 h 30 |
| `CLOSED` | Marché fermé, classement figé | — |

Basculer une phase relance son chrono. L'admin peut passer de l'une à l'autre à
tout moment depuis la barre du haut ; les durées se modifient via
`PATCH /api/admin/phase/:phase/duration`.

### Challenges

Chaque challenge rapporte des CIT$ **et** de l'énergie. La **première équipe**
à résoudre un challenge déclenche une popup plein écran et touche une prime
(≈ +50 % en CIT$ et en énergie). Le first blood est décidé côté serveur sous
verrou de ligne : une égalité au millième de seconde ne peut pas produire deux
gagnants.

### Missions

Le déroulé tient en quatre temps :

1. L'équipe lit l'**intel de localisation** et part chercher le lieu.
2. Sur place, un admin lui dicte le **code d'accès** (onglet Missions de
   l'admin, bouton *Reveal codes*). L'item *Location Coordinates* révèle les
   coordonnées mais **ne remplace pas le code** — il évite seulement de chercher
   à l'aveugle.
3. Le code saisi fait passer la boîte de déploiement de l'**ambre au vert**.
4. L'équipe choisit une **difficulté** (EASY / MEDIUM / HARD) : plus c'est dur,
   plus ça coûte et plus ça rapporte.

L'ancienne case « assurance » a disparu : n'importe quel item applicable se pose
maintenant directement sur la mission depuis son panneau. L'assurance en est un
comme les autres, et `resolveMission` vérifie dans le ledger si l'équipe en a
dépensé une avant de rembourser la moitié de la mise.

`SUPPLY RUN` est la mission de dépannage : gratuite, 200 CIT$, 0 énergie,
affichée en tête de liste avec son propre bandeau.

### Endgame

Six fragments, six codes remis par les admins. Chacun rend des CIT$, de
l'énergie et **un morceau de l'histoire** — le texte n'est jamais envoyé au
navigateur avant validation du code. La progression (`17 %`, `1 / 6`) s'affiche
sur l'onglet Endgame et dans le panneau d'équipe.

### Notifications

L'onglet **Alerts** de l'admin envoie deux types de messages à une ou plusieurs
équipes :

- **NORMAL** — arrive dans le panneau Transmissions (icône cloche du header) et
  sur la page d'accueil. C'est de l'information, pas le fil d'activité public.
- **URGENT** — prend tout l'écran de l'équipe en rouge, avec un compte à
  rebours. La modale **ignore Échap et les clics extérieurs** : seul le bouton
  d'accusé de réception la ferme, pour qu'aucune équipe ne puisse la rater.

Pour un urgent, l'admin choisit le délai, la récompense (200 CIT$ par défaut) et
la pénalité en CIT$ et en énergie. S'il valide avant la fin, l'équipe touche la
récompense ; si le chrono expire, un balayage serveur toutes les 15 secondes
applique la pénalité, **même si l'équipe a fermé l'onglet**. Accuser réception
ne suffit donc pas à s'en tirer.

`legacy-vanilla/` conserve la version HTML/CSS/JS d'origine à titre de référence.
