import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server import create_app
app = create_app()
client = app.test_client()

r = client.get('/')
print('GET / status_code=', r.status_code)
print('GET / content-type=', r.headers.get('Content-Type'))

r2 = client.get('/api/state')
print('/api/state status_code=', r2.status_code)
print('/api/state text=', r2.get_data(as_text=True)[:500])
try:
    print('/api/state json=', r2.get_json())
except Exception as e:
    print('json parse failed', e)
