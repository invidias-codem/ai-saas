-- Create user_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  preferred_image_model TEXT DEFAULT 'flux-schnell',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to select their own settings
CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid()::text = user_id);

-- Create policy to allow users to insert/update their own settings
CREATE POLICY "Users can insert/update their own settings"
  ON user_settings FOR ALL
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_user_settings_updated_at ON user_settings;
CREATE TRIGGER trigger_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_user_settings_updated_at();
