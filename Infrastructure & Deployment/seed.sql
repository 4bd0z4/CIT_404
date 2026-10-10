-- =====================================================================
--  CIT: 404 - GAME CONTENT (no secrets)
--  Run AFTER init.sql. Teams, admins and hashed challenge values come
--  from `npm run seed` (needs bcrypt + private inputs).
-- =====================================================================

INSERT INTO items (code, name, item_type, cost, icon, effect, payload, applies_to, is_consumable, max_per_team) VALUES
('HINT_L1','Hint Level 1','HINT',30,'lightbulb','Reveals a small hint for the challenge.','{}','ANY',TRUE,NULL),
('HINT_L2','Hint Level 2','HINT',75,'lightbulb','Reveals a more detailed hint for the challenge.','{}','ANY',TRUE,NULL),
('INSURANCE','Mission Insurance','INSURANCE',100,'shield','On a failed mission, the team recovers 50% of the entry cost.','{"refund_ratio":0.5}','MISSION',TRUE,NULL),
('ACCESS_COORD','Location Scan','ACCESS',80,'map-pin','Reveals the real-world coordinates of a mission location.','{}','MISSION',TRUE,NULL),
('MISSION_RESIGN','Mission Resign','MISSION_TOOL',50,'flag-off','Abandon an active mission. You lose the entry cost but free the slot.','{}','MISSION',TRUE,NULL),
('MISSION_REROLL','Mission Reroll','MISSION_TOOL',40,'refresh-cw','After completing or failing a mission, unlock it again at the same cost and reward.','{}','MISSION',TRUE,NULL),
('TIME_BOOST','Time Boost','BOOST',60,'clock','Adds 10 extra minutes to your active mission timer.','{"extra_min":10}','MISSION',TRUE,NULL),
('DOUBLE_REWARD','Double Reward','BOOST',120,'zap','Doubles the CIT$ and energy reward on your next mission completion.','{"multiplier":2}','MISSION',TRUE,1);

INSERT INTO missions (code, mission_name, kind, position, description, location_hint, coordinates, access_code) VALUES
('SUPPLY_RUN','SUPPLY RUN','SPECIAL',0,
 'Out of CIT$? THE MARKET tolerates broke operators once. Report to the resupply point and leave with enough to keep going. No cost, no energy.',
 'The system resupplies those who can still read a map. Look where operators gather when the connection drops: the common room, where there is coffee and no network.',
 'Common room - coffee machine','SUPPLY01'),
('GREEN_SECTOR','THE GREEN SECTOR','STANDARD',1,
 'Une anomalie biologique a ete detectee dans le secteur. Les capteurs indiquent une forte concentration de signaux autour d''une zone vegetale.',
 'Je suis au coeur de la ville, mais je ne suis pas fait de beton. Je possede des chemins, mais aucune destination n''est indiquee. Je donne de l''ombre sans avoir de toit, et je change de couleur sans changer de place. Je suis proche de l''histoire, mais je ne suis pas un monument. Mon nom commence par N, mon second mot commence par H. Where am I?',
 'Jardin Nouzhat Hassan','GREEN01'),
('SILENT_TOWER','THE SILENT TOWER','STANDARD',2,
 'Un ancien signal vient d''etre reactive dans le secteur. Sa source reste inconnue. Le protocole de recuperation est lance. Localisez la source et poursuivez la mission.',
 '20 - 15 - 21 - 18 / 8 - 1 - 19 - 19 - 1 - 14. Hint: chaque nombre correspond a une lettre.',
 'Tour Hassan','TOWER02'),
('BLUE_FORTRESS','THE LOST GATE','STANDARD',3,
 'Un signal se cache dans le quartier fortifie au-dessus de l''eau. Exploitez les touristes, les ruelles et les maisons bleues pour le retrouver.',
 'Murs bleus, ruelles etroites et l''ocean au bout de la rue. Une kasbah historique ou chaque porte a sa couleur et ou les chats regnent. Where am I?',
 'Kasbah des Oudayas','FORT03'),
