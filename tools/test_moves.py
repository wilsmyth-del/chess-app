import requests

BASE = 'http://127.0.0.1:5000'

def reset():
    r = requests.post(BASE + '/api/reset')
    print('RESET', r.status_code, r.json())

def move(uci, engine=False):
    r = requests.post(BASE + '/api/move', json={'uci': uci, 'engine_reply': engine})
    try:
        print('MOVE', uci, r.status_code, r.json())
    except Exception as e:
        print('MOVE', uci, r.status_code, r.text)

if __name__ == '__main__':
    reset()
    # Play Scholar's mate as a quick test
    seq = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7']
    for u in seq:
        move(u)

    print('\nReset and test an illegal move:')
    reset()
    move('e2e5')  # illegal

    print('\nTest promotion sequence:')
    reset()
    # set up a simple promotion: move white pawn from e2 to e4, then to e5,e6,e7,e8
    moves = ['e2e4','a7a6','e4e5','a6a5','e5e6','a5a4','e6e7','a4a3','e7e8q']
    for u in moves:
        move(u)
