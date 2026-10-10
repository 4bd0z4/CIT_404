-- Swap titles, descriptions, and resource URLs between MI-01 and OS-03
-- so "git" has the git content and "Dayr lina follow" has the Instagram content.

-- Temp store
DO $$
DECLARE
  mi01_title TEXT; mi01_desc TEXT; mi01_rtype TEXT; mi01_rurl TEXT; mi01_hash TEXT;
  os03_title TEXT; os03_desc TEXT; os03_rtype TEXT; os03_rurl TEXT; os03_hash TEXT;
BEGIN
  SELECT title, description, resource_type, resource_url, flag_hash INTO mi01_title, mi01_desc, mi01_rtype, mi01_rurl, mi01_hash FROM challenges WHERE code = 'CTF-MI-01';
  SELECT title, description, resource_type, resource_url, flag_hash INTO os03_title, os03_desc, os03_rtype, os03_rurl, os03_hash FROM challenges WHERE code = 'CTF-OS-03';

  UPDATE challenges SET title = os03_title, description = os03_desc, resource_type = os03_rtype, resource_url = os03_rurl, flag_hash = os03_hash WHERE code = 'CTF-MI-01';
  UPDATE challenges SET title = mi01_title, description = mi01_desc, resource_type = mi01_rtype, resource_url = mi01_rurl, flag_hash = mi01_hash WHERE code = 'CTF-OS-03';
END $$;
