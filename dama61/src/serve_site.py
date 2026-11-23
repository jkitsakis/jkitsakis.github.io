#!/usr/bin/env python3
"""Serve the exported DAMA61 study site locally (required to fetch narration TXT)."""
import argparse
import functools
import http.server
import webbrowser
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--port', type=int, default=2023)
p.add_argument('--no-browser', action='store_true')
args = p.parse_args()
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
try:
    with http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        url = f'http://127.0.0.1:{args.port}/'
        print('DAMA61 Study Site:', url, flush=True)
        print('Keep this window open while using narration. Ctrl+C to stop.', flush=True)
        if not args.no_browser:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        server.serve_forever()
except OSError as e:
    print(f'Cannot start server on port {args.port}: {e}', flush=True)
    raise SystemExit(1)
except KeyboardInterrupt:
    print('\nStopped.')
