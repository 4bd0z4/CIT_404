-- Hide Solution Fragment from the market. Idempotent.
UPDATE items SET is_active = false WHERE code = 'SOLUTION_FRAG';
