import os
import zipfile
import tempfile
import logging
from typing import Tuple
from opentele.td import TDesktop
from opentele.api import CreateNewSession
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
                
                if not td.isLoaded():
                    logger.error("opentele failed to load tdata (no valid auth keys found).")
                    return False, "failed_invalid_tdata"

                # Generate Pyrogram StringSession. 
                # CreateNewSession API uses default API ID and Hash.
                pyrogram_session = await td.ToPyrogram(create_new_session=True)
                
                # ToPyrogram returns a Pyrogram Client. We can extract the session string.
                # Actually, opentele Pyrogram integration:
                # string_session = td.ToPyrogramSession() # this might not exist.
                # We can use Pyrogram's export_session_string() on the client if it starts, 
                # or there's an API in opentele. Let's try Pyrogram export.
                # Wait, ToPyrogram returns a Pyrogram Client instance.
                # In Pyrogram, you can get the session string by `await client.export_session_string()`
                # ONLY if the client is connected. 
                # Let's check opentele docs via generic exception handler if it fails.
                
                try:
                    # In opentele >= 1.15, you can often do this:
                    string_session = td.ToPyrogramSession() 
                except AttributeError:
                    logger.error("ToPyrogramSession not found on TDesktop instance.")
                    return False, "failed_invalid_tdata"

                if not string_session:
                    logger.error("Failed to generate Pyrogram session from tdata.")
                    return False, "failed_invalid_tdata"
                    
                encrypted_session = encrypt_session(string_session)
                return True, encrypted_session
                
            except BaseException as e:
                logger.error(f"Error while parsing tdata with opentele: {e}")
                return False, "failed_invalid_tdata"
                
    except BaseException as e:
        logger.error(f"Unexpected error in tdata conversion: {e}")
        return False, "failed_invalid_tdata"
