import os
import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # The issue: list(session.execute(query)) was replaced with safe_query(session, query))
    # We need to find safe_query(session, ...) and remove the extra )
    
    # Simple regex: find safe_query(session, "something")) or similar
    # Actually, a simpler way is just replacing '))' with ')' only on the lines with safe_query.
    lines = content.splitlines()
    new_lines = []
    for line in lines:
        if 'safe_query' in line and not line.strip().startswith('def safe_query'):
            # replace the last '))' with ')'
            if line.endswith('))'):
                line = line[:-2] + ')'
            else:
                # it might be inline, let's just replace '))' with ')'
                line = line.replace('))', ')')
        new_lines.append(line)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))

fix_file(r'd:\Universidad\Distribuidos\SEMAPA\Backend\backend\app\routes\dashboard.py')
fix_file(r'd:\Universidad\Distribuidos\SEMAPA\Backend\backend\app\routes\queries.py')
print('Fixed successfully')
