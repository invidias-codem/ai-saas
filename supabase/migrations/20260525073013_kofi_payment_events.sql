create table if not exists payment_events (
  id uuid default gen_random_uuid() primary key,
  transaction_id text unique not null,
  email text not null,
  amount text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Essential: Create an index for fast idempotency lookups
create index if not exists idx_payment_events_transaction_id on payment_events(transaction_id);
