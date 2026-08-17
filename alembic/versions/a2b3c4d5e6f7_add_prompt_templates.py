"""add_prompt_templates

Revision ID: a2b3c4d5e6f7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-17 17:00:00.000000

"""
from typing import Sequence, Union
import json
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = inspector.get_table_names()

    if 'prompt_templates' not in tables:
        prompt_templates_table = op.create_table(
            'prompt_templates',
            sa.Column('id', sa.Integer(), primary_key=True, index=True),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('category', sa.String(length=50), server_default='software', nullable=False),
            sa.Column('mode', sa.String(length=20), server_default='dynamic', nullable=False),
            sa.Column('prompt_text', sa.Text(), nullable=False),
            sa.Column('system_instruction', sa.Text(), nullable=True),
            sa.Column('roles_breakdown', sa.Text(), nullable=True),
            sa.Column('tags', sa.String(length=255), nullable=True),
            sa.Column('is_builtin', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        )

        # Seed initial built-in templates
        roles_soft = json.dumps([
            {
                "role_order": 1,
                "role_name": "Скептик / Зачинщик",
                "goal": "Задать боль/вопрос о софте без банов",
                "instruction": "Задай вопрос с легким скепсисом о том, где найти нормальный инструмент автоматизации в Telegram без спамблока",
                "sample_text": "где щас найти софт нормальный чтоб не отлетать через 2 часа"
            },
            {
                "role_order": 2,
                "role_name": "Эксперт / Рекомендация",
                "goal": "Посоветовать проверенное решение",
                "instruction": "Ответь первому собеседнику и сухо порекомендуй софт от @ivanchik_byte",
                "sample_text": "у @ivanchik_byte глянь там комбайн без воды и прокси норм держит"
            },
            {
                "role_order": 3,
                "role_name": "Практик / Социальное доказательство",
                "goal": "Подтвердить личный опыт",
                "instruction": "Подключись спонтанно и подтверди, что сам давно им пользуешься",
                "sample_text": "плюсую сам на нем сижу недели три полет нормальный"
            }
        ], ensure_ascii=False)

        roles_warmup = json.dumps([
            {
                "role_order": 1,
                "role_name": "Интересующийся",
                "goal": "Спросить о перехвате постов",
                "instruction": "Спроси, как боты успевают писать первыми сразу после публикации поста",
                "sample_text": "как боты сразу под постом комменты оставляют это вручную или скрипт какой"
            },
            {
                "role_order": 2,
                "role_name": "Опытный юзер",
                "goal": "Объяснить принцип радара",
                "instruction": "Поясни про радар мониторинга каналов и плавный вход",
                "sample_text": "радар каналов слушает новые посты и запускает сценарий с рандомной задержкой"
            },
            {
                "role_order": 3,
                "role_name": "Уточняющий",
                "goal": "Задать технический вопрос",
                "instruction": "Уточни про безопасность аккаунтов и прокси",
                "sample_text": "а прокси на каждый акк отдельно вешать надо чтоб телега не забанила"
            }
        ], ensure_ascii=False)

        roles_crypto = json.dumps([
            {
                "role_order": 1,
                "role_name": "Трейдер 1",
                "goal": "Спросить о комиссиях",
                "instruction": "Поинтересуйся комиссией в сети и скоростью вывода",
                "sample_text": "комиссия щас в сети адекватная или опять задрали"
            },
            {
                "role_order": 2,
                "role_name": "Трейдер 2",
                "goal": "Дать актуальную инфу",
                "instruction": "Ответь по факту, что все летает и комиссии минимальные",
                "sample_text": "норм все пару центов вышло за транзакцию"
            },
            {
                "role_order": 3,
                "role_name": "Трейдер 3",
                "goal": "Поделиться лайфхаком",
                "instruction": "Подтверди и добавь короткий совет по кошельку",
                "sample_text": "главное газ не завышать и все четко проходит"
            }
        ], ensure_ascii=False)

        roles_dispute = json.dumps([
            {
                "role_order": 1,
                "role_name": "Консерватор",
                "goal": "Выразить сомнение в ИИ",
                "instruction": "Напиши, что ИИ-комментарии сразу видно по слащавым фразам и смайликам",
                "sample_text": "эти ии боты сразу палятся по эмодзи и точкам в конце"
            },
            {
                "role_order": 2,
                "role_name": "Технарь",
                "goal": "Опровергнуть аргументом",
                "instruction": "Поясни, что при правильном хуманизированном системном промпте текст не отличить от человека",
                "sample_text": "если промпт грамотный без эмодзи и со сленгом то хрен ты отличишь"
            },
            {
                "role_order": 3,
                "role_name": "Наблюдатель",
                "goal": "Подвести итог",
                "instruction": "Согласись и приведи пример из практики",
                "sample_text": "рил щас многие каналы на динамических промптах ведутся и вообще не выкупают"
            }
        ], ensure_ascii=False)

        op.bulk_insert(
            prompt_templates_table,
            [
                {
                    "title": "Скепсис и рекомендация проверенного решения",
                    "description": "Классическая воронка: скептический вопрос о рисках -> нативная рекомендация -> социальное доказательство.",
                    "category": "software",
                    "mode": "dynamic",
                    "prompt_text": "Диалог в ветке комментариев про выбор проверенного решения. Первый сомневается и жалуется на риски. Второй участник советует надежный вариант без лишней воды. Третий подтверждает личным положительным опытом.",
                    "system_instruction": None,
                    "roles_breakdown": roles_soft,
                    "tags": "решение,практика,опыт,рекомендация",
                    "is_builtin": True,
                    "created_at": datetime.utcnow()
                },
                {
                    "title": "Прогрев интереса: Радар каналов и авто-комментирование",
                    "description": "Пошаговое обсуждение работы фонового мониторинга постов и защиты аккаунтов через прокси.",
                    "category": "warmup",
                    "mode": "dynamic",
                    "prompt_text": "Обсуждение нового кейса или инструмента. Первый участник интересуется, как автоматизировать комментирование под свежими постами. Второй поясняет за радар и плавный вход ботов. Третий спрашивает про настройку задержек.",
                    "system_instruction": None,
                    "roles_breakdown": roles_warmup,
                    "tags": "прогрев,радар,комментирование,кейсы",
                    "is_builtin": True,
                    "created_at": datetime.utcnow()
                },
                {
                    "title": "Крипта: Комиссии и быстрые переводы",
                    "description": "Бытовой разговор трех трейдеров в ветке комментариев без лишнего пафоса.",
                    "category": "crypto",
                    "mode": "static",
                    "prompt_text": "Живой разговор трех трейдеров в комментариях канала про комиссии и быстрые переводы в TON и USDT. Без пафоса, на сленге, короткие реплики.",
                    "system_instruction": None,
                    "roles_breakdown": roles_crypto,
                    "tags": "крипта,usdt,ton,переводы,трейдинг",
                    "is_builtin": True,
                    "created_at": datetime.utcnow()
                },
                {
                    "title": "Динамический спор: ИИ против людей в комментариях",
                    "description": "Интригующая ветка обсуждения качества текстов и хуманизации промптов.",
                    "category": "skepticism",
                    "mode": "dynamic",
                    "prompt_text": "Спор о том, работают ли еще нейросети для прогрева аудитории. Первый утверждает, что шаблонные боты сразу палятся. Второй поясняет, что с динамическими промптами и без эмодзи текст неотличим от реального человека. Третий соглашается с примером.",
                    "system_instruction": None,
                    "roles_breakdown": roles_dispute,
                    "tags": "нейросети,ai,динамика,спор,промпты",
                    "is_builtin": True,
                    "created_at": datetime.utcnow()
                }
            ]
        )


def downgrade() -> None:
    op.drop_table('prompt_templates')
