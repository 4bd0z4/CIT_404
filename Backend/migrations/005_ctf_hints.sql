-- CTF challenge hints from the organiser's hint sheet.
-- Challenges without a hint keep NULL (no button shown).

-- Crypto
UPDATE challenges SET hint1 = 'Base64.' WHERE code = 'CTF-CR-01';
UPDATE challenges SET hint1 = 'Aktar kalma sma3tiha had 3 weeks "bizu" hiya l key.' WHERE code = 'CTF-CR-02';
UPDATE challenges SET hint1 = 'Each chunk is a character.' WHERE code = 'CTF-CR-03';

-- OSINT
UPDATE challenges SET hint1 = 'The URL has the tool that you should use.' WHERE code = 'CTF-OS-01';
UPDATE challenges SET hint1 = '9lab 3la chi blassa fl INPT fl maps.' WHERE code = 'CTF-OS-02';
UPDATE challenges SET hint1 = 'Maybe you should check the past code, not the code that you see now.' WHERE code = 'CTF-OS-03';

-- Misc
UPDATE challenges SET hint1 = 'Check CIT Instagram account.' WHERE code = 'CTF-MI-01';
UPDATE challenges SET hint1 = 'There is an eval in the code that will be so useful.',
                     hint2 = 'Use int() function, and use strings.' WHERE code = 'CTF-MI-02';
-- CTF-MI-03: no hints
UPDATE challenges SET hint1 = 'Some lines have useful information.',
                     hint2 = 'The flag is scattered in lines in the logs.' WHERE code = 'CTF-MI-04';

-- Steganography
UPDATE challenges SET hint1 = 'Look for the metadata of the image.' WHERE code = 'CTF-ST-01';
UPDATE challenges SET hint1 = 'Spectrogram.' WHERE code = 'CTF-ST-02';

-- Web
UPDATE challenges SET hint1 = 'Search about injections vulnerability.',
                     hint2 = 'Use SQL injection.' WHERE code = 'CTF-WE-01';
UPDATE challenges SET hint1 = 'Look carefully in the URL — something changes every time. You can exploit it.' WHERE code = 'CTF-WE-02';
UPDATE challenges SET hint1 = 'There is not only the HTML code. Search for JavaScript code.',
                     hint2 = 'There is a strange variable in the JavaScript file.' WHERE code = 'CTF-WE-03';
