-- Web 1 & 2 are now on PythonAnywhere. Re-activate them. Keep WE-03 off.
UPDATE challenges SET is_active = true,
  resource_type = 'SERVICE', resource_url = 'https://citchallenge1.pythonanywhere.com/'
WHERE code = 'CTF-WE-01';

UPDATE challenges SET is_active = true,
  resource_type = 'SERVICE', resource_url = 'https://citchallenge.pythonanywhere.com/'
WHERE code = 'CTF-WE-02';

UPDATE challenges SET resource_type = 'EXTERNAL',
  resource_url = 'https://github.com/CIT-challeges/project'
WHERE code = 'CTF-OS-03';

-- OS-02 title/description changed
UPDATE challenges SET title = 'CIT', description = 'fin kaytjam3o drary diyal CIT.'
WHERE code = 'CTF-OS-02';

-- WE-01 description
UPDATE challenges SET description = 'yak nta hackor' WHERE code = 'CTF-WE-01';

-- WE-02 description
UPDATE challenges SET description = 'You have more choices than you think.' WHERE code = 'CTF-WE-02';
