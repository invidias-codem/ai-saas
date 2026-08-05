create table if not exists tenant_cli_tokens (
  id text primary key,
  tenant_id text not null,
  user_id text,
  token_hash text not null,
  label text,
  revoked boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_cli_tokens_tenant_id on tenant_cli_tokens(tenant_id);
create index if not exists idx_tenant_cli_tokens_token_hash on tenant_cli_tokens(token_hash);
