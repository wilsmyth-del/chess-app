import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server import create_app
app = create_app()
client = app.test_client()

print('Posting resign payload...')
payload = { 'resigned_side': 'white', 'user_side': 'white', 'user_name': 'Tester', 'opponent_name': 'Engine', 'engine': True }
r = client.post('/api/resign', json=payload)
print('/api/resign status=', r.status_code)
try:
    j = r.get_json()
    print('/api/resign json keys=', list(j.keys()))
    print('resign flag:', j.get('resign'))
    print('winner:', j.get('winner'))
    print('pgn_file:', j.get('pgn_file'))
except Exception as e:
    print('json parse failed', e)
