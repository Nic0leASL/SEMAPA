import os

def refactor_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if 'def safe_query' not in content:
        safe_query_def = '''
def safe_query(session, query, default=None):
    try:
        return list(session.execute(query))
    except Exception as e:
        import logging
        logger = logging.getLogger("CassandraSafeQuery")
        logger.warning(f"Query failed: {query} - Error: {e}")
        return default if default is not None else []
'''
        content = content.replace('def get_session():\n    return CassandraConnection.get_session()\n', 'def get_session():\n    return CassandraConnection.get_session()\n' + safe_query_def)

    content = content.replace('list(session.execute(', 'safe_query(session, ')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

refactor_file(r'd:\Universidad\Distribuidos\SEMAPA\Backend\backend\app\routes\dashboard.py')
refactor_file(r'd:\Universidad\Distribuidos\SEMAPA\Backend\backend\app\routes\queries.py')
print('Patched successfully')
