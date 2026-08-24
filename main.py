import os
import logging
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.telegram.patch import apply_hydrogram_patch
apply_hydrogram_patch()

from app.core.config import ADMIN_PASSWORD, SECRET_KEY
from app.core.database import engine, Base
from app.api.router import router as api_router
from app.workers.inbox_ws import router as ws_router, lifespan
from app.core.logging_config import setup_terminal_logging
from app.core.security import verify_auth_token
setup_terminal_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="TgActor API", version="3.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

PUBLIC_PATHS = ("/api/auth/login",)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    if request.url.path.startswith("/media/"):
        # Inbox media must not be publicly downloadable.
        # Accept header or query token (img tags cannot send headers)
        auth_header = request.headers.get("Authorization", "")
        token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
        if not token:
            token = request.query_params.get("token", "")
        if not verify_auth_token(token):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    if request.url.path.startswith("/api/"):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
        token = auth_header.split(" ")[1]
        if not verify_auth_token(token):
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
        # Confine resolved paths to the dist directory (no traversal)
        base = os.path.realpath(frontend_dist)
        candidate = os.path.realpath(os.path.join(base, full_path))
        if candidate != base and not candidate.startswith(base + os.sep):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(base, "index.html"))


