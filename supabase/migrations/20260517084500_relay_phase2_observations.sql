-- Phase 2 Relay Observations and Command Updates

CREATE TABLE IF NOT EXISTS relay_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  active_app TEXT,
  screen_context_summary TEXT,
  file_context JSONB,
  network_class TEXT,
  battery_state TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS relay_observations_user_id_idx ON relay_observations(user_id);
CREATE INDEX IF NOT EXISTS relay_observations_device_id_idx ON relay_observations(device_id);

ALTER TABLE relay_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own relay observations"
    ON relay_observations FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Add task_id and result_payload to relay_commands if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='relay_commands' AND column_name='task_id') THEN
        ALTER TABLE relay_commands ADD COLUMN task_id UUID;
        CREATE INDEX relay_commands_task_id_idx ON relay_commands(task_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='relay_commands' AND column_name='result_payload') THEN
        ALTER TABLE relay_commands ADD COLUMN result_payload JSONB;
    END IF;
END $$;
