import os
import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.telegram.patch import apply_hydrogram_patch
apply_hydrogram_patch()

from app.core.config import ADMIN_PASSWORD, SECRET_KEY
from app.core.database import engine, Base
from app.api.router import router as api_router
from app.workers.inbox_ws import router as ws_router, lifespan

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TgActor API", version="2.1.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/auth/login"):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        token = auth_header.split(" ")[1]
        import hmac, hashlib, app.core.config as cfg
        expected_token = hmac.new(cfg.SECRET_KEY.encode(), cfg.ADMIN_PASSWORD.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(token, expected_token):
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})
    response = await call_next(request)
    return response

app.include_router(api_router)
app.include_router(ws_router)

os.makedirs("media", exist_ok=True)
app.mount("/media", StaticFiles(directory="media"), name="media")

frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


