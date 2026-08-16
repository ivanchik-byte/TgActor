import logging
import sys

# Terminal ANSI color codes for high-visibility terminal logs
RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"
WHITE = "\033[97m"
GRAY = "\033[90m"

class TerminalLogFormatter(logging.Formatter):
    """Clean, high-visibility, colorized terminal log formatter."""
    def format(self, record: logging.LogRecord) -> str:
        asctime = self.formatTime(record, "%H:%M:%S")
        level = record.levelname
        msg = record.getMessage()

        # Format levels with colors
        if level == "ERROR":
            level_fmt = f"{RED}{BOLD}[ERROR]{RESET}"
        elif level == "WARNING":
            level_fmt = f"{YELLOW}{BOLD}[WARN]{RESET}"
        elif level == "INFO":
            level_fmt = f"{GREEN}[INFO]{RESET}"
        else:
            level_fmt = f"{GRAY}[{level}]{RESET}"

        # Colorize and format important operational keywords in terminal
        if "[ЧАТ ЗАКРЫТ]" in msg or "Чат закрыт" in msg or "отключены комментарии" in msg:
            clean_msg = msg.replace("[ЧАТ ЗАКРЫТ]", "").replace("Чат закрыт:", "").strip()
            msg = f"{RED}{BOLD}🚫 [ЧАТ ЗАКРЫТ]{RESET} {RED}{clean_msg}{RESET}"
        elif "[РЕАЛЬНОЕ ВРЕМЯ СЛЕТЕЛО]" in msg or "Реальное время слетело" in msg:
            clean_msg = msg.replace("[РЕАЛЬНОЕ ВРЕМЯ СЛЕТЕЛО]", "").replace("Реальное время слетело:", "").strip()
            msg = f"{YELLOW}{BOLD}⏳ [РЕАЛЬНОЕ ВРЕМЯ СЛЕТЕЛО]{RESET} {YELLOW}{clean_msg}{RESET}"
        elif "FloodWait" in msg or "FLOODWAIT" in msg:
            msg = f"{YELLOW}{BOLD}⚠️ [FLOODWAIT]{RESET} {YELLOW}{msg}{RESET}"
        elif "PeerFlood" in msg or "СПАМ-БЛОК" in msg:
            msg = f"{RED}{BOLD}🛑 [СПАМ-БЛОК]{RESET} {RED}{msg}{RESET}"
        elif "Сессия слетела" in msg:
            msg = f"{RED}{BOLD}🔒 [СЕССИЯ СЛЕТЕЛА]{RESET} {RED}{msg}{RESET}"
        elif "обнаружен пост" in msg or "New post detected" in msg:
            msg = f"{CYAN}{BOLD}📡 [НОВЫЙ ПОСТ]{RESET} {CYAN}{msg}{RESET}"
        elif "Live sync imported" in msg:
            msg = f"{MAGENTA}{BOLD}📥 [ВХОДЯЩИЕ]{RESET} {MAGENTA}{msg}{RESET}"

        return f"{GRAY}[{asctime}]{RESET} {level_fmt} {msg}"

class PollingFilter(logging.Filter):
    """Filter out noisy repetitive 200 OK polling requests from terminal logs."""
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if any(endpoint in msg for endpoint in [
            "GET /api/inbox/chats",
            "GET /api/inbox/messages",
            "GET /api/accounts",
            "GET /api/config/proxy-mode",
            "GET /api/scenarios/",
            "GET /api/logs/actions",
            "GET /api/logs/stats",
            "GET /api/logs/filters",
            "GET /api/settings/ai",
            "GET /api/proxies"
        ]):
            return False
        return True

def setup_terminal_logging():
    """Configure terminal logging: high-signal output, clear error tags, suppress framework spam."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(TerminalLogFormatter())

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.handlers = [handler]

    # Suppress verbose spam from 3rd-party libs in terminal
    logging.getLogger("hydrogram.connection").setLevel(logging.WARNING)
    logging.getLogger("hydrogram.session").setLevel(logging.WARNING)
    logging.getLogger("hydrogram.dispatcher").setLevel(logging.WARNING)
    logging.getLogger("hydrogram.client").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)
    logging.getLogger("alembic.runtime.migration").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)

    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.addFilter(PollingFilter())
