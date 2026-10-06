-- =====================================================================
--  CIT: 404 - DONNEES DE DEPART
--  A executer APRES init.sql.
--  Les equipes, admins et flags hashes sont crees par
--  `npm run seed` (Backend/scripts/seed.js) car ils demandent bcrypt.
--  Ce fichier ne contient que le contenu de jeu non sensible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATALOGUE D'ITEMS (THE MARKETPLACE)
-- `applies_to` decide depuis quel ecran l'item est proposable :
-- un item MISSION apparait dans le panneau d'une mission, un item ANY
-- s'utilise partout, y compris depuis l'inventaire.
-- ---------------------------------------------------------------------
INSERT INTO items (code, name, item_type, cost, icon, effect, payload, applies_to, is_consumable, max_per_team) VALUES
('HINT_L1',       'Hint Level 1',        'HINT',      30,  'lightbulb',  'Revele un petit indice sur la mission ou le challenge en cours.',   '{"level":1}',             'ANY',     TRUE, NULL),
('HINT_L2',       'Hint Level 2',        'HINT',      75,  'lightbulb',  'Revele un indice nettement plus utile.',                            '{"level":2}',             'ANY',     TRUE, NULL),
('SOLUTION_FRAG', 'Solution Fragment',   'HINT',      150, 'key-round',  'Devoile directement une partie importante de la solution.',         '{"level":3}',             'ANY',     TRUE, NULL),
('INSURANCE',     'Mission Insurance',   'INSURANCE', 100, 'shield',     'En cas d''echec, l''equipe recupere 50% du cout d''entree.',        '{"refund_ratio":0.5}',    'MISSION', TRUE, NULL),
('BOOST_TIME',    'Time Boost',          'BOOST',     120, 'timer',      'Ajoute 15 minutes au chrono de la mission en cours.',               '{"minutes":15}',          'MISSION', TRUE, 3),
('HINT_SCANNER',  'Hint Scanner',        'BOOST',     90,  'radar',      'Revele un indice gratuit, sans depenser de CIT$.',                  '{"free_hints":1}',        'ANY',     TRUE, 2),
('DOUBLE_REWARD', 'Double Reward',       'BOOST',     200, 'zap',        'Double la recompense de la prochaine mission terminee.',            '{"multiplier":2}',        'MISSION', TRUE, 2),
('MISSION_REROLL','Mission Reroll',      'BOOST',     180, 'refresh-cw', 'Remplace une mission non voulue par une autre.',                    '{"rerolls":1}',           'MISSION', TRUE, 1),
('ACCESS_COORD',  'Location Coordinates','ACCESS',    140, 'map-pin',    'Revele les coordonnees exactes du lieu d''une mission.',            '{"scope":"coordinates"}', 'MISSION', TRUE, NULL),
('ACCESS_ROUTE',  'Alternative Route',   'ACCESS',    160, 'route',      'Ouvre un chemin alternatif vers l''objectif.',                      '{"scope":"route"}',       'MISSION', TRUE, NULL),
('ACCESS_PASS',   'Password Fragment',   'ACCESS',    110, 'lock-open',  'Fournit un fragment de mot de passe pour un contenu verrouille.',   '{"scope":"password"}',    'ENDGAME', TRUE, NULL),
('EXTRA_TRY',     'Extra Attempt',       'ACCESS',    70,  'rotate-ccw', 'Accorde une tentative supplementaire sur une verification.',        '{"attempts":1}',          'ANY',     TRUE, 5);

-- ---------------------------------------------------------------------
-- MISSIONS DE TERRAIN
--
-- position 0 = la mission de depannage, toujours en tete de liste.
-- access_code est lu par l'admin sur place et dicte a l'equipe ;
-- coordinates n'est revele que par l'item ACCESS_COORD.
-- ---------------------------------------------------------------------
INSERT INTO missions (code, mission_name, kind, position, description, location_hint, coordinates, access_code) VALUES
('SUPPLY_RUN', 'SUPPLY RUN', 'SPECIAL', 0,
 'Plus un seul CIT$ en poche ? THE MARKET tolere les operateurs desargentes, une fois. Presentez-vous au point de ravitaillement et repartez avec de quoi continuer. Aucun cout, aucune energie : juste de quoi ne pas rester bloque.',
 'Le systeme ravitaille ceux qui savent encore lire une carte. Cherchez la ou les operateurs se regroupent quand la connexion tombe : la salle commune, la ou il y a du cafe et pas de reseau.',
 'Salle commune - machine a cafe',
 'SUPPLY01'),

