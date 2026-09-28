#!/usr/bin/env python3
"""Dev server for public/ with Cache-Control: no-store (Chrome heuristically
caches python http.server responses, which silently serves stale js_parts).
Usage: python tools/devserver.py [port] [root]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8613
ROOT = sys.argv[2] if len(sys.argv) > 2 else "public"


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    import functools
    handler = functools.partial(NoCache, directory=ROOT)
    ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
