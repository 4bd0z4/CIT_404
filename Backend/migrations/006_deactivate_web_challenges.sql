-- Web challenges require the AWS challenge host which is not deployed.
-- Hide them so teams don't see unsolvable challenges.
UPDATE challenges SET is_active = false WHERE code IN ('CTF-WE-01', 'CTF-WE-02', 'CTF-WE-03');
