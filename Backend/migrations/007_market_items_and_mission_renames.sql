-- Widen item_type to accommodate new types.
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_item_type_check;
ALTER TABLE items ADD CONSTRAINT items_item_type_check
  CHECK (item_type IN ('HINT','INSURANCE','BOOST','ACCESS','MISSION_TOOL'));

-- Rename the last two missions.
UPDATE missions SET mission_name = 'THE LOST GATE' WHERE code = 'BLUE_FORTRESS';
UPDATE missions SET mission_name = 'THE CONFLUENCE' WHERE code = 'THE_HARBOUR';

-- Add a location_name column (revealed after unlock, alongside coordinates).
ALTER TABLE missions ADD COLUMN IF NOT EXISTS location_name TEXT;
UPDATE missions SET location_name = 'Jardin Nouzhat Hassan' WHERE code = 'GREEN_SECTOR';
UPDATE missions SET location_name = 'Tour Hassan' WHERE code = 'SILENT_TOWER';
UPDATE missions SET location_name = 'Kasbah des Oudayas' WHERE code = 'BLUE_FORTRESS';
UPDATE missions SET location_name = 'Marina Bouregreg' WHERE code = 'THE_HARBOUR';

-- New market items. ON CONFLICT so it's idempotent.
INSERT INTO items (code, name, item_type, cost, icon, effect, payload, applies_to, is_consumable, max_per_team)
VALUES
  ('ACCESS_COORD','Location Scan','ACCESS',80,'map-pin',
   'Reveals the real-world coordinates of a mission location.','{}','MISSION',TRUE,NULL),
  ('MISSION_RESIGN','Mission Resign','MISSION_TOOL',50,'flag-off',
   'Abandon an active mission. You lose the entry cost but free the slot.','{}','MISSION',TRUE,NULL),
  ('MISSION_REROLL','Mission Reroll','MISSION_TOOL',40,'refresh-cw',
   'After completing or failing a mission, unlock it again at the same cost and reward.','{}','MISSION',TRUE,NULL),
  ('TIME_BOOST','Time Boost','BOOST',60,'clock',
   'Adds 10 extra minutes to your active mission timer.','{"extra_min":10}','MISSION',TRUE,NULL),
  ('DOUBLE_REWARD','Double Reward','BOOST',120,'zap',
   'Doubles the CIT$ and energy reward on your next mission completion.','{"multiplier":2}','MISSION',TRUE,1)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, cost = EXCLUDED.cost, effect = EXCLUDED.effect,
  payload = EXCLUDED.payload, is_active = true;
