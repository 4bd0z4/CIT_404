-- Point challenges at their downloadable files hosted on Vercel.
UPDATE challenges SET resource_type = 'DOWNLOAD', resource_url = '/challs/cr01-cipher.txt' WHERE code = 'CTF-CR-01';
UPDATE challenges SET resource_type = 'DOWNLOAD', resource_url = '/challs/cr02-cipher.txt' WHERE code = 'CTF-CR-02';
UPDATE challenges SET resource_type = 'DOWNLOAD', resource_url = '/challs/cr03-binary.txt' WHERE code = 'CTF-CR-03';
UPDATE challenges SET resource_type = 'DOWNLOAD', resource_url = '/challs/mi04-server.log' WHERE code = 'CTF-MI-04';
UPDATE challenges SET resource_type = 'DOWNLOAD', resource_url = '/challs/st01-bizu.jpg' WHERE code = 'CTF-ST-01';
UPDATE challenges SET resource_type = 'DOWNLOAD', resource_url = '/challs/st02-signal.wav' WHERE code = 'CTF-ST-02';

-- Eval jail: service endpoint
UPDATE challenges SET resource_type = 'SERVICE', resource_url = 'nc altaria.proxy.rlwy.net 36043' WHERE code = 'CTF-MI-02';

-- OSINT: external links
UPDATE challenges SET resource_type = 'EXTERNAL', resource_url = 'https://cit-challenges.github.io/wayback-machine-challenge/' WHERE code = 'CTF-OS-01';
