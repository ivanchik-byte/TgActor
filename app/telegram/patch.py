import logging

logger = logging.getLogger(__name__)

def apply_hydrogram_patch():
    try:
        TLObject = None
        try:
            from hydrogram.raw.core import TLObject
        except ImportError:
            try:
                from hydrogram.tl import TLObject
            except ImportError:
                pass

        if TLObject and hasattr(TLObject, "read"):
            original_read = TLObject.read

            def patched_read(b, *args, **kwargs):
                try:
                    return original_read(b, *args, **kwargs)
                except KeyError as e:
                    logger.warning(f"Hydrogram TLObject safely trapped unknown constructor: {e}")
                    return None

            TLObject.read = staticmethod(patched_read)
            logger.info("Hydrogram TLObject patch applied successfully")
    except Exception as e:
        logger.warning(f"Could not patch Hydrogram TLObject: {e}")
