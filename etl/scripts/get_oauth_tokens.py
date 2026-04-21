"""各広告プラットフォームの OAuth リフレッシュトークンを取得するヘルパー.

使い方:
    cd etl/
    source .venv/bin/activate

    # Google Ads
    python -m scripts.get_oauth_tokens google --client-id=XXX --client-secret=YYY

    # Yahoo!広告
    python -m scripts.get_oauth_tokens yahoo --client-id=XXX --client-secret=YYY

    # Bing Ads
    python -m scripts.get_oauth_tokens bing --client-id=XXX --client-secret=YYY
"""

from __future__ import annotations

import argparse
import http.server
import json
import sys
import threading
import urllib.parse
import webbrowser

import httpx

# ── 各プラットフォームの OAuth 設定 ──

PLATFORMS = {
    "google": {
        "auth_url": "https://accounts.google.com/o/oauth2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "https://www.googleapis.com/auth/adwords",
    },
    "yahoo": {
        "auth_url": "https://biz-oauth.yahoo.co.jp/oauth/v1/authorize",
        "token_url": "https://biz-oauth.yahoo.co.jp/oauth/v1/token",
        "scope": "",
    },
    "bing": {
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scope": "https://ads.microsoft.com/msads.manage offline_access",
    },
}

REDIRECT_PORT = 9004
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}/callback"


def get_auth_code(platform: str, client_id: str) -> str:
    """ブラウザで認可コードを取得する."""
    config = PLATFORMS[platform]
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "access_type": "offline",
        "prompt": "consent",
    }
    if config["scope"]:
        params["scope"] = config["scope"]

    auth_url = f"{config['auth_url']}?{urllib.parse.urlencode(params)}"

    # コールバックを受け取るローカルサーバー
    auth_code = None
    error = None

    class CallbackHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            nonlocal auth_code, error
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)

            if "code" in qs:
                auth_code = qs["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h2>OK</h2>"
                    b"<p>This window can be closed.</p></body></html>"
                )
            else:
                error = qs.get("error", ["unknown"])[0]
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f"Error: {error}".encode())

        def log_message(self, format, *args):
            pass  # ログ抑制

    server = http.server.HTTPServer(("localhost", REDIRECT_PORT), CallbackHandler)

    print(f"\nブラウザで認証してください...")
    print(f"URL: {auth_url}\n")
    webbrowser.open(auth_url)

    # 1リクエストだけ受け付ける
    server.handle_request()
    server.server_close()

    if error:
        print(f"エラー: {error}", file=sys.stderr)
        sys.exit(1)

    if not auth_code:
        print("認可コードを取得できませんでした", file=sys.stderr)
        sys.exit(1)

    return auth_code


def exchange_code_for_tokens(
    platform: str, client_id: str, client_secret: str, code: str
) -> dict:
    """認可コードをトークンに交換する."""
    config = PLATFORMS[platform]

    data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }

    response = httpx.post(config["token_url"], data=data, timeout=30)

    if response.status_code != 200:
        print(f"トークン取得エラー: {response.status_code}", file=sys.stderr)
        print(response.text, file=sys.stderr)
        sys.exit(1)

    return response.json()


def main():
    parser = argparse.ArgumentParser(description="OAuth リフレッシュトークン取得")
    parser.add_argument(
        "platform", choices=["google", "yahoo", "bing"], help="プラットフォーム"
    )
    parser.add_argument("--client-id", required=True, help="OAuth クライアントID")
    parser.add_argument("--client-secret", required=True, help="OAuth クライアントシークレット")
    args = parser.parse_args()

    print(f"=== {args.platform.upper()} OAuth トークン取得 ===")

    # 1. 認可コード取得
    code = get_auth_code(args.platform, args.client_id)
    print(f"認可コード取得完了")

    # 2. トークン交換
    tokens = exchange_code_for_tokens(
        args.platform, args.client_id, args.client_secret, code
    )

    print(f"\n{'='*50}")
    print(f"リフレッシュトークン:")
    print(f"  {tokens.get('refresh_token', 'N/A')}")
    print(f"\n以下を etl/.env にコピーしてください:")

    prefix_map = {
        "google": "GOOGLE_ADS",
        "yahoo": "YAHOO_ADS",
        "bing": "BING_ADS",
    }
    prefix = prefix_map[args.platform]
    print(f"  {prefix}_CLIENT_ID={args.client_id}")
    print(f"  {prefix}_CLIENT_SECRET={args.client_secret}")
    print(f"  {prefix}_REFRESH_TOKEN={tokens.get('refresh_token', '')}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
