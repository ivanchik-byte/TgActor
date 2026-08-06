import os
import zipfile
import tempfile
import logging
from typing import Tuple
from opentele2.td import TDesktop
from opentele2.api import CreateNewSession
from app.core.security import encrypt_session

logger = logging.getLogger(__name__)

async def convert_tdata_zip_to_encrypted_session(zip_path: str, password: str = None) -> Tuple[bool, str]:
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
            except zipfile.BadZipFile:
                logger.error("Failed to extract tdata: Bad zip file.")
                return False, "failed_invalid_tdata"
            
            tdata_path = None
            for root, dirs, files in os.walk(temp_dir):
                if 'tdata' in [d.lower() for d in dirs]:
                    actual_dir = next(d for d in dirs if d.lower() == 'tdata')
                    tdata_path = os.path.join(root, actual_dir)
                    break
            
            if not tdata_path:
                tdata_path = temp_dir
                
            try:
                td = TDesktop(tdata_path)
                
                if not td.isLoaded() or not td.accounts:
                    logger.error("opentele failed to load tdata (no valid auth keys found or no accounts).")
                    return False, "failed_invalid_tdata"

                logger.info("Authorizing a new session via opentele to avoid AUTH_KEY_DUPLICATED...")
                client = await td.ToTelethon(flag=CreateNewSession, password=password)
                
                me = await client.get_me()
                if not me:
                    logger.error("Failed to get_me from the new Telethon client.")
                    return False, "failed_invalid_tdata"
                    
                user_id = me.id
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
                return True, encrypted_session
                
            except BaseException as e:
                logger.error(f"Error while parsing tdata with opentele: {e}")
                return False, "failed_invalid_tdata"
                
    except BaseException as e:
        logger.error(f"Unexpected error in tdata conversion: {e}")
        return False, "failed_invalid_tdata"
