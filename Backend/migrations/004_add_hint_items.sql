-- Re-add hint items to the market. Idempotent.
INSERT INTO items (code, name, item_type, cost, icon, effect, payload, applies_to, is_consumable, max_per_team)
VALUES ('HINT_L1','Hint Level 1','HINT',30,'lightbulb','Reveals a small hint for the challenge.','{}','ANY',TRUE,NULL)
ON CONFLICT (code) DO UPDATE SET is_active = true, cost = 30;

INSERT INTO items (code, name, item_type, cost, icon, effect, payload, applies_to, is_consumable, max_per_team)
VALUES ('HINT_L2','Hint Level 2','HINT',75,'lightbulb','Reveals a more detailed hint for the challenge.','{}','ANY',TRUE,NULL)
ON CONFLICT (code) DO UPDATE SET is_active = true, cost = 75;
