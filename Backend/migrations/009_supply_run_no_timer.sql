-- Supply Run has no timer: teams go at their own pace.
UPDATE mission_tiers SET time_limit_min = NULL
  WHERE mission_id = (SELECT id FROM missions WHERE code = 'SUPPLY_RUN');
