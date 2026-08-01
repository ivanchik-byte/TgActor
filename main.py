from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from inbox_ws import app as main_app
from api_routes import router as api_router

# Mount the router
main_app.include_router(api_router)

# Enable CORS for React Frontend
main_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev only, should be specific in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Alias the app so standard runners like `uvicorn main:app` work
app = main_app
