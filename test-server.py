#!/usr/bin/env python3

from http.server import BaseHTTPRequestHandler, HTTPServer
from subprocess import Popen, PIPE
import json
import os
import time

hostName = "localhost"
serverPort = 8234

class MyServer(BaseHTTPRequestHandler):
  def do_GET(self):
    if self.path == '/':
      p = Popen(['./build.sh'], stdout=PIPE, stderr=PIPE)
      out, err = p.communicate()
      if p.returncode != 0 or out.strip():
        self.send_response(500)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(bytes('BUILD ERROR\n\n', 'utf-8'))
        self.wfile.write(bytes('===== STDOUT =====\n', 'utf-8'))
        self.wfile.write(out)
        self.wfile.write(bytes('\n', 'utf-8'))
        self.wfile.write(bytes('===== STDERR =====\n', 'utf-8'))
        self.wfile.write(err)
        self.wfile.write(bytes('\n', 'utf-8'))
        return
      self.send_response(200)
      self.send_header('Content-Type', 'text/html')
      self.send_header('X-Build-Output', json.dumps({
        'out': out.decode('utf-8'),
        'err': err.decode('utf-8'),
      }))
      self.end_headers()
      with open('www/index.html', 'r') as f:
        self.wfile.write(bytes(f.read(), 'utf-8'))
      return
    path = os.path.join('www', self.path
      .replace('/', '')
      .replace('%', '')
      .replace('..', ''))
    if not os.path.exists(path):
      self.send_response(404)
      self.send_header('Content-Type', 'text/plain')
      self.end_headers()
      self.wfile.write(bytes('Path not found: {}'.format(self.path), 'utf-8'))
      return
    self.send_response(200)
    if path.endswith('.css'):
      self.send_header('Content-Type', 'text/css')
    elif path.endswith('.js'):
      self.send_header('Content-Type', 'text/javascript')
    elif path.endswith('.svg'):
      self.send_header('Content-Type', 'image/svg+xml')
    elif path.endswith('.png'):
      self.send_header('Content-Type', 'image/png')
    elif path.endswith('.gif'):
      self.send_header('Content-Type', 'image/gif')
    elif path.endswith('.jpg'):
      self.send_header('Content-Type', 'image/jpeg')
    elif path.endswith('.json'):
      self.send_header('Content-Type', 'application/json')
    elif path.endswith('.txt'):
      self.send_header('Content-Type', 'text/plain')
    self.end_headers()
    with open(path, 'rb') as f:
      self.wfile.write(f.read())

if __name__ == "__main__":        
  webServer = HTTPServer((hostName, serverPort), MyServer)
  print("Server started http://%s:%s" % (hostName, serverPort))

  try:
    webServer.serve_forever()
  except KeyboardInterrupt:
    pass

  webServer.server_close()
  print("Server stopped.")
