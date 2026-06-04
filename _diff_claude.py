with open(r'E:\project\储能\ess-platform\index_claude AI.html','r',encoding='utf-8') as f:
    lines = f.readlines()
for i,line in enumerate(lines,1):
    s = line.rstrip()
    if 'footer' in s.lower() or '版权所有' in s or 'protectFooter' in s or '2147483647' in s or 'FFD700' in s:
        print(f'{i}: {s[:160]}')