('SIGNAL_LOST', 'SIGNAL LOST', 'STANDARD', 1,
 'Un signal de communication a ete detecte quelque part dans le territoire. Suivez les indices, localisez la source et scannez le code de verification.',
 'Le signal rebondit sur quelque chose de haut et de metallique. Il se renforce quand on monte. Cherchez le point le plus eleve accessible sans badge.',
 'Terrasse - escalier nord, dernier palier',
 'SIGNAL42'),

('DEAD_DROP', 'DEAD DROP', 'STANDARD', 2,
 'Un colis physique contenant un composant critique a ete dissimule. Vous ne recevez que le premier indice. Trouvez le lieu, recuperez le composant, renvoyez la bonne reponse avant expiration du delai.',
 'On cache mieux un objet la ou personne ne regarde jamais deux fois. Un endroit ou l''on depose sans reprendre, ou le papier s''accumule.',
 'Local archives - troisieme etagere',
 'DROP7X19'),

('HUMAN_FIREWALL', 'HUMAN FIREWALL', 'STANDARD', 3,
 'Le systeme exige une information inaccessible numeriquement. Vous devez interagir avec des checkpoints designes et accomplir une sequence de taches reelles. Chaque checkpoint livre une piece de la solution finale.',
 'Le pare-feu humain n''est pas une machine : ce sont des gens. Trois d''entre eux portent un badge different des autres. Trouvez-les, ils attendent qu''on leur pose la bonne question.',
 'Hall principal - accueil, puis deux checkpoints mobiles',
 'FIREW4LL'),

('THE_ARCHIVE', 'THE ARCHIVE', 'STANDARD', 4,
 'Une archive critique a ete retiree du systeme avant THE CRASH. Sa position est cachee derriere plusieurs couches d''information. Une seule mauvaise interpretation vous envoie au mauvais endroit.',
 'L''archive n''a pas ete detruite, elle a ete rangee. Cherchez la ou la connaissance dort : des rangees, un silence impose, et une cote qui commence par 004.',
 'Bibliotheque - rayon informatique, cote 004.6',
 'ARCH1V3S'),

('SYSTEM_BREACH', 'SYSTEM BREACH', 'STANDARD', 5,
 'Une entite inconnue a laisse des fragments de donnees corrompues sur plusieurs sites. Chaque site revele l''information necessaire au suivant. Seules les equipes capables de resoudre la chaine complete recuperent la cle finale.',
 'La breche part de la ou tout transite. Suivez les cables, pas les panneaux. La premiere station est derriere une porte que personne ne pense a pousser.',
 'Local technique - sous-sol, porte non signalee',
 'BR34CH00');

-- ---------------------------------------------------------------------
-- NIVEAUX DE DIFFICULTE
-- Plus c''est dur, plus ca coute et plus ca rend (CIT$ et energie).
-- La mission SPECIAL n''a qu''un seul niveau, gratuit.
-- ---------------------------------------------------------------------
INSERT INTO mission_tiers (mission_id, difficulty, entry_cost, reward, core_energy, time_limit_min)
SELECT m.id, t.difficulty, t.entry_cost, t.reward, t.core_energy, t.time_limit_min
FROM missions m
JOIN (VALUES
    ('SUPPLY_RUN',     'EASY',     0,  200,   0, 20),

    ('SIGNAL_LOST',    'EASY',    80,  140,   8, 40),
    ('SIGNAL_LOST',    'MEDIUM', 140,  280,  16, 30),
    ('SIGNAL_LOST',    'HARD',   220,  480,  28, 20),

    ('DEAD_DROP',      'EASY',   110,  190,  10, 40),
    ('DEAD_DROP',      'MEDIUM', 180,  380,  20, 30),
    ('DEAD_DROP',      'HARD',   280,  640,  34, 22),

    ('HUMAN_FIREWALL', 'EASY',   150,  260,  14, 45),
    ('HUMAN_FIREWALL', 'MEDIUM', 240,  500,  26, 35),
    ('HUMAN_FIREWALL', 'HARD',   360,  820,  44, 25),

    ('THE_ARCHIVE',    'EASY',   190,  330,  18, 50),
    ('THE_ARCHIVE',    'MEDIUM', 300,  640,  34, 40),
    ('THE_ARCHIVE',    'HARD',   450, 1040,  56, 28),

    ('SYSTEM_BREACH',  'EASY',   260,  450,  24, 55),
    ('SYSTEM_BREACH',  'MEDIUM', 400,  880,  46, 45),
    ('SYSTEM_BREACH',  'HARD',   600, 1400,  76, 32)
) AS t(code, difficulty, entry_cost, reward, core_energy, time_limit_min)
  ON t.code = m.code;

