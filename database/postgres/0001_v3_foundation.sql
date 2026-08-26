-- ComputeX V3 managed PostgreSQL foundation.
-- Run as the schema owner, then grant the application role only DML privileges.
BEGIN;

CREATE SCHEMA IF NOT EXISTS computex;
SET search_path TO computex, public;

CREATE TABLE IF NOT EXISTS enterprises (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  name text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS members_enterprise_idx ON members(enterprise_id);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  name text NOT NULL,
  budget numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  status text NOT NULL DEFAULT '正常',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_enterprise_status_idx ON projects(enterprise_id, status);

CREATE TABLE IF NOT EXISTS resources (
  id text PRIMARY KEY,
  provider_id text NOT NULL,
  spec text NOT NULL,
  gpu_model text NOT NULL,
  region text NOT NULL,
  price_hour numeric(14,4) NOT NULL CHECK (price_hour >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  status text NOT NULL,
  benchmark numeric(10,2),
  health numeric(5,2) CHECK (health BETWEEN 0 AND 100),
  availability numeric(6,3) CHECK (availability BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resources_market_filter_idx ON resources(status, region, price_hour) INCLUDE (stock, benchmark, availability);

CREATE TABLE IF NOT EXISTS workload_intents (
  id text PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  member_id text NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  workload_type text NOT NULL,
  model_name text,
  model_size_b numeric(10,2) NOT NULL CHECK (model_size_b > 0),
  data_size_gb numeric(14,2) NOT NULL CHECK (data_size_gb >= 0),
  deadline_hours numeric(12,2) NOT NULL CHECK (deadline_hours > 0),
  budget numeric(14,2) NOT NULL CHECK (budget > 0),
  region text,
  compliance jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(compliance) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workload_intents_tenant_created_idx ON workload_intents(enterprise_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recommendations (
  id text PRIMARY KEY,
  intent_id text NOT NULL REFERENCES workload_intents(id) ON DELETE RESTRICT,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  member_id text NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  engine text NOT NULL CHECK (engine IN ('gateway', 'deterministic-fallback')),
  model_id text,
  status text NOT NULL DEFAULT '已生成',
  plans jsonb NOT NULL CHECK (jsonb_typeof(plans) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recommendations_tenant_created_idx ON recommendations(enterprise_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_drafts (
  id text PRIMARY KEY,
  recommendation_id text NOT NULL REFERENCES recommendations(id) ON DELETE RESTRICT,
  plan_id text NOT NULL,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  member_id text NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  resource_id text NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  duration_hours numeric(12,2) NOT NULL CHECK (duration_hours > 0),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  quote jsonb NOT NULL CHECK (jsonb_typeof(quote) = 'object'),
  order_id text,
  status text NOT NULL DEFAULT '草稿',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_drafts_tenant_status_idx ON order_drafts(enterprise_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  instance_id text NOT NULL,
  usage_date date NOT NULL,
  gpu_hours numeric(14,4) NOT NULL CHECK (gpu_hours >= 0),
  gpu_utilization numeric(5,2) NOT NULL CHECK (gpu_utilization BETWEEN 0 AND 100),
  cost numeric(14,4) NOT NULL CHECK (cost >= 0),
  carbon_kg numeric(14,4) NOT NULL DEFAULT 0 CHECK (carbon_kg >= 0),
  source text NOT NULL,
  ingested_at timestamptz NOT NULL,
  UNIQUE(instance_id, usage_date)
);
CREATE INDEX IF NOT EXISTS usage_records_tenant_date_project_idx ON usage_records(enterprise_id, usage_date DESC, project_id) INCLUDE (cost, gpu_utilization, gpu_hours);

CREATE TABLE IF NOT EXISTS approval_policies (
  id text PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name text NOT NULL,
  min_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (min_amount >= 0),
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array'),
  status text NOT NULL DEFAULT '启用',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);
CREATE INDEX IF NOT EXISTS approval_policies_tenant_project_idx ON approval_policies(enterprise_id, project_id, status);

CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  draft_id text NOT NULL REFERENCES order_drafts(id) ON DELETE RESTRICT,
  policy_id text REFERENCES approval_policies(id) ON DELETE RESTRICT,
  applicant_id text NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT '待审批',
  current_step integer NOT NULL DEFAULT 1 CHECK (current_step > 0),
  submitted_at timestamptz NOT NULL,
  decided_at timestamptz,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_active_draft_idx ON approval_requests(draft_id) WHERE status = '待审批';
CREATE INDEX IF NOT EXISTS approval_requests_tenant_status_idx ON approval_requests(enterprise_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS approval_request_steps (
  id text PRIMARY KEY,
  enterprise_id text NOT NULL REFERENCES enterprises(id) ON DELETE RESTRICT,
  request_id text NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_no integer NOT NULL CHECK (step_no > 0),
  approver_id text NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT '等待中',
  comment text CHECK (length(comment) <= 500),
  decided_at timestamptz,
  UNIQUE(request_id, step_no)
);
CREATE INDEX IF NOT EXISTS approval_steps_approver_status_idx ON approval_request_steps(enterprise_id, approver_id, status, request_id);

-- The API must SET LOCAL app.enterprise_id and app.user_id inside every transaction.
ALTER TABLE workload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_request_steps ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workload_intents','recommendations','order_drafts','usage_records','approval_policies','approval_requests','approval_request_steps']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON computex.%I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON computex.%I USING (enterprise_id = current_setting(''app.enterprise_id'', true)) WITH CHECK (enterprise_id = current_setting(''app.enterprise_id'', true))',
      table_name
    );
  END LOOP;
END $$;

COMMIT;
