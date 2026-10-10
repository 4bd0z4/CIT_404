-- CP challenge hints from the organiser.

UPDATE challenges SET
  hint1 = 'In Python, you can use a for loop to examine each element of the list. Use an if condition to determine whether a value should be kept. Pay attention to the difference between negative values and zero.',
  hint2 = 'Create an empty list to store the values that pass your condition. Python''s append() method lets you add each valid value as you iterate through the input. Since you process the values from left to right, their original relative order will be preserved. Think about how to print the size of your resulting list before printing its elements.'
WHERE code = 'CP-A';

UPDATE challenges SET
  hint1 = 'Think about how you can determine the value needed to pair with each token. If the current token is A_i, what value must another token have so that their sum equals K? Remember that you cannot use the same index twice.',
  hint2 = 'Checking every possible pair can be too slow when N reaches 10^5. In Python, consider using a dictionary to remember previously visited values and their indices. As you scan the list from left to right, look for the required complementary value before storing the current one. This approach can help you respect the tie-breaking rule and achieve an average time complexity of O(N).'
WHERE code = 'CP-B';

UPDATE challenges SET
  hint1 = 'You need to verify two independent conditions before deciding whether the log is genuine. In Python, think about how to count occurrences of a specific string and how to compare neighboring elements in a list. Remember that "WA", "TLE", and "RTE" all represent errors.',
  hint2 = 'You can use a counter to track how many "AC" tokens appear, then compare that count with T. Separately, iterate through the sequence using indices and check each "AC" token''s previous and next neighbors, when they exist. If either condition is violated, the result is "FRAUDULENT"; otherwise, it is "GENUINE".'
WHERE code = 'CP-C';

UPDATE challenges SET
  hint1 = 'A valid contiguous sequence can contain at most K negative numbers. In Python, think about how to examine a range of consecutive elements while keeping track of how many negative values it contains. Remember that zero is not corrupted!',
  hint2 = 'Consider using two pointers to represent the left and right boundaries of a window. Expand the right boundary one element at a time and keep track of the number of negative values. Whenever this count exceeds K, move the left boundary forward until the window becomes valid again. At each step, update the maximum window length. This technique can achieve O(N) time complexity.'
WHERE code = 'CP-D';

UPDATE challenges SET
  hint1 = 'Each log message has been reversed, so the keyword you''re looking for may not appear in its usual form. In Python, strings can be reversed using slicing. Think about which version of each string you should inspect to determine whether the original message contained citlogin.',
  hint2 = 'Reverse each corrupted string first, then use Python''s in operator to check whether citlogin occurs as a substring of the reconstructed message. Keep a counter for every message that matches, and print the final count after processing all N messages.'
WHERE code = 'CP-E';

UPDATE challenges SET
  hint1 = 'Each partition must contain consecutive cells, and your goal is to minimize the largest partition sum. Notice that the answer cannot be smaller than the largest individual cell, and it never needs to exceed the sum of all cells. These observations help you establish a search range.',
  hint2 = 'Instead of trying every possible partitioning, use binary search on the maximum allowed partition load. For a candidate limit, scan the cells from left to right and greedily start a new partition whenever adding the next cell would exceed that limit. Count the partitions needed: if the count is at most K, the limit may be feasible; otherwise, it is too small.'
WHERE code = 'CP-F';

UPDATE challenges SET
  hint1 = 'In Python, a string can be reversed using slicing. Think about how to compare each fragment with its reverse and how to keep track of how many times each string appears. Pay special attention to palindromes: reversing them produces the same string, so their pairing requires careful counting.',
  hint2 = 'Consider using a dictionary or collections.Counter to track fragment frequencies. For each string and its reverse, determine how many distinct, unordered pairs they form without counting the same pair twice. Then check whether any palindrome has an odd frequency. Finally, apply the status rules in the specified priority order, using the total pair count independently of the chosen status code.'
WHERE code = 'CP-G';
