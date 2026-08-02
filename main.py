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
        # Don't intercept API or WS routes
        if full_path.startswith("api/") or full_path.startswith("ws/"):
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
