import os
import zipfile
import tempfile
import logging
from typing import Tuple
from opentele2.td import TDesktop
from opentele2.api import CreateNewSession
from security import encrypt_session

logger = logging.getLogger(__name__)

async def convert_tdata_zip_to_encrypted_session(zip_path: str) -> Tuple[bool, str]:
    """
    Extracts tdata from a zip archive, converts it to a Pyrogram-compatible StringSession using opentele,
    encrypts the session, and returns (success, result_or_error_status).
    
    Returns:
        (True, encrypted_session_string) if successful.
        (False, "failed_invalid_tdata") if parsing fails or invalid.
    """
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)
            except zipfile.BadZipFile:
                logger.error("Failed to extract tdata: Bad zip file.")
                return False, "failed_invalid_tdata"
            

            
            # Find tdata folder (often it's inside a subfolder in the zip)
            tdata_path = None
            for root, dirs, files in os.walk(temp_dir):
                if 'tdata' in [d.lower() for d in dirs]:
                    # Find exact case
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

                # Generate Pyrogram-compatible session string for the main account
                # Format: ">BI?256sQ?"
                import struct
                import base64
                acc = td.mainAccount or td.accounts[0]
                
                packed = struct.pack(
                    ">BI?256sQ?",
                    acc.MainDcId,
                    acc.api.api_id,
                    False, # test_mode
                    acc.authKey.key,
                    acc.UserId,
                    False # is_bot
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
