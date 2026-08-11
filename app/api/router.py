from fastapi import APIRouter
from app.api import auth, accounts, scenarios, channels, proxies, inbox, logs, settings

router = APIRouter()

router.include_router(auth.router)
router.include_router(accounts.router)
router.include_router(scenarios.router)
router.include_router(channels.router)
router.include_router(proxies.router)
router.include_router(inbox.router)
router.include_router(logs.router)
router.include_router(settings.router)
