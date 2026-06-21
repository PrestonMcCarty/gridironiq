/**
 * Yahoo Fantasy Sports OAuth proxy
 * =================================
 * POST /api/yahoo/proxy
 *   Body: { path: string, accessToken: string }
 *   Proxies a Yahoo Fantasy Sports API v2 request server-side.
 *   Required to avoid CORS — Yahoo does not allow direct browser calls.
 *
 * POST /api/yahoo/auth
 *   Body: { code: string }
 *   Exchanges an authorization code for an access + refresh token pair.
 *
 * POST /api/yahoo/refresh
 *   Body: { refreshToken: string }
 *   Exchanges a refresh token for a new access token.
 *
 * Environment variables required in .env.local:
 *   YAHOO_CLIENT_ID=your_app_client_id
 *   YAHOO_CLIENT_SECRET=your_app_client_secret
 *   YAHOO_REDIRECT_URI=http://localhost:3000/api/yahoo/callback
 *
 * To obtain credentials:
 *   1. Go to https://developer.yahoo.com/apps/
 *   2. Create a new app with "Fantasy Sports" API access
 *   3. Set the redirect URI to your app's /api/yahoo/callback
 *   4. Copy the Client ID and Client Secret to .env.local
 */

import { NextResponse } from "next/server";

const YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
const YAHOO_API_BASE  = "https://fantasysports.yahooapis.com/fantasy/v2";

function getBasicAuth() {
  const id     = process.env.YAHOO_CLIENT_ID;
  const secret = process.env.YAHOO_CLIENT_SECRET;
  if (!id || !secret) return null;
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { action, path, accessToken, code, refreshToken } = body;

  // ── Proxy: forward a Yahoo API request server-side ─────────────────────
  if (action === "proxy" || path) {
    if (!accessToken) {
      return NextResponse.json({ error: "accessToken required" }, { status: 401 });
    }
    const url = `${YAHOO_API_BASE}${path}?format=json`;
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.status === 401) {
        return NextResponse.json({ error: "Yahoo token expired" }, { status: 401 });
      }
      const data = await r.json();
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  // ── Auth: exchange authorization code for tokens ───────────────────────
  if (action === "auth" || code) {
    const auth = getBasicAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Yahoo OAuth not configured. Add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET to .env.local" },
        { status: 503 }
      );
    }
    try {
      const r = await fetch(YAHOO_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type:   "authorization_code",
          code,
          redirect_uri: process.env.YAHOO_REDIRECT_URI || "http://localhost:3000/api/yahoo/callback",
        }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error_description || data.error);
      return NextResponse.json({
        accessToken:  data.access_token,
        refreshToken: data.refresh_token,
        expiresIn:    data.expires_in,
        xoauthYahooGuid: data.xoauth_yahoo_guid,
      });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  // ── Refresh: exchange refresh token for new access token ───────────────
  if (action === "refresh" || refreshToken) {
    const auth = getBasicAuth();
    if (!auth) {
      return NextResponse.json({ error: "Yahoo OAuth not configured" }, { status: 503 });
    }
    try {
      const r = await fetch(YAHOO_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          refresh_token: refreshToken,
          redirect_uri:  process.env.YAHOO_REDIRECT_URI || "http://localhost:3000/api/yahoo/callback",
        }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error_description || data.error);
      return NextResponse.json({
        accessToken:  data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresIn:    data.expires_in,
      });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
