#!/usr/bin/env python3
"""
Proxy server for api.emissions.dev
Adds Authorization header and CORS headers so the browser can call the API.
Run: python3 proxy.py
Listens on http://localhost:3001
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlparse
import json

API_KEY  = 'em_live_4EQw4odQWZdtXyvKJf8rCuUij30bldZuhuLXOL'
API_BASE = 'https://api.emissions.dev'
PORT     = 3001


class ProxyHandler(BaseHTTPRequestHandler):

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        upstream_url = f'{API_BASE}{parsed.path}'
        if parsed.query:
            upstream_url += f'?{parsed.query}'

        print(f'[proxy] → {upstream_url}')

        req = Request(
            upstream_url,
            headers={
                'Authorization': f'Bearer {API_KEY}',
                'Accept': 'application/json',
                'User-Agent': 'TreeRoute/1.0'
            }
        )

        try:
            with urlopen(req) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self._cors_headers()
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            error = json.dumps({'error': str(e)}).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self._cors_headers()
            self.end_headers()
            self.wfile.write(error)

    def log_message(self, fmt, *args):
        print(f'[proxy] {self.address_string()} - {fmt % args}')


if __name__ == '__main__':
    server = HTTPServer(('localhost', PORT), ProxyHandler)
    print(f'Proxy running at http://localhost:{PORT}  (Ctrl+C to stop)')
    server.serve_forever()
