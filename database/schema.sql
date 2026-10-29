-- ============================================================
-- Portail monétique : modèle physique de données (PostgreSQL)
-- Fichier : database/schema.sql
-- À exécuter une seule fois sur une base vide (Neon, environnement
-- de développement d'abord, puis production).
-- Retour arrière : database/rollback.sql
--
-- Conventions (cadre de projet, section 7.5) : noms de tables au
-- pluriel, en minuscules, mots séparés par un tiret bas ; noms de
-- colonnes en minuscules, sans préfixe de table.
-- ============================================================

-- ------------------------------------------------------------
-- profils : les trois profils de l'application
-- ------------------------------------------------------------
CREATE TABLE profils (
    id       SERIAL PRIMARY KEY,
    libelle  VARCHAR(20) NOT NULL UNIQUE
             CHECK (libelle IN ('admin', 'po', 'client'))
);

-- ------------------------------------------------------------
-- entreprises : les commerçants (comptes clients)
-- Formats imposés par les spécifications : SIREN sur 9 chiffres,
-- raison sociale limitée à 20 caractères, devise ISO sur 3 lettres.
-- La raison sociale est en VARCHAR(20) et non en CHAR(20) pour ne
-- pas ajouter d'espaces de remplissage à l'affichage.
-- ------------------------------------------------------------
CREATE TABLE entreprises (
    numero_siren    CHAR(9) PRIMARY KEY
                    CHECK (numero_siren ~ '^[0-9]{9}$'),
    raison_sociale  VARCHAR(20) NOT NULL,
    devise          CHAR(3) NOT NULL DEFAULT 'EUR',
    est_active      BOOLEAN NOT NULL DEFAULT TRUE
);

-- ------------------------------------------------------------
-- utilisateurs : comptes de connexion
-- numero_siren est renseigné pour un client et vide pour l'admin
-- et le Product Owner. Cette règle est contrôlée par l'application
-- (un CHECK ne peut pas lire la table profils).
-- tentatives_echouees sert à l'avertissement après deux échecs
-- et au blocage temporaire à la troisième tentative (story E6-TS5).
-- ------------------------------------------------------------
CREATE TABLE utilisateurs (
    id                   SERIAL PRIMARY KEY,
    login                VARCHAR(50) NOT NULL UNIQUE,
    mot_de_passe_hash    VARCHAR(255) NOT NULL,
    profil_id            INTEGER NOT NULL REFERENCES profils (id),
    numero_siren         CHAR(9) REFERENCES entreprises (numero_siren),
    tentatives_echouees  SMALLINT NOT NULL DEFAULT 0
                         CHECK (tentatives_echouees >= 0),
    -- Fin du blocage temporaire ; NULL si aucun blocage.
    bloque_jusqua        TIMESTAMPTZ DEFAULT NULL,
    -- Aucun accord n'est inventé pour les anciens comptes ; les créations le tracent.
    accord_po_le         TIMESTAMPTZ DEFAULT NULL,
    cree_par             INTEGER DEFAULT NULL REFERENCES utilisateurs (id),
    est_actif            BOOLEAN NOT NULL DEFAULT TRUE,
    date_creation        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- État révocable des connexions ; aucun cookie ni secret n’est stocké.
CREATE TABLE public.sessions (
    id                  UUID PRIMARY KEY,
    utilisateur_id      INTEGER NOT NULL
                        CONSTRAINT sessions_utilisateur_id_fkey
                        REFERENCES public.utilisateurs (id) ON DELETE CASCADE,
    date_creation       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_expiration     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
    date_revocation     TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT sessions_revocation_check
        CHECK (date_revocation IS NULL OR date_revocation >= date_creation)
);

CREATE INDEX idx_sessions_utilisateur
    ON public.sessions (utilisateur_id);
CREATE INDEX idx_sessions_expiration
    ON public.sessions (date_expiration, id);

-- ------------------------------------------------------------
-- motifs_impayes : table des huit motifs codifiés
-- Le Product Owner autorise plus de 20 caractères depuis le 28/10/2026.
-- libelle est la seule référence d'affichage ; description reste pour compatibilité.
-- ------------------------------------------------------------
CREATE TABLE motifs_impayes (
    id           SERIAL PRIMARY KEY,
    code         CHAR(2) NOT NULL UNIQUE
                 CHECK (code ~ '^0[1-8]$'),
    libelle      VARCHAR(80) NOT NULL,
    description  VARCHAR(100) NOT NULL
);

-- ------------------------------------------------------------
-- remises : bordereau généré lors d'un dépôt d'argent à la banque
-- Les montants sont stockés positifs ; le signe est porté par la
-- colonne sens ('+' ou '-'), comme dans les tableaux attendus.
-- Montant en NUMERIC(7,2) : cinq chiffres avant la virgule et deux
-- après : le Product Owner confirme sept chiffres dont deux décimales,
-- soit un maximum de 99 999,99.
-- ------------------------------------------------------------
CREATE TABLE remises (
    id               SERIAL PRIMARY KEY,
    numero_siren     CHAR(9) NOT NULL REFERENCES entreprises (numero_siren),
    numero_remise    VARCHAR(20) NOT NULL UNIQUE,
    date_remise      DATE NOT NULL,
    nb_transactions  SMALLINT NOT NULL
                     CHECK (nb_transactions BETWEEN 0 AND 999),
    montant_total    NUMERIC(7,2) NOT NULL CHECK (montant_total >= 0),
    sens             CHAR(1) NOT NULL CHECK (sens IN ('+', '-')),
    devise           CHAR(3) NOT NULL DEFAULT 'EUR'
);

-- ------------------------------------------------------------
-- transactions : lignes de détail d'une remise
-- numero_carte est stocké déjà masqué (5 chiffres, 7 étoiles,
-- 4 chiffres) : le numéro complet n'entre jamais dans la base.
-- Une transaction est un impayé quand motif_impaye_id et
-- numero_dossier_impaye sont renseignés ensemble ; son sens est
-- alors '-'.
-- ------------------------------------------------------------
CREATE TABLE transactions (
    id                     SERIAL PRIMARY KEY,
    remise_id              INTEGER NOT NULL
                           REFERENCES remises (id) ON DELETE CASCADE,
    numero_carte           CHAR(16) NOT NULL
                           CHECK (numero_carte ~ '^[0-9]{5}\*{7}[0-9]{4}$'),
    numero_autorisation    CHAR(6) NOT NULL UNIQUE,
    date_vente             DATE NOT NULL,
    montant                NUMERIC(7,2) NOT NULL CHECK (montant >= 0),
    reseau                 CHAR(2) NOT NULL CHECK (reseau IN ('CB', 'VS', 'MC')),
    sens                   CHAR(1) NOT NULL CHECK (sens IN ('+', '-')),
    motif_impaye_id        INTEGER REFERENCES motifs_impayes (id),
    numero_dossier_impaye  CHAR(5),
    CHECK ((motif_impaye_id IS NULL) = (numero_dossier_impaye IS NULL)),
    CHECK (motif_impaye_id IS NULL OR sens = '-')
);

-- ------------------------------------------------------------
-- annonces_tresorerie : une annonce par compte et par date de valeur
-- Le montant total est signé : un solde négatif s'affiche en rouge.
-- ------------------------------------------------------------
CREATE TABLE annonces_tresorerie (
    id               SERIAL PRIMARY KEY,
    numero_siren     CHAR(9) NOT NULL REFERENCES entreprises (numero_siren),
    date_valeur      DATE NOT NULL,
    nb_transactions  SMALLINT NOT NULL
                     CHECK (nb_transactions BETWEEN 0 AND 999),
    montant_total    NUMERIC(7,2) NOT NULL,
    devise           CHAR(3) NOT NULL DEFAULT 'EUR',
    UNIQUE (numero_siren, date_valeur)
);

-- ------------------------------------------------------------
-- Index : accélèrent les recherches par compte et par période
-- ------------------------------------------------------------
CREATE INDEX idx_remises_siren_date ON remises (numero_siren, date_remise);
CREATE INDEX idx_transactions_remise ON transactions (remise_id);
CREATE INDEX idx_transactions_impayes ON transactions (motif_impaye_id)
    WHERE motif_impaye_id IS NOT NULL;
CREATE INDEX idx_annonces_siren_date ON annonces_tresorerie (numero_siren, date_valeur);
