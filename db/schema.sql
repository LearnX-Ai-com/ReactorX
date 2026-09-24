-- ReactorX schema
-- Applied via db/migrate.mjs (idempotent: safe to re-run)

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

DO $$ BEGIN
  CREATE TYPE content_source AS ENUM ('authored', 'ai_generated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE grade_band AS ENUM ('6-8', '9-10', '11-12');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Full periodic table. Static reference data, not user/AI generated.
CREATE TABLE IF NOT EXISTS elements (
  atomic_number INT PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  period INT NOT NULL,
  "group" INT,
  block TEXT NOT NULL,
  atomic_mass NUMERIC(10,4),
  electron_configuration TEXT,
  common_oxidation_states INT[] DEFAULT '{}',
  electronegativity NUMERIC(4,2),
  phase_at_stp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Molecule 3D descriptors (atoms/bonds/metadata) consumed by the Three.js renderer.
CREATE TABLE IF NOT EXISTS molecules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula TEXT NOT NULL,
  name TEXT NOT NULL,
  source content_source NOT NULL DEFAULT 'authored',
  grade_band grade_band NOT NULL DEFAULT '9-10',
  descriptor JSONB NOT NULL,
  review_status review_status NOT NULL DEFAULT 'approved',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (formula, grade_band)
);
CREATE INDEX IF NOT EXISTS idx_molecules_review_status ON molecules (review_status);
CREATE INDEX IF NOT EXISTS idx_molecules_formula ON molecules (formula);

-- Reactions, including balanced equations and animation descriptors.
CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  reactants TEXT[] NOT NULL,
  products TEXT[] NOT NULL,
  balanced_equation TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  grade_band grade_band NOT NULL DEFAULT '9-10',
  source content_source NOT NULL DEFAULT 'authored',
  descriptor JSONB,
  review_status review_status NOT NULL DEFAULT 'approved',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reactions_review_status ON reactions (review_status);
CREATE INDEX IF NOT EXISTS idx_reactions_type ON reactions (reaction_type);
-- AI-predicted reaction cache key: `reactants` is stored pre-sorted so an
-- order-independent pair lookup ("A+B" and "B+A" are the same reaction)
-- lands on the same row; used as the ON CONFLICT target for the Tier-2 AI
-- reaction lookup in functions/src/index.ts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_pair ON reactions (reactants, grade_band);

-- Half-reactions for redox visualization (electron transfer, oxidation-state change).
CREATE TABLE IF NOT EXISTS redox_half_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reaction_id UUID NOT NULL REFERENCES reactions(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('oxidation', 'reduction')),
  oxidation_state_before INT NOT NULL,
  oxidation_state_after INT NOT NULL,
  electrons_transferred INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_redox_reaction ON redox_half_reactions (reaction_id);

-- Electrolysis scenes: electrode setup + ion migration path for animation.
CREATE TABLE IF NOT EXISTS electrolysis_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  electrolyte TEXT NOT NULL,
  anode_material TEXT NOT NULL,
  cathode_material TEXT NOT NULL,
  grade_band grade_band NOT NULL DEFAULT '11-12',
  ion_migration JSONB NOT NULL,
  source content_source NOT NULL DEFAULT 'authored',
  review_status review_status NOT NULL DEFAULT 'approved',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedupe/audit AI generation calls (molecules, reactions, translations, speech).
CREATE TABLE IF NOT EXISTS generation_cache (
  input_hash TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  model_used TEXT NOT NULL,
  raw_response JSONB,
  result_ref UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit trail for human review of AI-generated content.
CREATE TABLE IF NOT EXISTS moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  reviewer TEXT NOT NULL,
  decision review_status NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_content ON moderation_log (content_type, content_id);

-- Per-language strings for molecules/reactions/UI, same review gate as other AI content.
CREATE TABLE IF NOT EXISTS translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID,
  string_key TEXT,
  language_code TEXT NOT NULL,
  field_name TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source content_source NOT NULL DEFAULT 'authored',
  review_status review_status NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_translations_lookup ON translations (content_type, content_id, language_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_ui_string ON translations (string_key, language_code) WHERE string_key IS NOT NULL;
