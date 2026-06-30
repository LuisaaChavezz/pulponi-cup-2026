from http.server import BaseHTTPRequestHandler
import base64
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from generate_user_summary import generate_user_summary_pdf_bytes  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _cors_headers(self):
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        }

    def do_OPTIONS(self):
        self.send_response(200)
        for key, value in self._cors_headers().items():
            self.send_header(key, value)
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            body = json.loads(raw.decode("utf-8"))

            pdf_b64 = generate_user_summary_pdf_bytes(
                user_name=(body.get("user_name") or "Jugador"),
                total_points=int(body.get("total_points") or 0),
                rows=(body.get("rows") or []),
                summary=(body.get("summary") or {}),
            )
            pdf_bytes = base64.b64decode(pdf_b64)

            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            for key, value in self._cors_headers().items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            payload = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            for key, value in self._cors_headers().items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(payload)