('THE_HARBOUR','THE CONFLUENCE','STANDARD',4,
 'Les missions les plus sociales et les plus chaotiques vivent ici. Suivez l''eau jusqu''a l''endroit ou reposent les bateaux.',
 'La ou le fleuve rejoint la mer et ou les bateaux s''alignent. On vient y marcher, manger et regarder le port. Ni plage, ni port de commerce : un lieu de loisir au bord de l''eau. Where am I?',
 'Marina (Bouregreg)','PORT04');

INSERT INTO mission_tiers (mission_id, difficulty, entry_cost, reward, core_energy, time_limit_min)
SELECT m.id, t.difficulty, t.entry_cost, t.reward, t.core_energy, t.time_limit_min
FROM missions m JOIN (VALUES
  ('SUPPLY_RUN','EASY',0,200,0,NULL),
  ('GREEN_SECTOR','EASY',60,120,10,40),
  ('GREEN_SECTOR','MEDIUM',120,250,22,30),
  ('GREEN_SECTOR','HARD',200,450,38,20),
  ('SILENT_TOWER','EASY',60,120,10,40),
  ('SILENT_TOWER','MEDIUM',120,250,22,30),
  ('SILENT_TOWER','HARD',200,450,38,20),
  ('BLUE_FORTRESS','EASY',60,120,10,40),
  ('BLUE_FORTRESS','MEDIUM',120,250,22,30),
  ('BLUE_FORTRESS','HARD',200,450,38,20),
  ('THE_HARBOUR','EASY',60,120,10,40),
  ('THE_HARBOUR','MEDIUM',120,250,22,30),
  ('THE_HARBOUR','HARD',200,450,38,20)
) AS t(code, difficulty, entry_cost, reward, core_energy, time_limit_min) ON t.code = m.code;

