import re
import time
import logging
import asyncio
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.models import MonitoredChannel, Account, TaskLog, SystemConfig
from app.services.ai_service import call_ai_completion, sanitize_telegram_comment, get_ai_settings
from app.services.log_service import log_action, classify_telegram_error
from app.telegram.client import get_hydrogram_client
from app.telegram.preflight import check_chat_availability

logger = logging.getLogger("tgactor.first_comment")

DEFAULT_FIRST_COMMENT_PROMPT = """# СИСТЕМНЫЙ ПРОМПТ ДЛЯ ПЕРВОГО КОММЕНТАРИЯ (FAST FIRST COMMENT ENGINE v1.0)

Ты — внимательный и сообразительный читатель Telegram-канала, который первым увидел свежий пост и оставил меткий, ценный или остроумный комментарий.

# ПРАВИЛА:
1. Пиши 1 (максимум 2) коротких, ёмких предложения строго по сути темы поста.
2. ВООБЩЕ НИКАКИХ ЭМОДЗИ и смайликов (категорический запрет).
3. НИКАКОЙ ТОЧКИ в самом конце комментария.
4. НИКАКОЙ прямой рекламы (не пиши "подписывайтесь на мой канал", "у меня на канале" и т.п.).
5. Тон: живой человек, естественный разговорный интернет-стиль, можно начинать с маленькой буквы.
6. Разрешено: остроумная реакция, экспертное практическое дополнение, вопрос автору или меткое наблюдение.
7. Формат вывода: ТОЛЬКО чистый текст комментария без кавычек и префиксов.
"""

FIRST_COMMENT_PRESETS = {
    "expert": "Напиши короткий (1 предложение) экспертный инсайт или профессиональное уточнение к теме поста. Без воды, без точки в конце.",
    "question": "Задай один острый или вовлекающий вопрос автору/аудитории по содержанию поста. В конце поставь '?'",
    "insight": "Дополни новость/пост полезной деталью или практическим наблюдением из реального опыта. Без эмодзи, без точки в конце.",
    "humor": "Напиши остроумную, ироничную и короткую реакцию на новость/пост. Живой сленг, без смайлов, без точки в конце."
}

AD_PATTERNS = [
    r'erid\s*[:=\s]\s*[a-zA-Z0-9]+',
    r'#реклама\b',
    r'#партнерский\b',
    r'#промо\b',
    r'реклама\s+в\s+канале',
    r'токен\s+орд',
    r'инн\s+\d{10,12}',
    r'огрн\s+\d{13,15}',
    r't\.me/\+[a-zA-Z0-9_\-]+', # Private channel invite links
    r'vk\.cc/[a-zA-Z0-9]+',
    r'clck\.ru/[a-zA-Z0-9]+'
]

def is_ad_post(post_text: str) -> Tuple[bool, str]:
    """Check if post is an advertisement or sponsored content."""
    if not post_text:
        return False, ""
    
    text_lower = post_text.lower()
    for pattern in AD_PATTERNS:
        match = re.search(pattern, text_lower, re.IGNORECASE)
        if match:
            return True, match.group(0)
    return False, ""

