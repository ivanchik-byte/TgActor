from fastapi import APIRouter, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel

from app.core.database import async_session
from app.models.models import Proxy, SystemConfig, Account
from app.models.schemas import ProxyCreate, ProxyResponse

router = APIRouter()

class ProxyModeRequest(BaseModel):
    use_proxy: bool

@router.get("/api/proxies", response_model=List[ProxyResponse])
async def get_proxies():
    async with async_session() as session:
        result = await session.execute(select(Proxy).order_by(Proxy.id.asc()))
        return result.scalars().all()

@router.post("/api/proxies")
async def create_proxy(pr: ProxyCreate):
    async with async_session() as session:
        data = pr.model_dump()
        data.pop("ip", None)
        proxy = Proxy(**data)
        session.add(proxy)
        await session.commit()
        return {"status": "ok", "id": proxy.id}

@router.post("/api/proxies/check")
async def check_raw_proxy(pr: ProxyCreate):
    from app.services.proxy_service import check_proxy_connectivity
    data = pr.model_dump()
    data.pop("ip", None)
    dummy_proxy = Proxy(**data)
    result = await check_proxy_connectivity(dummy_proxy, timeout=6.0)
    return result

@router.post("/api/proxies/{proxy_id}/check")
async def check_saved_proxy(proxy_id: int):
    from app.services.proxy_service import check_proxy_connectivity
    async with async_session() as session:
        pr = await session.get(Proxy, proxy_id)
        if not pr:
            raise HTTPException(404, "Proxy not found")
        result = await check_proxy_connectivity(pr, timeout=6.0)
        return result

@router.post("/api/proxies/check-all")
async def check_all_proxies():
    import asyncio
    from app.services.proxy_service import check_proxy_connectivity
    async with async_session() as session:
        res = await session.execute(select(Proxy).order_by(Proxy.id.asc()))
        proxies = res.scalars().all()
        if not proxies:
            return {"results": []}

        tasks = [check_proxy_connectivity(p, timeout=6.0) for p in proxies]
        check_results = await asyncio.gather(*tasks, return_exceptions=True)

        output = []
        for p, r in zip(proxies, check_results):
            if isinstance(r, Exception):
                output.append({"id": p.id, "status": "error", "error": str(r)})
            else:
                output.append({"id": p.id, **r})
        return {"results": output}

@router.delete("/api/proxies/{proxy_id}")
async def delete_proxy(proxy_id: int):
    async with async_session() as session:
        pr = await session.get(Proxy, proxy_id)
        if not pr:
            raise HTTPException(404, "Proxy not found")
        await session.delete(pr)
        await session.commit()
        return {"status": "ok"}

@router.get("/api/config/proxy-mode")
async def get_proxy_mode():
    async with async_session() as session:
        config = await session.get(SystemConfig, "USE_PROXY")
        use_proxy = True if not config else (config.value.lower() == "true")
        return {"use_proxy": use_proxy}

@router.post("/api/config/proxy-mode")
async def set_proxy_mode(req: ProxyModeRequest):
    async with async_session() as session:
        config = await session.get(SystemConfig, "USE_PROXY")
        if not config:
            config = SystemConfig(key="USE_PROXY", value=str(req.use_proxy).lower())
            session.add(config)
        else:
            config.value = str(req.use_proxy).lower()
        await session.commit()
        return {"status": "ok", "use_proxy": req.use_proxy}
