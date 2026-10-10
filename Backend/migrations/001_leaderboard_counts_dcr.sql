-- Standings now count DCR solves and DCR first bloods, not only CP/CTF
-- submissions. Idempotent: safe to run on every boot. Column names, order and
-- types are unchanged (bigint), which CREATE OR REPLACE VIEW requires.
CREATE OR REPLACE VIEW v_leaderboard AS
SELECT id, team_name, cit_balance, core_energy,
       solved_cp + solved_ctf + solved_data
         + (SELECT COUNT(*) FROM dcr_solves d WHERE d.team_id = v_team_stats.id) AS total_solved,
       first_bloods
         + (SELECT COUNT(*) FROM dcr_solves d WHERE d.team_id = v_team_stats.id AND d.first_blood) AS first_bloods,
       missions_completed, endgame_solved, endgame_total, total_earned,
       RANK() OVER (ORDER BY core_energy DESC, total_earned DESC) AS rank
FROM v_team_stats;
