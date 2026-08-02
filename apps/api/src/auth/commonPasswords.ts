/**
 * Common passwords, rejected at registration (DESIGN.md §9.1).
 *
 * The ten-character minimum already eliminates the overwhelming majority of a standard
 * top-10k list — `password`, `123456`, `qwerty` and friends are all too short to reach
 * this check. What is left are the long-but-obvious ones, which is what this list is: the
 * passwords a user picks *because* they were told to use ten characters.
 *
 * Swap in a full bundled corpus (rockyou-derived, filtered to length ≥ 10) if this ever
 * proves inadequate; the interface is a set lookup either way.
 */
const RAW = `
password123
password1234
password12345
password1
passw0rd123
p@ssword123
p@ssw0rd123
passwordpassword
mypassword1
newpassword1
qwertyuiop
qwertyuiop1
qwertyuiop123
qwerty123456
qwerty12345
1qaz2wsx3edc
1q2w3e4r5t
1q2w3e4r5t6y
zaq12wsxcde3
asdfghjkl1
asdfghjkl123
zxcvbnm123
1234567890
12345678901
123456789012
1234567890a
0123456789
1234512345
1122334455
1111111111
0000000000
1212121212
abcdefghij
abcd1234567
abc123456789
letmein123
letmein1234
iloveyou123
iloveyou1234
iloveyou222
trustno1234
welcome123
welcome1234
welcome12345
monkey12345
dragon12345
football123
baseball123
basketball1
superman123
batman12345
princess123
princess1234
sunshine123
sunshine1234
michael1234
jennifer123
jessica1234
charlie1234
computer123
internet123
whatever123
anything123
something123
starwars123
pokemon1234
minecraft123
liverpool123
manchester1
chelsea1234
arsenal1234
samsung1234
google12345
facebook123
instagram123
myspace1234
hotmail1234
yahoo123456
administrator
administrator1
adminadmin1
admin123456
root123456
changeme123
changeme1234
default123
temporary1
temppassword
secret12345
secretpassword
loveme1234
lovely1234
babygirl123
babyboy1234
angel123456
freedom123
whatever1234
password!23
Password123
Password1234
Password123!
Passw0rd123
Welcome123!
Qwerty123456
Iloveyou123
Sunshine123
Trustno1234
jellybean123
jellybeans1
`;

const COMMON = new Set(
  RAW.split('\n')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isCommonPassword(password: string): boolean {
  return COMMON.has(password.toLowerCase());
}
