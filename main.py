# Monkey patch Hydrogram to ignore unknown MTProto constructors sent by Telegram server
import logging
from io import BytesIO
from typing import Any
from hydrogram.raw.core.tl_object import TLObject, objects

_orig_tl_read = TLObject.read

@classmethod
def patched_tl_read(cls, b: BytesIO, *args: Any) -> Any:
    current_pos = b.tell()
    try:
        constructor_bytes = b.read(4)
        if len(constructor_bytes) < 4:
            b.seek(current_pos)
            return _orig_tl_read(b, *args)
        constructor_id = int.from_bytes(constructor_bytes, "little")
        if constructor_id not in objects:
            logging.getLogger("hydrogram").warning(f"Telegram sent unknown MTProto constructor: {hex(constructor_id)}. Safely ignoring this update packet.")
            # Return a dummy TLObject placeholder
            class DummyTLObject(TLObject):
                ID = constructor_id
                def write(self, *args): return b""
                @classmethod
                def read(cls, b, *args): return DummyTLObject()
            return DummyTLObject()
        else:
            b.seek(current_pos)
            return _orig_tl_read(b, *args)
    except Exception:
        b.seek(current_pos)
        return _orig_tl_read(b, *args)

TLObject.read = patched_tl_read

import os
import hmac
import hashlib
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from inbox_ws import app as main_app
from api_routes import router as api_router

# Auth helper
def get_auth_token():
    admin_pwd = os.environ.get("ADMIN_PASSWORD", "1723")
    enc_key = os.environ.get("ENCRYPTION_KEY", "fallback")
    return hmac.new(enc_key.encode(), admin_pwd.encode(), hashlib.sha256).hexdigest()

@main_app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Skip check for static SPA, auth endpoint, and health check/proxies (if needed)
    if path.startswith("/api/auth/login") or not path.startswith("/api"):
        return await call_next(request)
        
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        
    token = auth_header.split(" ")[1]
    expected_token = get_auth_token()
    if not hmac.compare_digest(token.encode('utf-8'), expected_token.encode('utf-8')):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        
    return await call_next(request)

# Mount the router
main_app.include_router(api_router)

# Enable CORS for React Frontend (allow all for ease of setup)
main_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount media directory
media_dir = os.path.join(os.path.dirname(__file__), "media")
os.makedirs(media_dir, exist_ok=True)
main_app.mount("/media", StaticFiles(directory=media_dir), name="media")

# Serve SPA from frontend/dist
frontend_path = os.path.join(os.path.dirname(__file__), "frontend", "dist")

if os.path.exists(frontend_path):
    # Mount static assets first (Vite puts them in /assets)
    assets_path = os.path.join(frontend_path, "assets")
    if os.path.exists(assets_path):
        main_app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
    
    # Optional public files at root (vite.svg, etc)
    # We can handle them dynamically in the catch-all
    
    # Catch-all route to serve index.html for client-side routing
    @main_app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Don't intercept API, WS, or media routes
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path.startswith("media/"):
            # returning None lets FastAPI handle the 404
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")
            
        file_path = os.path.join(frontend_path, full_path)
        # Serve exact file if it exists (like /favicon.svg)
        if full_path and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # Fallback to React index.html
        return FileResponse(os.path.join(frontend_path, "index.html"))
else:
    import logging
    logging.getLogger(__name__).warning("frontend/dist not found. Starting backend-only mode.")

# Alias the app
app = main_app
