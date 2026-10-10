-- =====================================================================
--  CIT: 404 - RECOVERY PROTOCOL : SCHEMA
--  PostgreSQL 14+
--
--  Principe directeur : le LEDGER (journal) est la source de verite.
--  team_inventory et teams.cit_balance ne sont que des PROJECTIONS,
--  recalculables a tout moment depuis le ledger. Cela donne a la
--  plateforme admin un audit complet : qui a achete quoi, quand,
--  pour combien, et quel etait le solde apres l'operation.
-- =====================================================================

DROP VIEW  IF EXISTS v_leaderboard        CASCADE;
DROP VIEW  IF EXISTS v_item_popularity    CASCADE;
DROP VIEW  IF EXISTS v_team_items         CASCADE;
DROP VIEW  IF EXISTS v_team_stats         CASCADE;
DROP TABLE IF EXISTS notifications        CASCADE;
DROP TABLE IF EXISTS team_endgame         CASCADE;
DROP TABLE IF EXISTS endgame_parts        CASCADE;
DROP TABLE IF EXISTS team_mission_access  CASCADE;
DROP TABLE IF EXISTS mission_tiers        CASCADE;
DROP TABLE IF EXISTS ledger               CASCADE;
DROP TABLE IF EXISTS submissions          CASCADE;
DROP TABLE IF EXISTS team_inventory       CASCADE;
DROP TABLE IF EXISTS team_missions        CASCADE;
DROP TABLE IF EXISTS sessions             CASCADE;
DROP TABLE IF EXISTS operators            CASCADE;
DROP TABLE IF EXISTS admins               CASCADE;
DROP TABLE IF EXISTS items                CASCADE;
DROP TABLE IF EXISTS missions             CASCADE;
DROP TABLE IF EXISTS challenges           CASCADE;
DROP TABLE IF EXISTS teams                CASCADE;
DROP TABLE IF EXISTS phase_config         CASCADE;
DROP TABLE IF EXISTS game_state           CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. EQUIPES - un compte partage par 3 operateurs
-- ---------------------------------------------------------------------
CREATE TABLE teams (
    id             SERIAL PRIMARY KEY,
    team_name      VARCHAR(64) UNIQUE NOT NULL,
    -- Code d'acces partage par les 3 operateurs de l'equipe.
    -- Stocke HASHE (bcrypt) : jamais en clair en base.
    join_code_hash TEXT        NOT NULL,
    -- Projections : recalculables via SUM(ledger.amount)
    cit_balance    INTEGER     NOT NULL DEFAULT 0 CHECK (cit_balance >= 0),
    core_energy    INTEGER     NOT NULL DEFAULT 0 CHECK (core_energy >= 0),
    is_locked      BOOLEAN     NOT NULL DEFAULT FALSE,  -- gel admin
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. OPERATEURS - les 3 personnes derriere un compte equipe.
-- ---------------------------------------------------------------------
CREATE TABLE operators (
    id         SERIAL PRIMARY KEY,
    team_id    INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    nickname   VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (team_id, nickname)
);

-- ---------------------------------------------------------------------
-- 3. ADMINS
-- ---------------------------------------------------------------------
CREATE TABLE admins (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,   -- bcrypt
    role          VARCHAR(16) NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'mission_admin', 'superadmin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 4. SESSIONS - refresh tokens revocables (un par appareil)
-- ---------------------------------------------------------------------
CREATE TABLE sessions (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type       VARCHAR(16) NOT NULL CHECK (subject_type IN ('team','admin')),
    team_id            INTEGER     REFERENCES teams(id)     ON DELETE CASCADE,
    admin_id           INTEGER     REFERENCES admins(id)    ON DELETE CASCADE,
    operator_id        INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    refresh_token_hash TEXT        NOT NULL,
    user_agent         TEXT,
    ip                 TEXT,
    expires_at         TIMESTAMPTZ NOT NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (subject_type = 'team'  AND team_id  IS NOT NULL AND admin_id IS NULL) OR
        (subject_type = 'admin' AND admin_id IS NOT NULL AND team_id  IS NULL)
    )
);
CREATE INDEX idx_sessions_lookup ON sessions (refresh_token_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_team   ON sessions (team_id)            WHERE revoked_at IS NULL;

-- =====================================================================
--  5. ETAT DU JEU ET PHASES
--
--  Une seule phase est jouable a la fois. Les onglets des autres phases
--  s'affichent verrouilles cote operateur, et le backend refuse toute
--  action qui n'appartient pas a la phase courante. Au demarrage la
--  phase est LOBBY : tout est verrouille.
-- =====================================================================
CREATE TABLE game_state (
    id            SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    phase         VARCHAR(16) NOT NULL DEFAULT 'LOBBY'
                  CHECK (phase IN ('LOBBY','CHALLENGES','MISSIONS','ENDGAME','CLOSED')),
    phase_started_at TIMESTAMPTZ,
    phase_ends_at    TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO game_state (id, phase) VALUES (1, 'LOBBY');

-- Duree par defaut de chaque phase. L'admin peut basculer a tout moment ;
-- le chrono repart alors sur la duree definie ici.
CREATE TABLE phase_config (
    phase        VARCHAR(16) PRIMARY KEY
                 CHECK (phase IN ('CHALLENGES','MISSIONS','ENDGAME')),
    duration_min INTEGER NOT NULL CHECK (duration_min > 0),
    label        VARCHAR(64) NOT NULL
);
INSERT INTO phase_config (phase, duration_min, label) VALUES
    ('CHALLENGES', 120, 'Digital Arena'),
    ('MISSIONS',   180, 'Field Operations'),
    ('ENDGAME',     90, 'Recovery Protocol');

-- ---------------------------------------------------------------------
-- 6. PHASE CHALLENGES - Digital Arena
-- ---------------------------------------------------------------------
CREATE TABLE challenges (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(32)  UNIQUE NOT NULL,  -- 'CP-01', 'CTF-04'...
    category    VARCHAR(8)   NOT NULL CHECK (category IN ('CP','CTF','DATA')),
    difficulty  SMALLINT     NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    reward      INTEGER      NOT NULL CHECK (reward > 0),
    core_energy INTEGER      NOT NULL DEFAULT 5 CHECK (core_energy >= 0),
    -- Prime versee a la PREMIERE equipe qui resout ce challenge.
    first_blood_cit    INTEGER NOT NULL DEFAULT 0 CHECK (first_blood_cit >= 0),
    first_blood_energy INTEGER NOT NULL DEFAULT 0 CHECK (first_blood_energy >= 0),
    title       VARCHAR(128) NOT NULL,
    description TEXT,
    subcategory VARCHAR(32),
    resource_type VARCHAR(16) NOT NULL DEFAULT 'STATIC'
                  CHECK (resource_type IN ('STATIC','EXTERNAL','DOWNLOAD','SERVICE')),
    resource_url TEXT,
    instructions TEXT,
    -- Le flag est HASHE : un dump de la base ne donne pas les reponses.
    flag_hash   TEXT         NOT NULL,
    hint1       TEXT,          -- revealed when the team uses HINT_L1
    hint2       TEXT,          -- revealed when the team uses HINT_L2
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE submissions (
    id           BIGSERIAL PRIMARY KEY,
    team_id      INTEGER     NOT NULL REFERENCES teams(id)      ON DELETE CASCADE,
    challenge_id INTEGER     NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    operator_id  INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    is_correct   BOOLEAN     NOT NULL,
    -- Vrai pour la toute premiere equipe a resoudre ce challenge.
    is_first_blood BOOLEAN   NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Une equipe ne peut valider un challenge qu'une seule fois.
CREATE UNIQUE INDEX idx_one_solve_per_team
    ON submissions (team_id, challenge_id) WHERE is_correct;
-- Un seul first blood par challenge, garanti par la base et pas par le code.
CREATE UNIQUE INDEX idx_one_first_blood
    ON submissions (challenge_id) WHERE is_first_blood;
CREATE INDEX idx_submissions_team ON submissions (team_id, submitted_at DESC);

-- =====================================================================
--  7. PHASE MISSIONS - operations de terrain
--
--  Deroule d'une mission :
--    1. L'equipe lit location_hint et part chercher le lieu.
--    2. Sur place, un admin lui donne access_code (ou elle achete l'item
--       de coordonnees, qui revele coordinates sans se deplacer a l'aveugle).
--    3. Le code saisi cree une ligne dans team_mission_access : le bouton
--       de deploiement passe du jaune au vert.
--    4. L'equipe choisit une difficulte (mission_tiers) et deploie.
-- =====================================================================
CREATE TABLE missions (
    id             SERIAL PRIMARY KEY,
    code           VARCHAR(32)  UNIQUE NOT NULL,
    mission_name   VARCHAR(128) NOT NULL,
    -- SPECIAL : la mission de depannage, gratuite, affichee en tete de liste.
    kind           VARCHAR(16)  NOT NULL DEFAULT 'STANDARD'
                   CHECK (kind IN ('STANDARD','SPECIAL')),
    description    TEXT         NOT NULL,
    -- Ce que les operateurs lisent pour trouver le lieu.
    location_hint  TEXT,
    -- Revele par l'item ACCESS_COORD, jamais envoye avant achat.
    coordinates    TEXT,
    -- Lu par les admins sur place et dicte aux equipes. En clair : il n'a
    -- de valeur que sur le terrain, et l'admin doit pouvoir l'afficher.
    access_code    VARCHAR(32),
    position       SMALLINT     NOT NULL DEFAULT 0,  -- ordre d'affichage
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Une mission propose trois niveaux : plus c'est dur, plus ca coute et
-- plus ca rapporte (CIT$ et energie).
CREATE TABLE mission_tiers (
    mission_id     INTEGER     NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    difficulty     VARCHAR(8)  NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
    entry_cost     INTEGER     NOT NULL CHECK (entry_cost >= 0),
    reward         INTEGER     NOT NULL CHECK (reward >= 0),
    core_energy    INTEGER     NOT NULL DEFAULT 0 CHECK (core_energy >= 0),
    time_limit_min INTEGER,
    PRIMARY KEY (mission_id, difficulty)
);

-- Each tier offers several field tasks; the platform assigns ONE at random
-- when a team deploys, so teams cannot cherry-pick the easiest task.
CREATE TABLE mission_tasks (
    id          SERIAL PRIMARY KEY,
    mission_id  INTEGER     NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    difficulty  VARCHAR(8)  NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
    label       VARCHAR(64) NOT NULL,
    description TEXT        NOT NULL
);
CREATE INDEX idx_mission_tasks ON mission_tasks (mission_id, difficulty);

-- Une ligne = cette equipe a debloque l'acces a cette mission.
CREATE TABLE team_mission_access (
    team_id     INTEGER     NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
    mission_id  INTEGER     NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    method      VARCHAR(16) NOT NULL CHECK (method IN ('CODE','ITEM','ADMIN')),
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, mission_id)
);

CREATE TABLE team_missions (
    id            BIGSERIAL PRIMARY KEY,
    team_id       INTEGER     NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
    mission_id    INTEGER     NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    difficulty    VARCHAR(8)  NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
    status        VARCHAR(16) NOT NULL DEFAULT 'PURCHASED'
                  CHECK (status IN ('PURCHASED','COMPLETED','FAILED','REFUNDED')),
    paid_amount   INTEGER     NOT NULL,
    purchased_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at   TIMESTAMPTZ,
    resolved_at   TIMESTAMPTZ,
    assigned_task_id INTEGER  REFERENCES mission_tasks(id) ON DELETE SET NULL,
    resolved_by   INTEGER     REFERENCES admins(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_one_active_purchase
    ON team_missions (team_id, mission_id)
    WHERE status IN ('PURCHASED','COMPLETED');

-- =====================================================================
--  8. PHASE ENDGAME - six fragments a reconstituer
--
--  Chaque partie se debloque avec un code remis par un admin et rend un
--  morceau de l'histoire, des CIT$ et de l'energie. La progression de
--  l'equipe est le nombre de parties resolues sur le total.
-- =====================================================================
CREATE TABLE endgame_parts (
    id             SERIAL PRIMARY KEY,
    position       SMALLINT     NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 20),
    title          VARCHAR(128) NOT NULL,
    prompt         TEXT         NOT NULL,   -- ce que l'equipe doit chercher
    access_code    TEXT         NOT NULL,   -- dicte par un admin (flag complet)
    reward_cit     INTEGER      NOT NULL DEFAULT 0 CHECK (reward_cit >= 0),
    reward_energy  INTEGER      NOT NULL DEFAULT 0 CHECK (reward_energy >= 0),
    story_fragment TEXT         NOT NULL,   -- revele une fois le code valide
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE team_endgame (
    team_id     INTEGER     NOT NULL REFERENCES teams(id)          ON DELETE CASCADE,
    part_id     INTEGER     NOT NULL REFERENCES endgame_parts(id)  ON DELETE CASCADE,
    operator_id INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    solved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, part_id)
);

-- =====================================================================
--  9. NOTIFICATIONS - messages de l'admin vers une equipe
--
--  NORMAL : une information, lue quand l'equipe veut.
--  URGENT : une injonction avec chrono. L'operateur doit la fermer
--           explicitement (accuse de reception), et si le delai expire
--           sans validation admin, l'equipe perd ce que l'admin a decide.
-- =====================================================================
CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    team_id         INTEGER     NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
    admin_id        INTEGER     REFERENCES admins(id) ON DELETE SET NULL,
    kind            VARCHAR(8)  NOT NULL CHECK (kind IN ('NORMAL','URGENT')),
    title           VARCHAR(128) NOT NULL,
    body            TEXT        NOT NULL,
    -- Urgent uniquement
    deadline_at     TIMESTAMPTZ,
    penalty_cit     INTEGER     NOT NULL DEFAULT 0 CHECK (penalty_cit >= 0),
    penalty_energy  INTEGER     NOT NULL DEFAULT 0 CHECK (penalty_energy >= 0),
    reward_cit      INTEGER     NOT NULL DEFAULT 0 CHECK (reward_cit >= 0),
    status          VARCHAR(16) NOT NULL DEFAULT 'SENT'
                    CHECK (status IN ('SENT','COMPLETED','FAILED','EXPIRED')),
    read_at         TIMESTAMPTZ,   -- notification normale ouverte
    acknowledged_at TIMESTAMPTZ,   -- pop-up urgent ferme par l'operateur
    resolved_at     TIMESTAMPTZ,
    resolved_by     INTEGER     REFERENCES admins(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Un urgent sans delai ne pourrait jamais expirer : on l'interdit.
    CHECK (kind = 'NORMAL' OR deadline_at IS NOT NULL)
);
CREATE INDEX idx_notifications_team ON notifications (team_id, created_at DESC);
CREATE INDEX idx_notifications_open ON notifications (status) WHERE status = 'SENT';

-- =====================================================================
--  10. LES ITEMS
-- =====================================================================

-- 10a. CATALOGUE : la definition d'un item, partagee par tout le monde.
CREATE TABLE items (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(32) UNIQUE NOT NULL,
    name          VARCHAR(64) NOT NULL,
    item_type     VARCHAR(16) NOT NULL
                  CHECK (item_type IN ('HINT','INSURANCE','BOOST','ACCESS','MISSION_TOOL')),
    cost          INTEGER     NOT NULL CHECK (cost >= 0),
    icon          VARCHAR(24) NOT NULL DEFAULT 'package',
    effect        TEXT        NOT NULL,
    -- Parametres libres de l'effet, sans migration de schema.
    payload       JSONB       NOT NULL DEFAULT '{}',
    -- Un item applicable a une mission est proposable depuis son panneau.
    applies_to    VARCHAR(16) NOT NULL DEFAULT 'ANY'
                  CHECK (applies_to IN ('ANY','MISSION','CHALLENGE','ENDGAME')),
    is_consumable BOOLEAN     NOT NULL DEFAULT TRUE,
    max_per_team  INTEGER,
    stock         INTEGER,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE
);

-- 10b. INVENTAIRE : l'etat COURANT de chaque equipe.
CREATE TABLE team_inventory (
    team_id         INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    item_id         INTEGER     NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quantity        INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    total_bought    INTEGER     NOT NULL DEFAULT 0,
    total_used      INTEGER     NOT NULL DEFAULT 0,
    first_bought_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, item_id)
);
CREATE INDEX idx_inventory_item ON team_inventory (item_id);

-- 10c. LEDGER : journal append-only de TOUT mouvement.
CREATE TABLE ledger (
    id            BIGSERIAL PRIMARY KEY,
    team_id       INTEGER     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    operator_id   INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
    kind          VARCHAR(24) NOT NULL CHECK (kind IN (
                      'CHALLENGE_REWARD','FIRST_BLOOD','ITEM_PURCHASE','ITEM_USE',
                      'MISSION_PURCHASE','MISSION_REWARD','ENDGAME_REWARD',
                      'NOTIF_REWARD','NOTIF_PENALTY','DCR_REWARD','ADMIN_ADJUST','SEED'
                  )),
    -- Signe : positif = credit, negatif = debit. 0 pour un ITEM_USE.
    amount        INTEGER     NOT NULL,
    balance_after INTEGER     NOT NULL,
    -- Energie gagnee ou perdue sur ce mouvement, et son etat resultant.
    energy_delta  INTEGER     NOT NULL DEFAULT 0,
    energy_after  INTEGER     NOT NULL DEFAULT 0,
    item_id         INTEGER   REFERENCES items(id)          ON DELETE SET NULL,
    challenge_id    INTEGER   REFERENCES challenges(id)     ON DELETE SET NULL,
    mission_id      INTEGER   REFERENCES missions(id)       ON DELETE SET NULL,
    endgame_part_id INTEGER   REFERENCES endgame_parts(id)  ON DELETE SET NULL,
    notification_id BIGINT    REFERENCES notifications(id)  ON DELETE SET NULL,
    admin_id        INTEGER   REFERENCES admins(id)         ON DELETE SET NULL,
    quantity      INTEGER     NOT NULL DEFAULT 1,
    note          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_team ON ledger (team_id, created_at DESC);
CREATE INDEX idx_ledger_kind ON ledger (kind, created_at DESC);
CREATE INDEX idx_ledger_feed ON ledger (created_at DESC);

-- =====================================================================
--  DCR — DATA CORE RETRIEVAL
-- =====================================================================

-- DCR tables for the GAME database (the one that holds teams, ledger,
-- sessions). NOT the DCR data database. Run once as the owner of the game
-- database. Safe to re-run.
--
-- The type of team_id is read from teams.id so the foreign key matches
-- whatever that column is (integer, bigint, uuid, ...).

DO $$
DECLARE
  team_type text := 'integer';
  fk        text := '';
BEGIN
  IF to_regclass('public.teams') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod) INTO team_type
      FROM pg_attribute a
     WHERE a.attrelid = 'public.teams'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
    fk := ' REFERENCES teams (id)';
  END IF;

  CREATE TABLE IF NOT EXISTS dcr_missions (
    id                   text PRIMARY KEY,                       -- 'M01' ... 'M15'
    level                integer NOT NULL CHECK (level BETWEEN 1 AND 4),
    title                text NOT NULL,
    story                text NOT NULL,
    question             text NOT NULL,
    answer_format        text NOT NULL,
    reward_cit           integer NOT NULL CHECK (reward_cit >= 0),
    reward_ce            integer NOT NULL CHECK (reward_ce >= 0),
    prerequisite         text REFERENCES dcr_missions (id),      -- M04 <- M03, M10 <- M09
    first_blood_eligible boolean NOT NULL DEFAULT false,         -- levels 2, 3, 4
    answer_hash          text NOT NULL,                          -- HMAC-SHA256, never the answer itself
    epilogue             text                                    -- only M15
  );

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS dcr_solves (
      team_id     %s NOT NULL%s,
      mission_id  text NOT NULL REFERENCES dcr_missions (id),
      nickname    text NOT NULL,
      solved_at   timestamptz NOT NULL DEFAULT now(),
      first_blood boolean NOT NULL DEFAULT false,
      cit_paid    integer NOT NULL,
      ce_paid     integer NOT NULL,
      PRIMARY KEY (team_id, mission_id)                          -- paid once per team and mission
    )$f$, team_type, fk);

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS dcr_attempts (
      attempt_id   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      team_id      %s NOT NULL%s,
      mission_id   text NOT NULL REFERENCES dcr_missions (id),
      nickname     text NOT NULL,
      correct      boolean NOT NULL,
      submitted_at timestamptz NOT NULL DEFAULT now()
    )$f$, team_type, fk);

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS dcr_query_log (
      query_id   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      team_id    %s NOT NULL%s,
      nickname   text,
      sql_text   text NOT NULL,
      ok         boolean NOT NULL,
      ms         integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )$f$, team_type, fk);
END $$;

CREATE INDEX IF NOT EXISTS dcr_attempts_recent_idx ON dcr_attempts (team_id, mission_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS dcr_solves_mission_idx  ON dcr_solves (mission_id, solved_at);
CREATE INDEX IF NOT EXISTS dcr_query_log_team_idx  ON dcr_query_log (team_id, created_at DESC);


-- =====================================================================
--  VUES POUR LA PLATEFORME ADMIN
-- =====================================================================

CREATE VIEW v_team_stats AS
SELECT
    t.id,
    t.team_name,
    t.cit_balance,
    t.core_energy,
    t.is_locked,
    COALESCE(s.solved_cp,   0) AS solved_cp,
    COALESCE(s.solved_ctf,  0) AS solved_ctf,
    COALESCE(s.solved_data, 0) AS solved_data,
    COALESCE(s.first_bloods,0) AS first_bloods,
    COALESCE(s.attempts,    0) AS total_attempts,
    COALESCE(s.wrong,       0) AS wrong_attempts,
    COALESCE(m.missions_bought,    0) AS missions_bought,
    COALESCE(m.missions_completed, 0) AS missions_completed,
    COALESCE(m.missions_failed,    0) AS missions_failed,
    COALESCE(e.endgame_solved, 0) AS endgame_solved,
    (SELECT COUNT(*)::int FROM endgame_parts WHERE is_active) AS endgame_total,
    COALESCE(i.items_held,   0) AS items_held,
    COALESCE(i.items_bought, 0) AS items_bought,
    COALESCE(l.earned,       0) AS total_earned,
    COALESCE(l.spent,        0) AS total_spent,
    COALESCE(n.open_urgent,  0) AS open_urgent,
    l.last_activity_at,
    COALESCE(o.operator_count, 0) AS operator_count
FROM teams t
LEFT JOIN (
    SELECT sub.team_id,
           COUNT(*) FILTER (WHERE sub.is_correct AND c.category = 'CP')   AS solved_cp,
           COUNT(*) FILTER (WHERE sub.is_correct AND c.category = 'CTF')  AS solved_ctf,
           COUNT(*) FILTER (WHERE sub.is_correct AND c.category = 'DATA') AS solved_data,
           COUNT(*) FILTER (WHERE sub.is_first_blood)                     AS first_bloods,
           COUNT(*)                                   AS attempts,
           COUNT(*) FILTER (WHERE NOT sub.is_correct) AS wrong
    FROM submissions sub
    JOIN challenges c ON c.id = sub.challenge_id
    GROUP BY sub.team_id
) s ON s.team_id = t.id
LEFT JOIN (
    SELECT team_id,
           COUNT(*)                                     AS missions_bought,
           COUNT(*) FILTER (WHERE status = 'COMPLETED') AS missions_completed,
           COUNT(*) FILTER (WHERE status = 'FAILED')    AS missions_failed
    FROM team_missions GROUP BY team_id
) m ON m.team_id = t.id
LEFT JOIN (
    SELECT team_id, COUNT(*) AS endgame_solved FROM team_endgame GROUP BY team_id
) e ON e.team_id = t.id
LEFT JOIN (
    SELECT team_id,
           SUM(quantity)     AS items_held,
           SUM(total_bought) AS items_bought
    FROM team_inventory GROUP BY team_id
) i ON i.team_id = t.id
LEFT JOIN (
    SELECT team_id,
           SUM(amount) FILTER (WHERE amount > 0)  AS earned,
           -SUM(amount) FILTER (WHERE amount < 0) AS spent,
           MAX(created_at)                        AS last_activity_at
    FROM ledger GROUP BY team_id
) l ON l.team_id = t.id
LEFT JOIN (
    SELECT team_id, COUNT(*) AS open_urgent
    FROM notifications WHERE kind = 'URGENT' AND status = 'SENT'
    GROUP BY team_id
) n ON n.team_id = t.id
LEFT JOIN (
    SELECT team_id, COUNT(*) AS operator_count FROM operators GROUP BY team_id
) o ON o.team_id = t.id;

CREATE VIEW v_team_items AS
SELECT ti.team_id, t.team_name,
       i.id AS item_id, i.code, i.name, i.item_type, i.icon, i.cost,
       ti.quantity, ti.total_bought, ti.total_used, ti.updated_at
FROM team_inventory ti
JOIN items i ON i.id = ti.item_id
JOIN teams t ON t.id = ti.team_id;

CREATE VIEW v_item_popularity AS
SELECT i.id, i.code, i.name, i.item_type, i.cost,
       COALESCE(SUM(ti.total_bought), 0)                    AS units_sold,
       COALESCE(SUM(ti.total_bought), 0) * i.cost           AS revenue,
       COUNT(ti.team_id) FILTER (WHERE ti.total_bought > 0) AS teams_owning
FROM items i
LEFT JOIN team_inventory ti ON ti.item_id = i.id
GROUP BY i.id;

CREATE VIEW v_leaderboard AS
SELECT id, team_name, cit_balance, core_energy,
       solved_cp + solved_ctf + solved_data
         + (SELECT COUNT(*) FROM dcr_solves d WHERE d.team_id = v_team_stats.id) AS total_solved,
       first_bloods
         + (SELECT COUNT(*) FROM dcr_solves d WHERE d.team_id = v_team_stats.id AND d.first_blood) AS first_bloods,
       missions_completed, endgame_solved, endgame_total, total_earned,
       RANK() OVER (ORDER BY core_energy DESC, total_earned DESC) AS rank
FROM v_team_stats;
