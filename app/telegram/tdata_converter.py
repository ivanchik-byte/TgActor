import os
import asyncio
import zipfile
import tempfile
import logging
from typing import Tuple, Dict, Any, Optional
from opentele2.td import TDesktop
from opentele2.api import CreateNewSession
from app.core.security import encrypt_session

logger = logging.getLogger(__name__)

MAX_ZIP_ENTRIES = 2000
MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024


def _safe_extract(zip_path: str, dest: str) -> None:
    base = os.path.realpath(dest)
    total = 0
    with zipfile.ZipFile(zip_path, 'r') as archive:
        members = archive.infolist()
        if len(members) > MAX_ZIP_ENTRIES:
            raise zipfile.BadZipFile("too many entries")
        for member in members:
            total += member.file_size
            if total > MAX_ZIP_TOTAL_BYTES:
                raise zipfile.BadZipFile("archive too large")
            name = member.filename
            if not name or name.startswith("/") or name.startswith("\\"):
                raise zipfile.BadZipFile("bad entry path")
            target = os.path.realpath(os.path.join(base, name))
            if target != base and not target.startswith(base + os.sep):
                raise zipfile.BadZipFile("entry outside destination")
            if member.is_dir():
                os.makedirs(target, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(target) or base, exist_ok=True)
                with archive.open(member) as source, open(target, "wb") as out:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)

async def convert_tdata_zip_to_encrypted_session(zip_path: str, password: str = None) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                await asyncio.to_thread(_safe_extract, zip_path, temp_dir)
            except zipfile.BadZipFile:
                logger.error("Failed to extract tdata: Bad zip file.")
                return False, "failed_invalid_tdata", None
            
            tdata_path = None
            for root, dirs, files in os.walk(temp_dir):
                if 'tdata' in [d.lower() for d in dirs]:
                    actual_dir = next(d for d in dirs if d.lower() == 'tdata')
                    tdata_path = os.path.join(root, actual_dir)
                    break
            
            if not tdata_path:
                tdata_path = temp_dir
                
            try:
                # TDesktop parses tdata synchronously; offload to a thread so
                # the event loop keeps serving requests during the upload
                td = await asyncio.to_thread(TDesktop, tdata_path)
                
                if not td.isLoaded() or not td.accounts:
                    logger.error("opentele failed to load tdata (no valid auth keys found or no accounts).")
                    return False, "failed_invalid_tdata", None

                logger.info("Authorizing a new session via opentele to avoid AUTH_KEY_DUPLICATED...")
                client = await td.ToTelethon(flag=CreateNewSession, password=password)
                
                me = await client.get_me()
                if not me:
                    logger.error("Failed to get_me from the new Telethon client.")
                    return False, "failed_invalid_tdata", None
                    
                user_id = me.id
                phone = f"+{me.phone}" if me.phone else f"+{user_id}"
                first_name = me.first_name
                last_name = me.last_name
                username = me.username

                dc_id = client.session.dc_id
                auth_key_bytes = client.session.auth_key.key
                api_id = client.api_id
                
                await client.disconnect()
                
                import struct
                import base64
                packed = struct.pack(
                    ">BI?256sQ?",
                    dc_id,
                    api_id,
                    False,
                    auth_key_bytes,
                    user_id,
                    False
                )
                string_session = base64.urlsafe_b64encode(packed).decode().rstrip("=")
                
                encrypted_session = encrypt_session(string_session)
                user_info = {
                    "phone": phone,
                    "first_name": first_name,
                    "last_name": last_name,
                    "username": username
                }
                return True, encrypted_session, user_info
                
            except BaseException as e:
                logger.error(f"Error while parsing tdata with opentele: {e}")
                return False, f"failed_invalid_tdata: {e}", None
                
    except BaseException as e:
        logger.error(f"Unexpected error in tdata conversion: {e}")
        return False, f"failed_invalid_tdata: {e}", None