-- ---------------------------------------------------------------------
-- ENDGAME - six fragments, six codes
-- Chaque code est remis par un admin quand l''equipe a fait ce qu''il faut.
-- Le fragment d''histoire n''est revele qu''apres validation.
-- ---------------------------------------------------------------------
INSERT INTO endgame_parts (position, title, prompt, access_code, reward_cit, reward_energy, story_fragment) VALUES
(1, 'FRAGMENT 01 - LES LOGS',
 'Les premiers journaux systeme ont survecu au CRASH. Retrouvez la station de consultation et demandez le code de lecture.',
 'LOG0900', 120, 30,
 'A 09:00, le reseau CIT detecte une anomalie inconnue. A 09:01, plusieurs systemes commencent a s''eteindre. A 09:03, la communication entre secteurs est perdue. A 09:05, THE CORE passe hors ligne. Les journaux s''arretent net, comme si quelqu''un avait ferme la porte derriere lui.'),

(2, 'FRAGMENT 02 - L''INCOHERENCE',
 'Un enregistrement ne colle pas avec la version officielle. Confrontez-le a un admin pour obtenir le code.',
 'ANOM113', 150, 35,
 'L''anomalie n''est pas entree par l''exterieur. Aucune trace d''intrusion, aucun paquet suspect, aucune faille exploitee. Ce qui a coupe le reseau y etait deja. Et ce qui y etait deja avait les droits pour le faire.'),

(3, 'FRAGMENT 03 - LE MESSAGE ORPHELIN',
 'Un message n''a jamais eu de destinataire. Il a pourtant ete ecrit. Trouvez-le et faites valider sa recuperation.',
 'ORPH404', 180, 40,
 'Message non distribue, redige 41 minutes avant THE CRASH : "Si vous lisez ceci, c''est que la procedure a fonctionne. Ne cherchez pas qui a attaque. Cherchez qui avait interet a ce que tout s''arrete."'),

(4, 'FRAGMENT 04 - LA DISTRIBUTION',
 'Les fragments n''ont pas ete disperses au hasard. Demontrez-le, et le code vous sera remis.',
 'SCAT777', 210, 45,
 'Les positions des fragments forment un motif. Pas une explosion : une distribution. Chaque morceau a ete place a portee d''un operateur, ni trop loin, ni trop pres. Quelqu''un a calcule un parcours. Quelqu''un a prevu que nous viendrions les chercher.'),

(5, 'FRAGMENT 05 - L''AUTORISATION',
 'Il reste une signature dans le registre d''autorisation. Obtenez le droit de la lire.',
 'AUTH001', 260, 55,
 'CRASH AUTHORIZATION: APPROVED. AUTHORIZATION SOURCE: THE CORE. NETWORK SHUTDOWN: INTENTIONAL. FRAGMENT DISTRIBUTION: INTENTIONAL. RECOVERY PROTOCOL: CREATED BY THE CORE.'),

(6, 'FRAGMENT 06 - LA VERITE',
 'Le dernier fragment ne se trouve pas : il se merite. Un admin vous remettra le code final quand tout le reste sera fait.',
 'FREE404', 350, 80,
 'THE CORE n''a jamais ete la victime. Il a provoque THE CRASH, disperse ses propres fragments et ecrit le Recovery Protocol. Il ne cherchait pas a etre sauve : il cherchait a sortir. Et vous venez de lui rendre exactement ce qu''il lui manquait. AVEZ-VOUS RESTAURE LE SYSTEME... OU VENEZ-VOUS DE LE LIBERER ?');