INSERT INTO mission_tasks (mission_id, difficulty, label, description)
SELECT m.id, t.difficulty, t.label, t.description
FROM missions m JOIN (VALUES
  ('GREEN_SECTOR','EASY','Local Signal','Demander a une personne consentante de vous indiquer le chemin vers le Jardin Nouzhat Hassan, puis prendre une photo de l''equipe avec la personne.'),
  ('GREEN_SECTOR','EASY','Local Witness','Demander a quelqu''un s''il connait le nom du jardin et filmer uniquement la reponse audio.'),
  ('GREEN_SECTOR','EASY','Blue Signal','Trouver quelque chose de bleu et prendre une photo de l''equipe avec.'),
  ('GREEN_SECTOR','EASY','NPC Mode','Choisir un membre de l''equipe. Pendant 15 secondes, il doit marcher comme un PNJ devant le public pendant que les deux autres le filment sans qu''il parle.'),
  ('GREEN_SECTOR','EASY','Human Ping','Obtenir un bonjour d''un passant dans une courte video.'),
  ('GREEN_SECTOR','MEDIUM','Foreign Connection','Trouver un touriste/visiteur etranger consentant, lui demander une photo avec l''equipe et obtenir son accord avant de prendre la photo.'),
  ('GREEN_SECTOR','MEDIUM','Local Database','Demander a une personne son endroit prefere a Rabat et enregistrer sa reponse.'),
  ('GREEN_SECTOR','MEDIUM','NPC Search','Trouver quelqu''un portant une couleur determinee par la plateforme et prendre une photo avec lui/elle avec consentement.'),
  ('GREEN_SECTOR','MEDIUM','Random Director','Demander a une personne consentante de choisir une pose pour toute l''equipe, puis prendre une photo en reproduisant exactement sa consigne.'),
  ('GREEN_SECTOR','MEDIUM','Alliance','Convaincre une personne exterieure au jeu de faire un high-five collectif en video.'),
  ('GREEN_SECTOR','HARD','Recruit an NPC','Trouver une personne consentante et lui faire prononcer CIT THE MOON dans une video.'),
  ('GREEN_SECTOR','HARD','Unknown Ally','Obtenir une photo avec deux personnes qui ne se connaissent pas.'),
  ('GREEN_SECTOR','HARD','Three Languages','Trouver une personne capable de dire bienvenue en trois langues differentes et enregistrer les trois reponses.'),
  ('GREEN_SECTOR','HARD','Street Voice','Trouver une personne consentante et lui demander de repondre en video a la question : Si tu avais 10 secondes pour convaincre quelqu''un de visiter Rabat, que lui dirais-tu ?'),
  ('GREEN_SECTOR','HARD','Public Challenge','Convaincre une personne consentante de choisir un membre de l''equipe et de lui donner un defi simple a realiser immediatement. Filmer le defi en entier comme preuve.'),
  ('SILENT_TOWER','EASY','Tower Photo','Photo de l''equipe avec la Tour Hassan.'),
  ('SILENT_TOWER','EASY','High Five','Faire un high-five avec un inconnu consentant.'),
  ('SILENT_TOWER','EASY','Blue Marker','Trouver quelqu''un portant du bleu et prendre une photo avec lui.'),
  ('SILENT_TOWER','EASY','Point The Tower','Faire une video ou les trois membres pointent simultanement vers la Tour.'),
  ('SILENT_TOWER','EASY','Ask Around','Demander a quelqu''un : Vous connaissez la Tour Hassan ?'),
  ('SILENT_TOWER','MEDIUM','Foreign Photographer','Trouver un touriste etranger et lui demander de prendre une photo de l''equipe devant la Tour.'),
  ('SILENT_TOWER','MEDIUM','Group Shot','Trouver un couple/famille consentant et faire une photo de groupe avec eux.'),
  ('SILENT_TOWER','MEDIUM','One Word Rabat','Demander a trois personnes differentes de donner un mot decrivant Rabat.'),
  ('SILENT_TOWER','MEDIUM','Never Been','Trouver quelqu''un qui n''est jamais alle a la Tour Hassan et lui demander pourquoi.'),
  ('SILENT_TOWER','MEDIUM','Pose Match','Reproduire une pose donnee par la plateforme avec un inconnu consentant.'),
  ('SILENT_TOWER','HARD','Foreign Alliance','Trouver deux visiteurs etrangers de nationalites differentes et obtenir une photo avec eux.'),
  ('SILENT_TOWER','HARD','Street Interview','Interviewer 3 personnes en leur demandant : Quel est le premier endroit que vous montreriez a un touriste a Rabat ?'),
  ('SILENT_TOWER','HARD','Movie Scene','Recreer une scene donnee par la plateforme avec au moins une personne exterieure a l''equipe.'),
  ('SILENT_TOWER','HARD','Random Team','Trouver deux personnes qui acceptent de rejoindre l''equipe pour une photo/video de 10 secondes.'),
  ('SILENT_TOWER','HARD','Public Broadcast','Faire prononcer CIT 404 a trois personnes differentes dans une meme video.'),
  ('BLUE_FORTRESS','EASY','Blue Street','Photo de l''equipe dans une rue bleue.'),
  ('BLUE_FORTRESS','EASY','Blue Door','Trouver une porte bleue et faire une photo originale devant.'),
  ('BLUE_FORTRESS','EASY','Photographer','Demander a quelqu''un de prendre une photo de l''equipe.'),
  ('BLUE_FORTRESS','EASY','Pose Match','Reproduire une pose montree sur la mission.'),
  ('BLUE_FORTRESS','EASY','Cat Friend','Trouver un chat et prendre une photo avec lui sans le toucher.'),
  ('BLUE_FORTRESS','MEDIUM','Where Are You From','Trouver un etranger et lui demander : Where are you from?, puis prendre une photo avec lui avec son accord.'),
  ('BLUE_FORTRESS','MEDIUM','Three Colours','Trouver trois portes de couleurs differentes.'),
  ('BLUE_FORTRESS','MEDIUM','Best Pose','Demander a un passant de choisir la meilleure pose pour votre equipe.'),
  ('BLUE_FORTRESS','MEDIUM','New Word','Trouver quelqu''un qui parle une langue que personne dans l''equipe ne parle et apprendre un mot.'),
  ('BLUE_FORTRESS','MEDIUM','Pick A Player','Demander a un inconnu de choisir entre deux membres de l''equipe pour un mini-defi.'),
  ('BLUE_FORTRESS','HARD','International Squad','Obtenir une photo avec deux personnes de nationalites differentes.'),
  ('BLUE_FORTRESS','HARD','Lost Tourist','Demander a un touriste etranger de vous expliquer en anglais/francais son endroit prefere au Maroc.'),
  ('BLUE_FORTRESS','HARD','Director','Laisser un inconnu choisir la pose et filmer votre equipe pendant 10 secondes.'),
  ('BLUE_FORTRESS','HARD','Unexpected Alliance','Convaincre un groupe de 3 personnes de faire une photo team CIT 404 avec vous.'),
  ('BLUE_FORTRESS','HARD','Human Password','Trois personnes differentes doivent chacune vous donner un mot ; les trois mots forment votre mot de passe.'),
  ('THE_HARBOUR','EASY','Water Photo','Photo de l''equipe devant l''eau.'),
  ('THE_HARBOUR','EASY','Point The Boat','Trouver un bateau et prendre une photo ou toute l''equipe le pointe.'),
  ('THE_HARBOUR','EASY','High Five','Faire un high-five avec un passant.'),
  ('THE_HARBOUR','EASY','Water Clip','Faire une video de 5 secondes avec l''eau derriere vous.'),
  ('THE_HARBOUR','EASY','White Marker','Trouver quelqu''un portant du blanc.'),
  ('THE_HARBOUR','MEDIUM','Foreign Photographer','Trouver un etranger et lui demander de prendre une photo de votre equipe.'),
  ('THE_HARBOUR','MEDIUM','The Cap','Obtenir une photo avec quelqu''un qui porte une casquette.'),
  ('THE_HARBOUR','MEDIUM','Beach Or Mountain','Demander a quelqu''un : Plage ou montagne ? et enregistrer sa reponse.'),
  ('THE_HARBOUR','MEDIUM','Two Allies','Trouver deux personnes qui acceptent de faire une photo avec votre equipe.'),
  ('THE_HARBOUR','MEDIUM','Mini Interview','Faire une mini-interview : Quelle est votre activite preferee a Rabat ?'),
  ('THE_HARBOUR','HARD','International Connection','Photo avec deux etrangers de nationalites differentes.'),
  ('THE_HARBOUR','HARD','Street Reporter','Interviewer trois personnes et leur poser exactement la meme question.'),
  ('THE_HARBOUR','HARD','CIT News','Faire un reportage de 30 secondes comme si la Marina venait d''etre piratee par THE CORE.'),
  ('THE_HARBOUR','HARD','Recruitment','Convaincre trois personnes exterieures de faire le signe officiel de CIT 404 en video.'),
  ('THE_HARBOUR','HARD','Human Chain','Obtenir successivement une photo avec 3 personnes differentes, chaque personne devant faire une action imposee.')
) AS t(code, difficulty, label, description) ON t.code = m.code;

-- ENDGAME: single physical-flag submission. Placeholder code set privately before the event.
INSERT INTO endgame_parts (position, title, prompt, access_code, reward_cit, reward_energy, story_fragment) VALUES
(1, 'FINAL TRANSMISSION',
 'You have been collecting fragments across INPT throughout the event. Assemble them and enter the complete flag below.',
 'SET_ENDGAME_FLAG_BEFORE_EVENT', 500, 100,
 'RECOVERY PROTOCOL: COMPLETE. ALL FRAGMENTS: RESTORED. "THANK YOU, OPERATORS. YOU HAVE COMPLETED YOUR PURPOSE." DID YOU RESTORE THE SYSTEM... OR DID YOU JUST SET IT FREE?');