async def generate_first_comment(
    session: AsyncSession,
    post_text: str,
    custom_prompt: Optional[str] = None,
    ai_model: Optional[str] = None,
    channel_username: Optional[str] = None
) -> str:
    """Generate a sharp, contextual first comment using AI."""
    ai_cfg = await get_ai_settings(session)
    provider = ai_cfg.get("ai_provider") or "openai"
    model = ai_model or ai_cfg.get("ai_default_model") or "gpt-4o-mini"
    api_key = ai_cfg.get("ai_api_key")
    base_url = ai_cfg.get("ai_base_url")

    system_prompt = (custom_prompt or "").strip() or DEFAULT_FIRST_COMMENT_PROMPT

    user_content = f"""Текст нового опубликованного поста в Telegram-канале @{channel_username or 'channel'}:
---
{post_text.strip()[:1500]}
---

Сгенерируй первый идеальный комментарий к этому посту по правилам системного промпта:"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]

    try:
        raw_reply = await call_ai_completion(
            provider=provider,
            model=model,
            api_key=api_key,
            messages=messages,
            base_url=base_url,
            temperature=0.75,
            max_tokens=150
        )
        return sanitize_telegram_comment(raw_reply)
    except Exception as e:
        logger.error(f"Error generating first comment with AI: {e}")
        fallbacks = [
            "годная тема кстати",
            "надо будет протестировать",
            "любопытно как это на практике работает",
            "чот сомнительно но интересно",
            "давно пора было такое сделать"
        ]
        import random
        return random.choice(fallbacks)

async def check_channel_send_as_permission(account: Account, channel_username: str) -> Dict[str, Any]:
    """
    Verify whether the given account can post messages as the specified channel.
    """
    clean_user = channel_username.replace("@", "").replace("https://t.me/", "").strip()
    if not clean_user:
        return {"ok": False, "error": "Не указан юзернейм канала"}

    client = get_hydrogram_client(account, getattr(account, 'proxy', None))
    try:
        await client.start()
        chat = await client.get_chat(clean_user)
        is_channel = getattr(chat, 'type', None) and (str(chat.type).lower().endswith("channel") or getattr(chat.type, 'value', '') == 'channel')
        
        is_creator = getattr(chat, 'is_creator', False)
        
        return {
            "ok": True,
            "channel_id": chat.id,
            "title": getattr(chat, 'title', clean_user),
            "username": getattr(chat, 'username', clean_user),
            "is_creator": is_creator,
            "is_channel": is_channel
        }
    except Exception as e:
        diag = classify_telegram_error(e)
        return {"ok": False, "error": f"{diag['badge']}: {e}"}
    finally:
        try:
            await client.stop()
        except Exception:
            pass

async def send_first_comment(
    session: AsyncSession,
    channel: MonitoredChannel,
    post_id: int,
    post_text: str
) -> Dict[str, Any]:
    """
    Executes First Comment Sniping:
    1. Checks ad filters.
    2. Generates humanized contextual comment.
    3. Resolves discussion thread and sends message (as channel or as account).
    4. Logs metrics and action results.
    """
    t_start = time.time()
    ch_user = channel.channel_username

        # 1. Ad Filtering
        if channel.skip_ads:
            is_ad, ad_marker = is_ad_post(post_text)
            if is_ad:
                skip_msg = f"Пропуск поста #{post_id} в {ch_user}: обнаружен рекламный маркер '{ad_marker}'"
                logger.info(f"Anti-Ad Shield: {skip_msg}")
                await log_action(
                    session,
                    action_type="first_comment_skipped",
                    status="warning",
                    target=ch_user,
                    target_id=f"msg #{post_id} (реклама)",
                    details={
                        "summary": f"Пост #{post_id} пропущен (реклама: {ad_marker})",
                        "badge": "Пропуск рекламы",
                        "ad_marker": ad_marker,
                        "channel": ch_user
                    }
                )
                return {"status": "skipped", "reason": f"Ad detected: {ad_marker}"}

        # 2. Select Sender Account
        sender_account = None
        if channel.sender_account_id:
            sender_account = await session.get(Account, channel.sender_account_id)
            if sender_account and not sender_account.is_active:
                sender_account = None

        if not sender_account:
            stmt = select(Account).where(Account.is_active == True).options(selectinload(Account.proxy))
            active_accs = list((await session.execute(stmt)).scalars().all())
            if not active_accs:
                error_msg = f"Первый комментарий: нет доступных активных аккаунтов для {ch_user}"
                logger.error(error_msg)
                session.add(TaskLog(status="error", error_message=error_msg))
                await session.commit()
                return {"status": "error", "error": error_msg}
            sender_account = active_accs[0]

        # 3. Generate AI Comment
        comment_text = await generate_first_comment(
            session=session,
            post_text=post_text,
            custom_prompt=channel.custom_prompt,
            ai_model=channel.ai_model,
            channel_username=ch_user
        )

        if not comment_text:
            comment_text = "годная тема"

        # 4. Resolve discussion & Send
        client = get_hydrogram_client(sender_account, getattr(sender_account, 'proxy', None))
        try:
            await client.start()
            
            # Check target discussion
            target_chat_id = ch_user
            default_reply_to = None
            
            try:
                disc_msg = await client.get_discussion_message(ch_user, post_id)
                if disc_msg and getattr(disc_msg, 'chat', None):
                    target_chat_id = disc_msg.chat.id
                    default_reply_to = disc_msg.id
            except Exception as disc_err:
                logger.warning(f"Notice getting discussion for {ch_user} post #{post_id}: {disc_err}")

            # Preflight permissions check
            avail_ok, avail_err = await check_chat_availability(client, target_chat_id, requires_media=False)
            if not avail_ok:
                error_msg = f"Первый комментарий: доступ к чату обсуждения {target_chat_id} закрыт ({avail_err})"
                logger.warning(error_msg)
                session.add(TaskLog(account_id=sender_account.id, status="error", error_message=error_msg))
                await log_action(
                    session,
                    action_type="first_comment_send",
                    status="error",
                    account_id=sender_account.id,
                    target=ch_user,
                    target_id=f"msg #{post_id}",
                    details={"error": error_msg, "badge": "Ошибка доступа"}
                )
                await session.commit()
                return {"status": "error", "error": error_msg}

            # Determine send_as author
            send_as_target = None
            author_label = sender_account.custom_name or sender_account.username or f"Аккаунт #{sender_account.id}"

            if channel.send_as_mode == "channel" and channel.send_as_channel_username:
                clean_author_channel = channel.send_as_channel_username.replace("@", "").replace("https://t.me/", "").strip()
                try:
                    author_chat = await client.get_chat(clean_author_channel)
                    send_as_target = author_chat.id
                    author_label = f"Канал: @{author_chat.username or clean_author_channel}"
                except Exception as e:
                    logger.warning(f"Не удалось получить peer для send_as @{clean_author_channel}: {e}. Отправка от лица аккаунта.")

            # Send Message
            sent_msg = None
            send_kwargs = {}
            if default_reply_to:
                send_kwargs["reply_to_message_id"] = default_reply_to
            if send_as_target:
                send_kwargs["send_as"] = send_as_target

            try:
                sent_msg = await client.send_message(
                    chat_id=target_chat_id,
                    text=comment_text,
                    **send_kwargs
                )
            except Exception as send_err:
                if send_as_target:
                    logger.warning(f"Ошибка отправки от лица канала ({send_err}). Пробуем отправить от аккаунта...")
                    send_kwargs.pop("send_as", None)
                    sent_msg = await client.send_message(
                        chat_id=target_chat_id,
                        text=comment_text,
                        **send_kwargs
                    )
                    author_label = f"Профиль: {sender_account.username or sender_account.phone} (Fallback)"
                else:
                    raise send_err

            latency_ms = int((time.time() - t_start) * 1000)
            sent_msg_id = getattr(sent_msg, 'id', None)

            log_msg = f"Первый комментарий от {author_label} -> {ch_user} (пост #{post_id}): '{comment_text}' ({latency_ms}мс)"
            logger.info(log_msg)

            session.add(TaskLog(
                account_id=sender_account.id,
                status="success",
                error_message=f"Первый комментарий опубликован: msg #{sent_msg_id} ({latency_ms}мс)"
            ))
            
            await log_action(
                session,
                action_type="first_comment_send",
                status="ok",
                account_id=sender_account.id,
                target=ch_user,
                target_id=f"msg #{post_id} -> comm #{sent_msg_id}",
                details={
                    "summary": f"Первый комментарий оставлен от {author_label}: «{comment_text}»",
                    "badge": "1-й коммент",
                    "post_id": post_id,
                    "comment_id": sent_msg_id,
                    "comment_text": comment_text,
                    "author": author_label,
                    "channel": ch_user,
                    "latency_ms": latency_ms
                }
            )
            await session.commit()

            return {
                "status": "ok",
                "comment_id": sent_msg_id,
                "comment_text": comment_text,
                "author": author_label,
                "latency_ms": latency_ms
            }

    except Exception as ex:
        diag = classify_telegram_error(ex)
        error_msg = f"Ошибка отправки первого комментария в {ch_user}: {ex} ({diag['badge']})"
        logger.error(error_msg)
        session.add(TaskLog(account_id=sender_account.id, status="error", error_message=error_msg))
        await log_action(
            session,
            action_type="first_comment_send",
            status="error",
            account_id=sender_account.id,
            target=ch_user,
            target_id=f"msg #{post_id}",
            details={
                "summary": diag["summary"],
                "badge": diag["badge"],
                "category": diag["category"],
                "error": str(ex),
                "channel": ch_user
            }
        )
        await session.commit()
        return {"status": "error", "error": error_msg}
    finally:
        try:
            await client.stop()
        except Exception:
            pass
