-- MI-01 (git) gets the repo URL, OS-03 (Dayr lina follow) is social media with no link
UPDATE challenges SET resource_type = 'EXTERNAL', resource_url = 'https://github.com/CIT-challeges/project' WHERE code = 'CTF-MI-01';
UPDATE challenges SET resource_type = 'STATIC', resource_url = NULL, description = '3lach bagi madayrch lina follow?' WHERE code = 'CTF-OS-03';
