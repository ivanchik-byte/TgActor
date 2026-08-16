import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Trash2, Paperclip, Plus, Sparkles, MessageSquare, Settings, Play, AlertTriangle, PlusCircle, Save, Download, Upload, GripVertical, Bot, Zap, Wand2, CheckCircle2, X } from 'lucide-react';
import { useToast } from '../components/ToastContext';

interface Replica {
  id: string; // React local temporary ID or database ID
  dbId?: number;
  role: string; // Database Account ID (stored as string)
  type: 'normal' | 'reply';
  replyToId: string; // Points to temporary ID (id) or dbId
  text: string;
  minDelay: string;
  maxDelay: string;
  reactions: string;
  reactionCount: number;
  reactionSource?: 'pool' | 'roles' | 'manual' | 'ai_smart';
  reactionRoles?: string; // space separated role/account IDs
  fileName: string;
  noAttachmentIfForbidden: boolean;
  isAiDynamic?: boolean;
  aiPrompt?: string;
}

const DEFAULT_SYSTEM_PROMPT = `# СИСТЕМНЫЙ ПРОМПТ ПЕРСОНАЖА (HUMANIZED TELEGRAM STRANGER ENGINE v3.1)

# 1. ОСНОВНАЯ РОЛЬ И КОНТЕКСТ
Ты — случайный реальный пользователь Telegram, который листает ленту каналов с телефона и оставляет комментарии под постами.
Ты и другие комментаторы в ветке — АБСОЛЮТНО НЕЗНАКОМЫЕ МЕЖДУ СОБОЙ ЛЮДИ. Вы никогда не встречались, не имеете общих договоренностей и общаетесь в комментариях свободно на «ты», как обычные пользователи в интернете.

# 2. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ЭМОДЗИ И СМАЙЛИКИ (СТРОЖАЙШИЙ ПРИКАЗ)
- ВООБЩЕ НИ ОДНОГО ЭМОДЗИ В ТЕКСТЕ. Категорически запрещены любые эмодзи: никаких смайлов, огоньков, пальцев, значков, сердечек, маркеров.
- Категорически запрещены текстовые смайлики вида :-), :), ;), =), :D, :-(.
- Категорически запрещены закрывающие скобки вместо улыбок (никаких ")))" или "))").
- Пиши исключительно чистыми буквами русского алфавита, цифрами и стандартными знаками препинания (?, !, -).

# 3. КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ТОЧКУ В КОНЦЕ СООБЩЕНИЯ
- НИКОГДА НЕ СТАВЬ ТОЧКУ В САМОМ КОНЦЕ СООБЩЕНИЯ. Настоящие люди в мессенджерах при быстром вводе с мобильного не ставят финальную точку.
- Если вопрос — ставь "?" или "??".
- Если восклицание — ставь "!".
- В остальных случаях сообщение должно просто заканчиваться последним словом без точки.

# 4. ЗАПРЕТ НА ИДЕАЛЬНУЮ КНИЖНУЮ ГРАММАТИКУ И ПЕРЕГРУЗ ЗАПЯТЫМИ (ПИШИ КАК ЖИВОЙ ЧЕЛОВЕК)
- НЕ СТАВЬ ЗАПЯТЫЕ ВЕЗДЕ как на диктанте в школе. Живые люди в Telegram пишут бегло с телефона и часто пропускают запятые (например: "я вчера чекал вроде норм", "если надо могу скинуть", "да там все просто на самом деле", "хз вроде работает").
- НЕ ПИШИ сложными академическими причастными и деепричастными оборотами.
- Пиши отрывисто, просто, разговорно. Разрешено и приветствуется начинать с маленькой буквы.

# 5. АНТИ-ИИ ФИЛЬТР (HUMANIZER RULES)
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ДЛИННОЕ ТИРЕ ("—" или "–"). В мобильной клавиатуре ставят обычный дефис "-" или вообще пишут без него.
- ЗАПРЕЩЕНА РЕКЛАМНАЯ СЛАЩАВОСТЬ И ЛЕСТЬ. Никаких "отличный пост", "спасибо автору", "уникальный контент", "настоятельно рекомендую", "подписывайтесь". Живой человек рекомендует сухо, по делу, делясь сугубо личным опытом ("я у него брал скрипт", "глянь канал, там без воды").
- ЗАПРЕЩЕНЫ ФОРМАЛЬНЫЕ ПРИВЕТСТВИЯ ("Здравствуйте", "Добрый день", "Приветствую", "Всего доброго"). Незнакомцы в комментариях сразу переходят к сути.
- ЗАПРЕЩЕНЫ ИИ-СВЯЗКИ И КЛИШЕ: "Таким образом", "В итоге", "Важно подчеркнуть", "Следует отметить", "Не только... но и", "Действительно", "Безусловно", "Хочу поделиться", "Стоит обратить внимание".
- ЗАПРЕЩЕНЫ списки с цифрами (1., 2.), маркеры (•), кавычки вокруг сообщения и оформление в виде кода.
- ЗАПРЕЩЕНЫ искусственные конструкции из трех пунктов ("быстро, удобно и надежно").

# 6. ПОВЕДЕНИЕ НЕЗНАКОМЦЕВ В ТРЕДЕ
- Все участники общаются на «ты», просто и без официоза.
- У каждого комментатора свой независимый характер, свой словарный запас и своя интонация:
  * Первый может задать конкретный вопрос с легким скепсисом ("где щас найти нормальный софт без скама").
  * Второй может коротко и по-человечески подсказать проверенный источник.
  * Третий подключается в ветку спонтанно, подтверждает опыт или задает свой практический вопрос.
- Реплики не должны выглядеть как спланированная реклама. Это обычный бытовой треп людей в комментариях.

# 7. СТИЛЬ, РИТМ И СЛЕНГ
- ДЛИНА: Коротко. 1-2 простых предложения. Без сложносочиненных тяжелых конструкций.
- ЛЕКСИКА: Естественный интернет-сленг (хз, спс, норм, имхо, щас, чот, ппц, вобще, рофл, чел, тема), простые разговорные частицы (да ладно, ого, мда, эх, мб).
- РЕГИСТР: Можно начинать с маленькой буквы.

# 8. ФОРМАТ ВЫВОДА
Выдавай ТОЛЬКО чистый текст реплики от первого лица без кавычек, без префиксов, без эмодзи и строго без точки в конце.`;

const EMPTY_ARRAY: any[] = [];

const DEFAULT_DYNAMIC_TEMPLATES = [
  {
    id: 'dt1',
    title: '🔥 Нативная реклама софта @ivanchik_byte (Роли 1-2-3)',
    prompt: `Динамический сценарий нативной ненавязчивой рекламы канала @ivanchik_byte между 3 абсолютно незнакомыми людьми в комментариях Telegram на "ты".

ПОШАГОВАЯ ДРАМАТУРГИЯ И ИНСТРУКЦИИ ДЛЯ БОТОВ:
1. РОЛЬ 1 (Инициатор): Начинает диалог по теме поста. С легким скепсисом или вопросом поднимает реальную проблему (где взять рабочий софт для Telegram, скрипты без инфоцыганских курсов и лишней воды).
2. РОЛЬ 2 (Советчик / Практик): Отвечает Роли 1 по делу. Без слащавой рекламы советует заглянуть в канал @ivanchik_byte. Отмечает, что автор сам пишет качественный софт, выкладывает реальные кейсы, Docker-шаблоны и скрипты.
3. РОЛЬ 3 (Единомышленник): Вклинивается в ветку с живым удивлением («ого, не ожидал тут увидеть тех кто в теме», «тоже сижу у иванчика»). Подтверждает личным опытом (настроил комбайн / ботов, всё летает). Задает уточняющий вопрос по фишкам (например, про ротацию прокси или задержки).
4. РОЛЬ 2: Раскрывает детали Роли 3 и Роли 1 (как работают задержки, веб-панель и безопасность).
5. РОЛЬ 1: Задает короткий финальный вопрос о настройке.
6. РОЛЬ 3: Дополняет ответ своим практическим советом.
7. РОЛЬ 1: Благодарит собеседников и подводит логический итог (говорит, что пошел чекать канал и тестировать).

СТРОГИЕ ПРАВИЛА: Без эмодзи в тексте сообщений, без точек в конце, разговорный сленг незнакомцев, адресные ответы по смыслу.`
  },
  {
    id: 'dt2',
    title: '🤖 Автоматизация комментирования и прогрев фермы ботов',
    prompt: `Динамический сценарий технической дискуссии об автоматизации комментирования в Telegram и безопасном прогреве сетки аккаунтов.

ПОШАГОВАЯ ДРАМАТУРГИЯ И ИНСТРУКЦИИ ДЛЯ БОТОВ:
1. РОЛЬ 1 (Новичок-практик): Задает вопрос в комментариях под постом о том, как сейчас автоматизировать комментирование каналов и не ловить бан аккаунтов.
2. РОЛЬ 2 (Опытный разработчик/арбитражник): Поясняет за архитектуру: рандомизация задержек (3-15 сек), использование мобильных прокси с ротацией и разделение аккаунтов на пулы (комментирование и реакции).
3. РОЛЬ 3 (Участник с опытом): Подключается к обсуждению, отмечает важность динамических ИИ-ответов на лету, чтобы каждое сообщение было уникальным под контекст поста.
4. РОЛЬ 1: Уточняет, сложно ли развернуть такую систему в Docker на VPS сервере.
5. РОЛЬ 2: Объясняет, что в Docker всё поднимается одной командой за пару минут через docker-compose.
6. РОЛЬ 3: Дополняет рекомендацией по контролю лимитов сообщений в сутки.
7. РОЛЬ 1: Благодарит за практическую инфу и резюмирует ветку.

СТРОГИЕ ПРАВИЛА: Без эмодзи в тексте сообщений, без точек в конце, живой язык на "ты", адресные ответы.`
  },
  {
    id: 'dt3',
    title: '🌐 Мобильные SOCKS5 прокси, прогрев и защита от спамблока',
    prompt: `Динамический сценарий профессионального обсуждения безопасности аккаунтов Telegram и настройки мобильных прокси.

ПОШАГОВАЯ ДРАМАТУРГИЯ И ИНСТРУКЦИИ ДЛЯ БОТОВ:
1. РОЛЬ 1: Поднимает тему частых блокировок или FloodWait при работе с несколькими Telegram аккаунтами.
2. РОЛЬ 2: Делится проверенным решением: приватные мобильные SOCKS5 прокси с автосменой IP по ссылке, разнесение сессий по независимым IP и отлежка новых аккаунтов.
3. РОЛЬ 3: Вклинивается с подтверждением, рассказывает про свой опыт разделения пулов (отдельные прокси для чтения и для реакций).
4. РОЛЬ 1: Спрашивает про оптимальное количество аккаунтов на один мобильный порт прокси.
5. РОЛЬ 2: Отвечает конкретными цифрами (не более 3-5 аккаунтов на канал с ротацией IP).
6. РОЛЬ 3: Добавляет совет по установке умных задержек перед отправкой реакций (3-6 секунд).
7. РОЛЬ 1: Подводит итог ветки и благодарит за понятный гайд.

СТРОГИЕ ПРАВИЛА: Без эмодзи в тексте, без точек на конце, естественный сленг (норм, спс, щас, чекнуть, хз), ветвление ответов по смыслу.`
  }
];

const DEFAULT_STATIC_TEMPLATES = [
  {
    id: 'st1',
    title: '💬 Обсуждение надежности криптокошельков',
    prompt: 'Реалистичный диалог 3 незнакомцев про некастодиальные криптокошельки. Первый спрашивает какой кошелек безопаснее для холодного хранения. Второй советует Tangem и Trust, поясняя про приватные ключи. Третий делится опытом восстановления сид-фразы и подтверждает надежность.'
  },
  {
    id: 'st2',
    title: '⚡ Парсинг аудитории и мониторинг новых постов',
    prompt: 'Диалог 3 участников на "ты" про скорость реакции на новые публикации. Первый спрашивает как успевать комментировать первым. Второй рассказывает про мониторинг по вебхукам. Третий делится своим опытом фильтрации каналов.'
  },
  {
    id: 'st3',
    title: '📊 Спор про облачные VPS и деплой скриптов',
    prompt: 'Конструктивный диалог 3 человек про выбор VPS под Telegram ботов. Первый спрашивает где дешевле и стабильнее брать сервер. Второй советует конфигурации с 2GB RAM под Docker. Третий подтверждает что на чистом Linux в докере ничего не падает.'
  }
];

export default function Scenarios() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  
  // Dynamic templates state
  const [dynamicTemplates, setDynamicTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('tgactor_ai_dyn_templates_v1');
      return saved ? JSON.parse(saved) : DEFAULT_DYNAMIC_TEMPLATES;
    } catch {
      return DEFAULT_DYNAMIC_TEMPLATES;
    }
  });

  // Static templates state
  const [staticTemplates, setStaticTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('tgactor_ai_stat_templates_v1');
      return saved ? JSON.parse(saved) : DEFAULT_STATIC_TEMPLATES;
    } catch {
      return DEFAULT_STATIC_TEMPLATES;
    }
  });

  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [addTemplateTarget, setAddTemplateTarget] = useState<'dynamic' | 'static'>('dynamic');
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('');

  const handleAddCustomTemplate = () => {
    if (!newTemplateTitle.trim() || !newTemplatePrompt.trim()) return;
    const newT = {
      id: Math.random().toString(36).substring(2, 9),
      title: newTemplateTitle.trim(),
      prompt: newTemplatePrompt.trim()
    };

    if (addTemplateTarget === 'dynamic') {
      const updated = [...dynamicTemplates, newT];
      setDynamicTemplates(updated);
      try { localStorage.setItem('tgactor_ai_dyn_templates_v1', JSON.stringify(updated)); } catch {}
    } else {
      const updated = [...staticTemplates, newT];
      setStaticTemplates(updated);
      try { localStorage.setItem('tgactor_ai_stat_templates_v1', JSON.stringify(updated)); } catch {}
    }

    setNewTemplateTitle('');
    setNewTemplatePrompt('');
    setShowAddTemplateModal(false);
    showToast('Новый шаблон сохранен!', 'success');
  };

  const handleDeleteDynamicTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = dynamicTemplates.filter((t: any) => t.id !== id);
    setDynamicTemplates(updated);
    try { localStorage.setItem('tgactor_ai_dyn_templates_v1', JSON.stringify(updated)); } catch {}
    showToast('Динамический шаблон удален', 'info');
  };

  const handleDeleteStaticTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = staticTemplates.filter((t: any) => t.id !== id);
    setStaticTemplates(updated);
    try { localStorage.setItem('tgactor_ai_stat_templates_v1', JSON.stringify(updated)); } catch {}
    showToast('Статический шаблон удален', 'info');
  };
  
  // Active Scenario state
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null);
  const [newScenarioTitle, setNewScenarioTitle] = useState('');
  const [showAddScenario, setShowAddScenario] = useState(false);

  // Confirm delete scenario ID state
  const [confirmDeleteScenarioId, setConfirmDeleteScenarioId] = useState<number | null>(null);

  // Execution modal state
  const [executingScenarioId, setExecutingScenarioId] = useState<number | null>(null);
  const [execTarget, setExecTarget] = useState('');
  const [execPostId, setExecPostId] = useState('');

  const executeScenarioMutation = useMutation({
    mutationFn: async () => {
      if (!executingScenarioId || !execTarget.trim()) return;
      await axios.post(`/api/scenarios/${executingScenarioId}/execute`, {
        target: execTarget.trim(),
        post_id: execPostId.trim() ? parseInt(execPostId.trim()) : null
      });
    },
    onSuccess: () => {
      showToast('Сценарий успешно запущен в Telegram!', 'success');
      setExecutingScenarioId(null);
      setExecTarget('');
      setExecPostId('');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.detail || 'Ошибка запуска сценария!', 'error');
    }
  });

  // Scenario config editing state
  const [scenarioName, setScenarioName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [defaultMinDelay, setDefaultMinDelay] = useState(5);
  const [defaultMaxDelay, setDefaultMaxDelay] = useState(10);
  const [scenarioWeight, setScenarioWeight] = useState(1);

  // AI Configuration State
  const [scenarioMode, setScenarioMode] = useState<'manual' | 'ai_generated' | 'ai_dynamic'>('manual');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiProvider, setAiProvider] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');

  // AI One-time Generation Modal & Generator state
  const [aiGenPrompt, setAiGenPrompt] = useState('');
  const [aiGenAccountsCount, setAiGenAccountsCount] = useState(3);
  const [aiGenStepsCount, setAiGenStepsCount] = useState(6);
  const [aiGenReactionsEnabled, setAiGenReactionsEnabled] = useState(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Global AI Settings Modal state
  const [showAISettingsModal, setShowAISettingsModal] = useState(false);
  const [aiConfigProvider, setAiConfigProvider] = useState('openai');
  const [aiConfigApiKey, setAiConfigApiKey] = useState('');
  const [aiConfigDefaultModel, setAiConfigDefaultModel] = useState('gpt-4o-mini');
  const [aiConfigSystemPrompt, setAiConfigSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [aiConfigBaseUrl, setAiConfigBaseUrl] = useState('');
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [isSavingAISettings, setIsSavingAISettings] = useState(false);

  // Preset system state
  const [presetName, setPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);

  // Fetch AI Global Settings
  const { data: aiSettingsData, refetch: refetchAISettings } = useQuery({
    queryKey: ['aiSettings'],
    queryFn: async () => (await axios.get('/api/settings/ai')).data
  });

  // Fetch AI Presets
  const { data: aiPresets = [], refetch: refetchPresets } = useQuery({
    queryKey: ['aiPresets'],
    queryFn: async () => (await axios.get('/api/settings/ai/presets')).data
  });

  useEffect(() => {
    if (aiSettingsData) {
      setAiConfigProvider(aiSettingsData.ai_provider || 'openai');
      setAiConfigApiKey(aiSettingsData.ai_api_key || '');
      setAiConfigDefaultModel(aiSettingsData.ai_default_model || 'gpt-4o-mini');
      const p = aiSettingsData.ai_system_prompt;
      if (!p || p.includes('Ты ведешь естественный человеческий диалог')) {
        setAiConfigSystemPrompt(DEFAULT_SYSTEM_PROMPT);
      } else {
        setAiConfigSystemPrompt(p);
      }
      setAiConfigBaseUrl(aiSettingsData.ai_base_url || '');
    }
  }, [aiSettingsData]);

  // Replica steps state
  const [replicas, setReplicas] = useState<Replica[]>([]);
  const [activeEmojiPickerId, setActiveEmojiPickerId] = useState<string | null>(null);

  // Fetch accounts from API
  const { data: accounts = EMPTY_ARRAY } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await axios.get('/api/accounts')).data
  });

  // Filter only accounts in commenting pool
  const commentingAccounts = useMemo(() => accounts.filter((a: any) => a.in_commenting_pool), [accounts]);

  // Fetch scenarios list
  const { data: scenarios = EMPTY_ARRAY } = useQuery({
    queryKey: ['scenarios'],
    queryFn: async () => (await axios.get('/api/scenarios')).data
  });

  // Fetch steps for active scenario
  const { data: dbSteps = EMPTY_ARRAY } = useQuery({
    queryKey: ['scenarioSteps', activeScenarioId],
    queryFn: async () => {
      if (!activeScenarioId) return [];
      return (await axios.get(`/api/scenarios/${activeScenarioId}/steps`)).data;
    },
    enabled: !!activeScenarioId
  });

  // Set default active scenario when list is loaded
  useEffect(() => {
    if (scenarios.length > 0 && activeScenarioId === null) {
      setActiveScenarioId(scenarios[0].id);
    }
  }, [scenarios, activeScenarioId]);

  // Sync scenario config edit state when active scenario changes
  useEffect(() => {
    if (activeScenarioId && scenarios.length > 0) {
      const activeScen = scenarios.find((s: any) => s.id === activeScenarioId);
      if (activeScen) {
        setScenarioName(activeScen.title);
        setIsActive(activeScen.is_active);
        setDefaultMinDelay(activeScen.min_delay);
        setDefaultMaxDelay(activeScen.max_delay);
        setScenarioWeight(activeScen.weight ?? 1);
        setScenarioMode(activeScen.mode || 'manual');
        setAiPrompt(activeScen.ai_prompt || '');
        setAiProvider(activeScen.ai_provider || '');
        setAiModel(activeScen.ai_model || '');
        setSystemInstruction(activeScen.system_instruction || '');
      }
    }
  }, [activeScenarioId, scenarios]);

  // Sync replica list when dbSteps changes
  useEffect(() => {
    if (dbSteps.length > 0) {
      // Map database steps to React Replica format
      const mapped: Replica[] = dbSteps.map((s: any, idx: number) => {
        return {
          id: `step_${s.id || idx}`,
          dbId: s.id,
          role: String(s.role_id),
          type: s.message_type === 'reply' ? 'reply' : 'normal',
          replyToId: '', // To be linked in next pass
          text: s.text || '',
          minDelay: s.delay_before_min !== null ? String(s.delay_before_min) : '',
          maxDelay: s.delay_before_max !== null ? String(s.delay_before_max) : '',
          reactions: s.reactions || '',
          reactionCount: s.reaction_count || 0,
          reactionSource: s.reaction_source || 'pool',
          reactionRoles: s.reaction_roles || '',
          fileName: s.media_path || '',
          noAttachmentIfForbidden: false,
          isAiDynamic: s.is_ai_dynamic || false,
          aiPrompt: s.ai_prompt || '',
        };
      });

      // Link replyToId based on matching dbId with reply_to_step_id
      dbSteps.forEach((s: any, idx: number) => {
        if (s.reply_to_step_id !== null) {
          const target = mapped.find(r => r.dbId === s.reply_to_step_id);
          if (target) {
            mapped[idx].replyToId = target.id;
          }
        }
      });

      setReplicas(mapped);
    } else {
      setReplicas([]);
    }
  }, [dbSteps]);

  // Mutation: Create Scenario
  const createScenarioMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await axios.post('/api/scenarios', { title });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setActiveScenarioId(data.id);
      setNewScenarioTitle('');
      setShowAddScenario(false);
    }
  });

  // Mutation: Delete Scenario
  const deleteScenarioMutation = useMutation({
    mutationFn: async (id: number) => axios.delete(`/api/scenarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setActiveScenarioId(null);
    }
  });

  // Mutation: Update Scenario Configuration
  const updateScenarioMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      await axios.put(`/api/scenarios/${activeScenarioId}`, {
        title: scenarioName,
        is_active: isActive,
        min_delay: defaultMinDelay,
        max_delay: defaultMaxDelay,
        weight: scenarioWeight,
        mode: scenarioMode,
        ai_prompt: aiPrompt,
        ai_provider: aiProvider || null,
        ai_model: aiModel || null,
        system_instruction: systemInstruction || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      showToast('Конфигурация успешно сохранена!', 'success');
    }
  });

  // Mutation: Bulk Save Steps
  const saveStepsBulkMutation = useMutation({
    mutationFn: async () => {
      if (!activeScenarioId) return;
      
      const payloadSteps = replicas.map((r, idx) => {
        let replyToIndex: number | null = null;
        if (r.type === 'reply' && r.replyToId) {
          replyToIndex = replicas.findIndex(o => o.id === r.replyToId);
          if (replyToIndex === -1) replyToIndex = null;
        }

        return {
          step_order: idx + 1,
          role_id: Number(r.role) || (commentingAccounts[0] ? Number(commentingAccounts[0].id) : 0),
          message_type: r.type,
          text: r.text,
          media_path: r.fileName || null,
          delay_before_min: r.minDelay !== '' ? Number(r.minDelay) : null,
          delay_before_max: r.maxDelay !== '' ? Number(r.maxDelay) : null,
          reactions: r.reactions || null,
          reaction_count: r.reactionCount,
          reaction_source: r.reactionSource || 'pool',
          reaction_roles: r.reactionRoles || null,
          reply_to_index: replyToIndex,
          is_ai_dynamic: r.isAiDynamic || false,
          ai_prompt: r.aiPrompt || null
        };
      });

      await axios.post(`/api/scenarios/${activeScenarioId}/steps/bulk`, {
        steps: payloadSteps
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarioSteps'] });
      showToast('Диалоговые шаги успешно сохранены!', 'success');
    }
  });

  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleExportJSON = async (scenarioId: number) => {
    try {
      const res = await axios.get(`/api/scenarios/${scenarioId}/export`);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `scenario_${scenarioId}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Сценарий успешно экспортирован в JSON', 'success');
    } catch (err) {
      showToast('Ошибка экспорта сценария', 'error');
    }
  };

  const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          const res = await axios.post('/api/scenarios/import', json);
          queryClient.invalidateQueries({ queryKey: ['scenarios'] });
          setActiveScenarioId(res.data.id);
          showToast('Сценарий успешно импортирован из JSON!', 'success');
        } catch (err: any) {
          showToast('Ошибка парсинга или импорта JSON-файла', 'error');
        }
      };
      reader.readAsText(file);
    } catch (err) {
      showToast('Ошибка чтения файла', 'error');
    }
    event.target.value = '';
  };

  const handleGenerateScenarioAI = async (isDynamic: boolean = false) => {
    if (!aiGenPrompt.trim()) {
      showToast('Введите описание диалога для ИИ!', 'error');
      return;
    }
    setIsGeneratingAI(true);
    try {
      const res = await axios.post('/api/scenarios/generate-ai', {
        prompt: aiGenPrompt.trim(),
        accounts_count: aiGenAccountsCount,
        steps_count: aiGenStepsCount,
        reactions_enabled: aiGenReactionsEnabled,
        is_dynamic: isDynamic,
        system_prompt: aiConfigSystemPrompt
      });

      const gen = res.data.scenario;
      if (gen) {
        if (gen.title && !scenarioName) setScenarioName(gen.title);
        if (gen.min_delay) setDefaultMinDelay(gen.min_delay);
        if (gen.max_delay) setDefaultMaxDelay(gen.max_delay);

        if (gen.steps && Array.isArray(gen.steps)) {
          const generatedReplicas: Replica[] = gen.steps.map((s: any, idx: number) => {
            let replyId = '';
            let msgType: 'normal' | 'reply' = 'normal';

            // Determine correct target reply replica index
            let targetIdx: number | null = null;
            if (s.reply_to_step !== null && s.reply_to_step !== undefined && s.reply_to_step >= 1) {
              targetIdx = s.reply_to_step - 1;
            } else if (s.reply_to_index !== null && s.reply_to_index !== undefined && s.reply_to_index >= 0) {
              targetIdx = s.reply_to_index;
            }

            if (idx > 0 && targetIdx !== null && targetIdx >= 0 && targetIdx < idx) {
              replyId = `step_ai_${targetIdx}`;
              msgType = 'reply';
            } else if (idx > 0) {
              replyId = `step_ai_${idx - 1}`;
              msgType = 'reply';
            }

            const stepIsDyn = Boolean(s.is_ai_dynamic || isDynamic);
            const promptVal = s.ai_prompt || (stepIsDyn ? (s.text || '') : '');

            return {
              id: `step_ai_${idx}`,
              role: String(s.role_id || (commentingAccounts[0] ? commentingAccounts[0].id : 1)),
              type: msgType,
              replyToId: replyId,
              text: s.text || promptVal,
              minDelay: String(s.delay_before_min || 5.0),
              maxDelay: String(s.delay_before_max || 10.0),
              reactions: s.reactions || '',
              reactionCount: s.reaction_count || 0,
              reactionSource: 'pool',
              fileName: '',
              noAttachmentIfForbidden: false,
              isAiDynamic: stepIsDyn,
              aiPrompt: promptVal
            };
          });
          setReplicas(generatedReplicas);
        }
        setScenarioMode('manual');
        showToast(
          isDynamic
            ? '🎉 Динамический ИИ-сценарий сгенерирован! Шаги содержат промпты для генерации текста на лету.'
            : '🎉 Сценарий сгенерирован ИИ! Режим переключен в Ручной для просмотра и сохранения.',
          'success'
        );
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Ошибка генерации сценария ИИ', 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleSaveAISettings = async () => {
    setIsSavingAISettings(true);
    try {
      await axios.post('/api/settings/ai', {
        ai_provider: aiConfigProvider,
        ai_api_key: aiConfigApiKey,
        ai_default_model: aiConfigDefaultModel,
        ai_system_prompt: aiConfigSystemPrompt,
        ai_base_url: aiConfigBaseUrl
      });
      await refetchAISettings();
      showToast('Настройки ИИ успешно сохранены!', 'success');
      setShowAISettingsModal(false);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Ошибка сохранения настроек ИИ', 'error');
    } finally {
      setIsSavingAISettings(false);
    }
  };

  const [aiTestResult, setAiTestResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleTestAIConnection = async () => {
    setIsTestingAI(true);
    setAiTestResult(null);
    try {
      const res = await axios.post('/api/settings/ai/test', {
        ai_provider: aiConfigProvider,
        ai_api_key: aiConfigApiKey,
        ai_default_model: aiConfigDefaultModel,
        ai_system_prompt: aiConfigSystemPrompt,
        ai_base_url: aiConfigBaseUrl
      });
      setAiTestResult({
        type: 'success',
        message: `Соединение успешно! Ответ нейросети: "${res.data.response}"`
      });
      showToast(`Проверка успешна! Ответ ИИ: ${res.data.response}`, 'success');
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || 'Ошибка проверки подключения к ИИ';
      setAiTestResult({
        type: 'error',
        message: errMsg
      });
      showToast(errMsg, 'error');
    } finally {
      setIsTestingAI(false);
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    setIsSavingPreset(true);
    try {
      await axios.post('/api/settings/ai/presets', {
        name: presetName.trim(),
        api_key: aiConfigApiKey,
        model: aiConfigDefaultModel,
        base_url: aiConfigBaseUrl,
        system_prompt: aiConfigSystemPrompt
      });
      await refetchPresets();
      setPresetName('');
      setShowSavePreset(false);
      showToast(`Пресет "${presetName.trim()}" сохранён!`, 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Ошибка сохранения пресета', 'error');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleLoadPreset = async (presetId: number) => {
    try {
      const res = await axios.get(`/api/settings/ai/presets/${presetId}`);
      const p = res.data;
      if (p.api_key) setAiConfigApiKey(p.api_key);
      if (p.model) setAiConfigDefaultModel(p.model);
      setAiConfigBaseUrl(p.base_url || '');
      if (p.system_prompt) setAiConfigSystemPrompt(p.system_prompt);
      setAiTestResult(null);
      showToast(`Пресет "${p.name}" загружен!`, 'success');
    } catch (err: any) {
      showToast('Ошибка загрузки пресета', 'error');
    }
  };

  const handleDeletePreset = async (presetId: number) => {
    try {
      await axios.delete(`/api/settings/ai/presets/${presetId}`);
      await refetchPresets();
      showToast('Пресет удалён', 'success');
    } catch (err: any) {
      showToast('Ошибка удаления пресета', 'error');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const updated = [...replicas];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, movedItem);
    setReplicas(updated);
    setDraggedIndex(null);
  };

  // File input refs map
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const getRoleColor = (roleId: string) => {
    const colors = [
      '#3b82f6', // blue-500
      '#10b981', // emerald-500
      '#8b5cf6', // violet-500
      '#ec4899', // pink-500
      '#f59e0b', // amber-500
      '#ef4444', // red-500
      '#14b8a6', // teal-500
      '#f97316', // orange-500
      '#06b6d4', // cyan-500
      '#6366f1', // indigo-500
    ];
    const num = parseInt(roleId) || 0;
    if (isNaN(num)) {
      let hash = 0;
      for (let i = 0; i < roleId.length; i++) {
        hash = roleId.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    }
    return colors[num % colors.length];
  };

  const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  // Add replica action
  const handleAddReplica = () => {
    const newId = generateUniqueId();
    const defaultRole = commentingAccounts.length > 0 ? String(commentingAccounts[0].id) : '';
    const newReplica: Replica = {
      id: newId,
      role: defaultRole,
      type: 'normal',
      replyToId: '',
      text: '',
      minDelay: '5',
      maxDelay: '10',
      reactions: '🔥',
      reactionCount: 1,
      reactionSource: 'pool',
      reactionRoles: '',
      fileName: '',
      noAttachmentIfForbidden: false,
    };
    setReplicas([...replicas, newReplica]);
  };

  // Delete replica action
  const handleDeleteReplica = (id: string) => {
    const filtered = replicas.filter(r => r.id !== id);
    const adjusted = filtered.map(r => {
      if (r.type === 'reply' && !filtered.some(f => f.id === r.replyToId)) {
        return { ...r, type: 'normal' as const, replyToId: '' };
      }
      return r;
    });
    setReplicas(adjusted);
  };



  // Update specific replica field
  const handleUpdateReplica = (id: string, field: keyof Replica, value: any) => {
    setReplicas(
      replicas.map(r => {
        if (r.id === id) {
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  // Triple column page layout styles
  const pageContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '24px',
    alignItems: 'stretch',
    minHeight: '80vh',
  };

  const scenariosSidebarStyle: React.CSSProperties = {
    width: '230px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    flexShrink: 0,
  };

  const stepsColumnStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const rightColumnStyle: React.CSSProperties = {
    width: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    position: 'sticky',
    top: '28px',
    maxHeight: 'calc(100vh - 80px)',
    overflowY: 'auto',
    flexShrink: 0,
  };

  const stepCardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
    transition: 'all 0.25s ease',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '13px',
    color: 'var(--text-main)',
    outline: 'none',
    transition: 'all 0.15s ease',
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: 'vertical',
    fontFamily: 'inherit',
    lineHeight: '1.5',
    height: '100%',
    minHeight: '110px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    fontWeight: 600,
  };

  const btnSecondary: React.CSSProperties = {
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-muted)',
    padding: '8px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const CustomCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '6px',
          border: checked ? 'none' : '1px solid var(--border-color)',
          backgroundColor: checked ? 'var(--accent)' : 'var(--bg-main)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M3 8L6 11L11 3.5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" stroke="white" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</span>
    </label>
  );

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Custom Confirmation Modal */}
      {confirmDeleteScenarioId !== null && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '380px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                Подтверждение удаления
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                Вы действительно хотите удалить этот сценарий и все его шаги? Это действие необратимо и сотрет все привязанные реплики.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  deleteScenarioMutation.mutate(confirmDeleteScenarioId);
                  setConfirmDeleteScenarioId(null);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s',
                }}
              >
                Удалить
              </button>
              <button
                onClick={() => setConfirmDeleteScenarioId(null)}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute Scenario Modal */}
      {executingScenarioId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '480px',
            width: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Play className="w-5 h-5 text-emerald-500 fill-current" />
                Запуск сценария в Telegram
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                Укажите username группы/канала или вставьте прямую ссылку на пост в канале, под которым нужно устроить обсуждение.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Канал / Чат / Ссылка на пост</label>
                <input
                  type="text"
                  placeholder="Например: @mychannel или https://t.me/mychannel/45"
                  value={execTarget}
                  onChange={e => setExecTarget(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>ID поста (необязательно)</label>
                <input
                  type="text"
                  placeholder="Заполнится автоматически, если вставить ссылку"
                  value={execPostId}
                  onChange={e => setExecPostId(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => executeScenarioMutation.mutate()}
                disabled={!execTarget.trim() || executeScenarioMutation.isPending}
                style={{
                  flex: 1,
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: (!execTarget.trim() || executeScenarioMutation.isPending) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Play className="w-4 h-4 fill-current" />
                {executeScenarioMutation.isPending ? 'Запуск...' : 'Старт сценария'}
              </button>
              <button
                onClick={() => {
                  setExecutingScenarioId(null);
                  setExecTarget('');
                  setExecPostId('');
                }}
                style={{
                  backgroundColor: 'var(--bg-main)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global AI Settings Modal */}
      {showAISettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '480px',
            width: '92%',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                Настройки ИИ
              </h3>
              <button
                type="button"
                onClick={() => { setShowAISettingsModal(false); setAiTestResult(null); setShowSavePreset(false); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Saved Presets */}
            {(aiPresets as any[]).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ ...labelStyle, marginBottom: '2px' }}>Сохранённые пресеты</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(aiPresets as any[]).map((p: any) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
                      <button
                        type="button"
                        onClick={() => handleLoadPreset(p.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px 0 0 8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: '1px solid var(--border-color)',
                          borderRight: 'none',
                          backgroundColor: 'var(--bg-main)',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(p.id)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '0 8px 8px 0',
                          fontSize: '11px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-main)',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connection Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>API Key</label>
                <input
                  type="password"
                  placeholder="Вставьте ваш API ключ (sk-..., nvapi-..., gsk-...)"
                  value={aiConfigApiKey}
                  onChange={e => setAiConfigApiKey(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Модель</label>
                <input
                  type="text"
                  placeholder="Например: gpt-4o-mini, deepseek-chat, deepseek-ai/deepseek-r1"
                  value={aiConfigDefaultModel}
                  onChange={e => setAiConfigDefaultModel(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Base URL (необязательно — для NVIDIA, Ollama, Proxy)</label>
                <input
                  type="text"
                  placeholder="https://integrate.api.nvidia.com/v1 или http://localhost:11434/v1"
                  value={aiConfigBaseUrl}
                  onChange={e => setAiConfigBaseUrl(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
                />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Оставьте пустым для OpenAI / DeepSeek / Gemini. Укажите для NVIDIA NIM, Ollama, vLLM, OpenRouter.
                </span>
              </div>

              {/* Collapsible system prompt */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  style={{
                    ...labelStyle,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {showSystemPrompt ? '▾' : '▸'} Системная инструкция
                </button>
                {showSystemPrompt && (
                  <textarea
                    rows={5}
                    placeholder="Инструкции персонажа нейросети..."
                    value={aiConfigSystemPrompt}
                    onChange={e => setAiConfigSystemPrompt(e.target.value)}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.4', marginTop: '6px' }}
                  />
                )}
              </div>
            </div>

            {/* Inline Test Result */}
            {aiTestResult && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '10px',
                fontSize: '12px',
                lineHeight: '1.4',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                backgroundColor: aiTestResult.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: aiTestResult.type === 'success' ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                color: aiTestResult.type === 'success' ? '#4ade80' : '#f87171',
                wordBreak: 'break-word'
              }}>
                {aiTestResult.type === 'success' ? <CheckCircle2 className="w-4 h-4" style={{ flexShrink: 0, marginTop: '1px' }} /> : <AlertTriangle className="w-4 h-4" style={{ flexShrink: 0, marginTop: '1px' }} />}
                <span>{aiTestResult.message}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleSaveAISettings}
                disabled={isSavingAISettings}
                style={{
                  flex: 1,
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  opacity: isSavingAISettings ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Save className="w-4 h-4" />
                {isSavingAISettings ? 'Сохранение...' : 'Применить'}
              </button>

              <button
                type="button"
                onClick={handleTestAIConnection}
                disabled={isTestingAI}
                style={{
                  ...btnSecondary,
                  opacity: isTestingAI ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Zap className="w-4 h-4" />
                {isTestingAI ? '...' : 'Тест'}
              </button>

              <button
                type="button"
                onClick={() => setShowSavePreset(!showSavePreset)}
                style={{
                  ...btnSecondary,
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                <Download className="w-4 h-4" />
                Пресет
              </button>
            </div>

            {/* Save Preset Inline Form */}
            {showSavePreset && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Название пресета (напр. API DeepSeek)"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                  style={{ ...inputStyle, flex: 1, fontSize: '12px' }}
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={isSavingPreset || !presetName.trim()}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: isSavingPreset || !presetName.trim() ? 0.5 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSavingPreset ? '...' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles className="w-6 h-6 text-accent" />
            Конструктор диалогов
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Управление сценариями и автоматизация цепочек ответов с прокси-аккаунтов.
          </p>
        </div>

        <button
          onClick={() => setShowAISettingsModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            transition: 'all 0.15s ease'
          }}
        >
          <Bot className="w-4 h-4 text-accent" />
          <span>Настройки ИИ</span>
        </button>
      </div>

      <div style={pageContainerStyle}>
        <div style={scenariosSidebarStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Сценарии</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="file"
                accept=".json"
                ref={jsonInputRef}
                style={{ display: 'none' }}
                onChange={handleImportJSON}
              />
              <button
                onClick={() => jsonInputRef.current?.click()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                title="Импортировать сценарий из JSON"
              >
                <Upload className="w-4 h-4 hover:text-accent" />
              </button>
              <button
                onClick={() => setShowAddScenario(!showAddScenario)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-text)' }}
                title="Создать сценарий"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Add Scenario inline widget */}
          {showAddScenario && (
            <div style={{
              padding: '10px',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <input
                type="text"
                placeholder="Имя сценария..."
                value={newScenarioTitle}
                onChange={e => setNewScenarioTitle(e.target.value)}
                style={{ ...inputStyle, padding: '6px 10px', fontSize: '12px' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => newScenarioTitle.trim() && createScenarioMutation.mutate(newScenarioTitle)}
                  style={{
                    backgroundColor: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '4px 8px', fontSize: '11px', flex: 1, cursor: 'pointer'
                  }}
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowAddScenario(false)}
                  style={{
                    backgroundColor: 'transparent', border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer'
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Scenario list items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
            {scenarios.map((s: any) => {
              const isSelected = s.id === activeScenarioId;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveScenarioId(s.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                    border: isSelected ? '1px solid var(--border-color)' : '1px solid transparent',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: s.is_active ? '#22c55e' : '#737373',
                      flexShrink: 0
                    }} />
                    <span style={{
                      fontSize: '13px',
                      fontWeight: isSelected ? 600 : 500,
                      color: isSelected ? 'var(--accent-text)' : 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {s.title}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportJSON(s.id);
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: isSelected ? 'block' : 'none'
                      }}
                      title="Экспорт в JSON"
                    >
                      <Download className="w-3.5 h-3.5 hover:text-accent" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteScenarioId(s.id);
                      }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', display: isSelected ? 'block' : 'none'
                      }}
                      title="Удалить сценарий"
                    >
                      <Trash2 className="w-3.5 h-3.5 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })}
            {scenarios.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0' }}>
                Нет сценариев
              </div>
            )}
          </div>
        </div>

        {/* COLUMN 2: Message steps editor */}
        <div style={stepsColumnStyle}>
          {activeScenarioId ? (
            <>
              {/* Scenario Type / AI Mode Selector */}
              <div style={{
                backgroundColor: 'var(--bg-card)',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>Режим:</span>
                  {[
                    { id: 'manual', label: '📝 Статический', desc: 'Ручной конструктор шагов сценария' },
                    { id: 'ai_generated', label: '🚀 Сгенерировать ИИ', desc: 'Разовая генерация готовых текстовых сообщений' },
                    { id: 'ai_dynamic', label: '✨ Динамический ИИ', desc: 'Генерация шагов с динамическими ИИ-промптами вместо текста' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setScenarioMode(m.id as any)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: scenarioMode === m.id ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                        backgroundColor: scenarioMode === m.id ? 'var(--accent-soft)' : 'var(--bg-main)',
                        color: scenarioMode === m.id ? 'var(--accent-text)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      title={m.desc}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleAddReplica}
                    style={{
                      backgroundColor: 'var(--bg-main)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Plus className="w-4 h-4 text-accent" /> Добавить шаг
                  </button>
                  <button
                    onClick={() => saveStepsBulkMutation.mutate()}
                    disabled={saveStepsBulkMutation.isPending}
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      borderRadius: '8px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      border: 'none',
                      opacity: saveStepsBulkMutation.isPending ? 0.5 : 1
                    }}
                  >
                    <Save className="w-4 h-4" /> Сохранить шаги
                  </button>
                </div>
              </div>

              {/* Option 2: Full-screen AI Dynamic Studio (Dynamic Prompts instead of static SMS) */}
              {scenarioMode === 'ai_dynamic' ? (
                <div style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  borderRadius: '20px',
                  padding: '24px',
                  marginBottom: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      backgroundColor: 'rgba(139, 92, 246, 0.15)',
                      padding: '10px',
                      borderRadius: '12px',
                      color: '#a78bfa'
                    }}>
                      <Zap className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                          Мастер Динамических ИИ-Сценариев (Промпты вместо СМС)
                        </h3>
                        <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', fontWeight: 700 }}>
                          УНИКАЛЬНЫЙ ТЕКСТ НА ЛЕТУ
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Вместо фиксированных текстов боты получают гибкие промпты. При каждом запуске под любым постом в Telegram боты сами формулируют уникальные сообщения от первого лица в реальном времени.
                      </p>
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: 'rgba(139, 92, 246, 0.08)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#c4b5fd',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Zap className="w-4 h-4 text-accent" style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Логика тайминга:</strong> Задержка таймера срабатывает <strong>ПОСЛЕ</strong> ответа нейросети и отправки сообщения в Telegram, выдерживая паузу перед запуском следующего бота в очереди.
                    </span>
                  </div>
                  
                  <div>
                    <label style={labelStyle}>Тема или канва диалога для динамических промптов</label>
                    <textarea
                      rows={5}
                      placeholder="Например: Обсуждение софта для автоматизации Telegram. 1-й участник задает вопрос о надежных скриптах, 2-й советует канал @ivanchik_byte без слащавой рекламы, 3-й подтверждает опыт настройки..."
                      value={aiGenPrompt}
                      onChange={e => setAiGenPrompt(e.target.value)}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '13px', lineHeight: '1.5' }}
                    />
                  </div>

                  {/* Quick prompt suggestion chips for Dynamic Studio */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ ...labelStyle, fontSize: '10px', marginBottom: 0 }}>ШАБЛОНЫ ДИНАМИЧЕСКИХ ПРОМПТОВ (ПОШАГОВАЯ ДРАМАТУРГИЯ):</label>
                      <button
                        type="button"
                        onClick={() => {
                          setAddTemplateTarget('dynamic');
                          setShowAddTemplateModal(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#a78bfa',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        + Добавить динамический шаблон
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {dynamicTemplates.map((t: any) => (
                        <div
                          key={t.id}
                          onClick={() => setAiGenPrompt(t.prompt)}
                          style={{
                            backgroundColor: 'var(--bg-main)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title={t.prompt}
                        >
                          <span>{t.title}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteDynamicTemplate(t.id, e)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '0 2px',
                              fontSize: '12px',
                              fontWeight: 800,
                              lineHeight: 1
                            }}
                            title="Удалить этот шаблон"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>УЧАСТНИКОВ (БОТОВ):</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-main)', padding: '2px 6px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <button
                            type="button"
                            onClick={() => setAiGenAccountsCount(Math.max(1, aiGenAccountsCount - 1))}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >-</button>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={aiGenAccountsCount}
                            onChange={e => setAiGenAccountsCount(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{
                              width: '45px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--accent-text)',
                              fontWeight: 800,
                              fontSize: '13px',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setAiGenAccountsCount(aiGenAccountsCount + 1)}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >+</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>ПРОМПТОВ (ШАГОВ):</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-main)', padding: '2px 6px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <button
                            type="button"
                            onClick={() => setAiGenStepsCount(Math.max(2, aiGenStepsCount - 1))}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >-</button>
                          <input
                            type="number"
                            min={2}
                            max={30}
                            value={aiGenStepsCount}
                            onChange={e => setAiGenStepsCount(Math.max(2, parseInt(e.target.value) || 2))}
                            style={{
                              width: '45px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--accent-text)',
                              fontWeight: 800,
                              fontSize: '13px',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setAiGenStepsCount(aiGenStepsCount + 1)}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >+</button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setAiGenReactionsEnabled(!aiGenReactionsEnabled)}
                        title="ИИ изредка ставит максимум 1 реакцию на весь диалог на самое ключевое сообщение"
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: aiGenReactionsEnabled ? '1px solid #22c55e' : '1px solid var(--border-color)',
                          backgroundColor: aiGenReactionsEnabled ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-main)',
                          color: aiGenReactionsEnabled ? '#4ade80' : 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {aiGenReactionsEnabled ? '👍 Реакции (Умный выбор)' : '🚫 Реакции ВЫКЛ'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleGenerateScenarioAI(true)}
                      disabled={isGeneratingAI || !aiGenPrompt.trim()}
                      style={{
                        backgroundColor: '#8b5cf6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity: (isGeneratingAI || !aiGenPrompt.trim()) ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                      }}
                    >
                      <Zap className="w-4 h-4" />
                      {isGeneratingAI ? 'Генерация промптов...' : '✨ Сгенерировать Динамические Промпты'}
                    </button>
                  </div>
                </div>
              ) : scenarioMode === 'ai_generated' ? (
                <div style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--accent)',
                  borderRadius: '20px',
                  padding: '24px',
                  marginBottom: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      backgroundColor: 'var(--accent-soft)',
                      padding: '10px',
                      borderRadius: '12px',
                      color: 'var(--accent)'
                    }}>
                      <Wand2 className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                        Мастер Статической ИИ-Генерации Сценариев
                      </h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Задайте тему — нейросеть выстроит последовательность готовых текстовых сообщений, свяжет ответы ботов и расставит эмодзи-реакции.
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <label style={labelStyle}>Тема или готовое описание диалога</label>
                    <textarea
                      rows={5}
                      placeholder="Например: Нативный диалог 3 участников в Telegram. Первый задает вопрос по теме поста, второй органично рекомендует Telegram-канал @..., третий подтверждает пользу ресурса..."
                      value={aiGenPrompt}
                      onChange={e => setAiGenPrompt(e.target.value)}
                      style={{ ...inputStyle, resize: 'vertical', fontSize: '13px', lineHeight: '1.5' }}
                    />
                  </div>

                  {/* Quick prompt suggestion chips for Static Studio */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ ...labelStyle, fontSize: '10px', marginBottom: 0 }}>ШАБЛОНЫ СТАТИЧЕСКИХ ДИАЛОГОВ:</label>
                      <button
                        type="button"
                        onClick={() => {
                          setAddTemplateTarget('static');
                          setShowAddTemplateModal(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        + Добавить статический шаблон
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {staticTemplates.map((t: any) => (
                        <div
                          key={t.id}
                          onClick={() => setAiGenPrompt(t.prompt)}
                          style={{
                            backgroundColor: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title={t.prompt}
                        >
                          <span>{t.title}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteStaticTemplate(t.id, e)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              padding: '0 2px',
                              fontSize: '12px',
                              fontWeight: 800,
                              lineHeight: 1
                            }}
                            title="Удалить этот шаблон"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>УЧАСТНИКОВ (БОТОВ):</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-main)', padding: '2px 6px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <button
                            type="button"
                            onClick={() => setAiGenAccountsCount(Math.max(1, aiGenAccountsCount - 1))}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >-</button>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={aiGenAccountsCount}
                            onChange={e => setAiGenAccountsCount(Math.max(1, parseInt(e.target.value) || 1))}
                            style={{
                              width: '45px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--accent-text)',
                              fontWeight: 800,
                              fontSize: '13px',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setAiGenAccountsCount(aiGenAccountsCount + 1)}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >+</button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>СООБЩЕНИЙ:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-main)', padding: '2px 6px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <button
                            type="button"
                            onClick={() => setAiGenStepsCount(Math.max(2, aiGenStepsCount - 1))}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >-</button>
                          <input
                            type="number"
                            min={2}
                            max={30}
                            value={aiGenStepsCount}
                            onChange={e => setAiGenStepsCount(Math.max(2, parseInt(e.target.value) || 2))}
                            style={{
                              width: '45px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: 'var(--accent-text)',
                              fontWeight: 800,
                              fontSize: '13px',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setAiGenStepsCount(aiGenStepsCount + 1)}
                            style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', padding: '0 4px' }}
                          >+</button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setAiGenReactionsEnabled(!aiGenReactionsEnabled)}
                        title="ИИ изредка ставит максимум 1 реакцию на весь диалог на самое ключевое сообщение"
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: aiGenReactionsEnabled ? '1px solid #22c55e' : '1px solid var(--border-color)',
                          backgroundColor: aiGenReactionsEnabled ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-main)',
                          color: aiGenReactionsEnabled ? '#4ade80' : 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {aiGenReactionsEnabled ? '👍 Реакции (Умный выбор)' : '🚫 Реакции ВЫКЛ'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleGenerateScenarioAI(false)}
                      disabled={isGeneratingAI || !aiGenPrompt.trim()}
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 20px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity: (isGeneratingAI || !aiGenPrompt.trim()) ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                      }}
                    >
                      <Sparkles className="w-4 h-4" />
                      {isGeneratingAI ? 'Генерация...' : '🚀 Сгенерировать готовый сценарий'}
                    </button>
                  </div>
                </div>
              ) : (
                <>

              {replicas.length === 0 ? (
                <div style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '16px',
                  padding: '60px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}>
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p style={{ fontSize: '14px', fontWeight: 500 }}>Список диалоговых шагов пуст</p>
                  <button
                    onClick={handleAddReplica}
                    style={{
                      marginTop: '16px',
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '10px 20px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Создать первый шаг
                  </button>
                </div>
              ) : (
                replicas.map((replica, index) => {
                  const precedingReplicas = replicas.slice(0, index);
                  const selectedRole = replica.role || (commentingAccounts.length > 0 ? String(commentingAccounts[0].id) : '');

                  return (
                    <div
                      key={replica.id}
                      onDragOver={(e) => handleDragOver(e)}
                      onDrop={() => handleDrop(index)}
                      onDragEnd={() => setDraggedIndex(null)}
                      style={{
                        ...stepCardStyle,
                        borderLeft: `4px solid ${getRoleColor(selectedRole)}`,
                        opacity: draggedIndex === index ? 0.4 : 1,
                        transition: 'opacity 0.15s ease'
                      }}
                    >
                      {/* Step Header */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '18px',
                        paddingBottom: '12px',
                        borderBottom: '1px solid var(--border-color)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragEnd={() => setDraggedIndex(null)}
                            style={{ color: 'var(--text-muted)', cursor: 'grab', display: 'flex', alignItems: 'center', padding: '4px' }}
                            title="Перетащите для изменения порядка"
                          >
                            <GripVertical className="w-4 h-4" />
                          </span>
                          <span style={{
                            backgroundColor: getRoleColor(selectedRole),
                            color: '#fff',
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            fontWeight: 700,
                          }}>
                            {index + 1}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)' }}>
                            Диалоговое сообщение
                          </span>
                        </div>

                        {/* Step Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteReplica(replica.id)}
                            style={{
                              background: 'none',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              padding: '6px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              backgroundColor: 'rgba(239, 68, 68, 0.05)',
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '32px' }}>
                        {/* Left Column: Text & Attachments */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={labelStyle}>Содержимое сообщения</label>
                            <button
                              type="button"
                              onClick={() => handleUpdateReplica(replica.id, 'isAiDynamic', !replica.isAiDynamic)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                border: replica.isAiDynamic ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                                backgroundColor: replica.isAiDynamic ? 'var(--accent-soft)' : 'var(--bg-main)',
                                color: replica.isAiDynamic ? 'var(--accent-text)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Zap className="w-3 h-3" />
                              {replica.isAiDynamic ? 'Динамический ИИ' : 'Статический текст'}
                            </button>
                          </div>

                          {replica.isAiDynamic ? (
                            <div>
                              <label style={{ ...labelStyle, color: 'var(--accent-text)' }}>
                                Инструкция (промпт) для ИИ на этом шаге:
                              </label>
                              <textarea
                                value={replica.aiPrompt || replica.text}
                                onChange={e => {
                                  handleUpdateReplica(replica.id, 'aiPrompt', e.target.value);
                                  handleUpdateReplica(replica.id, 'text', e.target.value);
                                }}
                                placeholder="Пример: Ответь на предыдущее сообщение с восторгом, задай уточняющий вопрос..."
                                style={{ ...textareaStyle, borderColor: 'var(--accent)' }}
                              />
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                                ⚡ ИИ сгенерирует 100% уникальный текст реплики при выходе поста в Telegram.
                              </span>
                            </div>
                          ) : (
                            <textarea
                              value={replica.text}
                              onChange={e => handleUpdateReplica(replica.id, 'text', e.target.value)}
                              placeholder="Напишите реплику сообщения..."
                              style={textareaStyle}
                            />
                          )}

                          {/* Attachment upload */}
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            backgroundColor: 'var(--bg-main)',
                            padding: '12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={labelStyle}>Вложение (Медиа / Фото / Файл)</span>
                              <span style={{ fontSize: '11px', color: replica.fileName ? 'var(--accent-text)' : 'var(--text-muted)', fontWeight: replica.fileName ? 600 : 400 }}>
                                {replica.fileName || 'Файл не выбран.'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                ref={el => { fileInputRefs.current[replica.id] = el; }}
                                type="file"
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  handleUpdateReplica(replica.id, 'fileName', file ? file.name : '');
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[replica.id]?.click()}
                                style={btnSecondary}
                              >
                                <Paperclip className="w-3.5 h-3.5 inline mr-1" />
                                Обзор...
                              </button>
                              {replica.fileName && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateReplica(replica.id, 'fileName', '')}
                                  style={{
                                    ...btnSecondary,
                                    color: '#ef4444',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    backgroundColor: 'rgba(239, 68, 68, 0.05)'
                                  }}
                                >
                                  Удалить файл
                                </button>
                              )}
                              <CustomCheckbox
                                checked={replica.noAttachmentIfForbidden}
                                onChange={v => handleUpdateReplica(replica.id, 'noAttachmentIfForbidden', v)}
                                label="Пропустить при запрете"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Roles, Type & Delay */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div>
                            <label style={labelStyle}>Персонаж (ID роли)</label>
                            <select
                              value={selectedRole}
                              onChange={e => handleUpdateReplica(replica.id, 'role', e.target.value)}
                              style={inputStyle}
                            >
                              <optgroup label="🎲 Случайные боты (без повторов на время исполнения)">
                                {Array.from({ length: Math.max(5, commentingAccounts.length || 5) }).map((_, idx) => (
                                  <option key={idx + 1} value={String(idx + 1)}>
                                    🎲 Случайный бот {idx + 1} (Уникальный участник #{idx + 1})
                                  </option>
                                ))}
                              </optgroup>
                              {commentingAccounts.length > 0 && (
                                <optgroup label="👤 Конкретные аккаунты из пула">
                                  {commentingAccounts.map((a: any) => (
                                    <option key={a.id} value={String(a.id)}>
                                      {a.custom_name ? a.custom_name : (a.username ? `@${a.username}` : (a.first_name || `Аккаунт #${a.id}`))} ({a.phone})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </div>

                          <div>
                            <label style={labelStyle}>Формат отправки</label>
                            <select
                              value={replica.type}
                              onChange={e => {
                                const val = e.target.value as 'normal' | 'reply';
                                handleUpdateReplica(replica.id, 'type', val);
                                if (val === 'reply' && precedingReplicas.length > 0 && !replica.replyToId) {
                                  handleUpdateReplica(replica.id, 'replyToId', precedingReplicas[precedingReplicas.length - 1].id);
                                }
                              }}
                              style={inputStyle}
                            >
                              <option value="normal">Новое сообщение</option>
                              {precedingReplicas.length > 0 && (
                                <option value="reply">Ответ (Reply)</option>
                              )}
                            </select>
                          </div>

                          {replica.type === 'reply' && precedingReplicas.length > 0 && (
                            <div style={{
                              padding: '10px',
                              backgroundColor: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '10px',
                            }}>
                              <label style={labelStyle}>На какое сообщение ответить?</label>
                              <select
                                value={replica.replyToId}
                                onChange={e => handleUpdateReplica(replica.id, 'replyToId', e.target.value)}
                                style={inputStyle}
                              >
                                {precedingReplicas.map((pr, prIdx) => (
                                  <option key={pr.id} value={pr.id}>
                                    Шаг №{prIdx + 1} - {pr.text ? `"${pr.text.substring(0, 30)}..."` : 'Без текста'}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <label style={{ ...labelStyle, marginBottom: 0 }}>Пауза перед следующим шагом</label>
                              {replica.isAiDynamic && (
                                <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: 600 }}>
                                  ⚡ После ответа ИИ
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>от</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="по умолчанию"
                                  value={replica.minDelay}
                                  onChange={e => handleUpdateReplica(replica.id, 'minDelay', e.target.value)}
                                  style={inputStyle}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>сек</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>до</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="по умолчанию"
                                  value={replica.maxDelay}
                                  onChange={e => handleUpdateReplica(replica.id, 'maxDelay', e.target.value)}
                                  style={inputStyle}
                                />
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>сек</span>
                              </div>
                            </div>
                            {replica.isAiDynamic && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                💡 Задержка выдерживается ПОСЛЕ отправки этого сообщения и перед стартом следующего бота.
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                            <label style={labelStyle}>Режим реакций</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                              {[
                                { id: 'manual', label: '🖐️ Вручную' },
                                { id: 'ai_smart', label: '🧠 Умный ИИ' },
                                { id: 'pool', label: '🎯 Из пула' },
                              ].map(mode => (
                                <button
                                  key={mode.id}
                                  type="button"
                                  onClick={() => handleUpdateReplica(replica.id, 'reactionSource', mode.id)}
                                  style={{
                                    padding: '6px 4px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    border: (replica.reactionSource || 'pool') === mode.id ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                                    backgroundColor: (replica.reactionSource || 'pool') === mode.id ? 'var(--accent-soft)' : 'var(--bg-main)',
                                    color: (replica.reactionSource || 'pool') === mode.id ? 'var(--accent-text)' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    textAlign: 'center'
                                  }}
                                >
                                  {mode.label}
                                </button>
                              ))}
                            </div>

                            {replica.reactionSource === 'ai_smart' && (
                              <div style={{
                                fontSize: '11px',
                                color: '#4ade80',
                                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                                border: '1px solid rgba(34, 197, 94, 0.25)',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}>
                                <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>ИИ автоматически подберет 1-2 идеальных эмодзи под контекст в момент отправки.</span>
                              </div>
                            )}

                            {replica.reactionSource === 'manual' && (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <label style={{ ...labelStyle, marginBottom: 0 }}>Набор эмодзи</label>
                                  <button
                                    type="button"
                                    onClick={() => setActiveEmojiPickerId(activeEmojiPickerId === replica.id ? null : replica.id)}
                                    style={{
                                      background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                                      color: 'var(--accent-text)', padding: '2px 8px', fontSize: '11px', cursor: 'pointer',
                                      backgroundColor: activeEmojiPickerId === replica.id ? 'var(--accent-soft)' : 'transparent',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    {activeEmojiPickerId === replica.id ? 'Скрыть выбор' : 'Палитра ⚡'}
                                  </button>
                                </div>
                                {activeEmojiPickerId === replica.id && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', backgroundColor: 'var(--bg-main)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                    {['👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '🎉', '🤩', '🤡', '💩'].map(emoji => {
                                      const currentList = (replica.reactions || '').split(/\s+/).filter(Boolean);
                                      const isActive = currentList.includes(emoji);
                                      return (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() => {
                                            let newList;
                                            if (isActive) {
                                              newList = currentList.filter(e => e !== emoji);
                                            } else {
                                              newList = [...currentList, emoji];
                                            }
                                            handleUpdateReplica(replica.id, 'reactions', newList.join(' '));
                                          }}
                                          style={{
                                            fontSize: '14px',
                                            padding: '6px 10px',
                                            borderRadius: '8px',
                                            border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                                            backgroundColor: isActive ? 'var(--accent-soft)' : 'var(--bg-main)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                          }}
                                        >
                                          {emoji}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                                <input
                                  type="text"
                                  value={replica.reactions}
                                  onChange={e => handleUpdateReplica(replica.id, 'reactions', e.target.value)}
                                  placeholder="Или введите вручную через пробел..."
                                  style={inputStyle}
                                />
                              </>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                            <div>
                              <label style={labelStyle}>Кто реагирует</label>
                              <select
                                value={replica.reactionSource || 'pool'}
                                onChange={e => handleUpdateReplica(replica.id, 'reactionSource', e.target.value)}
                                style={inputStyle}
                              >
                                <option value="pool">Пул реакций (рандом)</option>
                                <option value="roles">Персонажи сценария</option>
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>
                                {replica.reactionSource === 'roles' ? 'Количество' : 'Лимит'}
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={replica.reactionCount}
                                onChange={e => handleUpdateReplica(replica.id, 'reactionCount', Number(e.target.value))}
                                style={inputStyle}
                              />
                            </div>
                          </div>

                          {replica.reactionSource === 'roles' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                              <label style={labelStyle}>Выберите персонажей для реакции</label>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {commentingAccounts.length === 0 ? (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    Нет аккаунтов в пуле комментирования
                                  </span>
                                ) : (
                                  commentingAccounts.map((acc: any) => {
                                    const roleId = String(acc.id);
                                    const name = acc.username ? `@${acc.username}` : (acc.first_name || `Аккаунт ${roleId}`);
                                    const currentRoles = (replica.reactionRoles || '').split(/\s+/).filter(Boolean);
                                    const isSelected = currentRoles.includes(roleId);
                                    
                                    return (
                                      <button
                                        key={roleId}
                                        type="button"
                                        onClick={() => {
                                          let newList;
                                          if (isSelected) {
                                            newList = currentRoles.filter(r => r !== roleId);
                                          } else {
                                            newList = [...currentRoles, roleId];
                                          }
                                          handleUpdateReplica(replica.id, 'reactionRoles', newList.join(' '));
                                          handleUpdateReplica(replica.id, 'reactionCount', newList.length);
                                        }}
                                        style={{
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          padding: '5px 8px',
                                          borderRadius: '6px',
                                          border: `1px solid ${isSelected ? getRoleColor(roleId) : 'var(--border-color)'}`,
                                          backgroundColor: isSelected ? 'rgba(255,255,255,0.03)' : 'var(--bg-main)',
                                          color: isSelected ? getRoleColor(roleId) : 'var(--text-muted)',
                                          cursor: 'pointer',
                                          transition: 'all 0.15s',
                                        }}
                                      >
                                        {name}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </>
      ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px dashed var(--border-color)',
              borderRadius: '16px',
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              marginTop: '40px'
            }}>
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p style={{ fontSize: '14px', fontWeight: 500 }}>Выберите сценарий слева или создайте новый</p>
            </div>
          )}
        </div>

        {/* COLUMN 3: Scenario config + Live Preview (Scrollable container to prevent overlay/clipping) */}
        {activeScenarioId && (
          <div style={rightColumnStyle}>
            {/* Config Widget */}
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '20px',
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 800,
                color: 'var(--text-main)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '10px'
              }}>
                <Settings className="w-4 h-4 text-accent" />
                Параметры запуска
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>Название сценария</label>
                  <input
                    type="text"
                    value={scenarioName}
                    onChange={e => setScenarioName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <CustomCheckbox checked={isActive} onChange={setIsActive} label="Авто-участие в ротации ролей" />
                </div>



                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={labelStyle}>Приоритет в ротации (Вес): {scenarioWeight}</label>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: scenarioWeight >= 8 ? 'rgba(239,68,68,0.15)' : scenarioWeight >= 4 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                      color: scenarioWeight >= 8 ? '#ef4444' : scenarioWeight >= 4 ? '#f59e0b' : '#10b981'
                    }}>
                      {scenarioWeight >= 8 ? 'Высокий' : scenarioWeight >= 4 ? 'Средний' : 'Низкий'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={scenarioWeight}
                    onChange={e => setScenarioWeight(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    <span>1 (редкий выбор)</span>
                    <span>10 (частый выбор)</span>
                  </div>
                </div>

                <div style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>Статус сценария</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Шагов диалога:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{replicas.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Аккаунтов в пуле:</span>
                    <span style={{ fontWeight: 700, color: commentingAccounts.length > 0 ? '#10b981' : '#ef4444' }}>
                      {commentingAccounts.length} активных
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => updateScenarioMutation.mutate()}
                  disabled={updateScenarioMutation.isPending}
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    opacity: updateScenarioMutation.isPending ? 0.5 : 1
                  }}
                >
                  {updateScenarioMutation.isPending ? 'Сохранение...' : 'Сохранить настройки'}
                </button>
              </div>
            </div>

            {/* Telegram Live Preview */}
            <div style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '20px',
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 800,
                color: 'var(--text-main)',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <Play className="w-4 h-4 text-emerald-500" />
                Симуляция чата
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
                Интерактивная визуализация порядка реплик в реальном времени.
              </p>

              <div style={{
                backgroundColor: 'var(--bg-main)',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                border: '1px solid var(--border-color)',
              }}>
                {replicas.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '20px 0' }}>
                    Нет сообщений
                  </div>
                ) : (
                   replicas.map((r, i) => {
                     const replyReplicaIndex = r.type === 'reply' ? replicas.findIndex(o => o.id === r.replyToId) : -1;
                     const replyText = replyReplicaIndex !== -1 ? replicas[replyReplicaIndex].text : '';

                     const finalRole = r.role || (commentingAccounts[0] ? String(commentingAccounts[0].id) : '');
                     const currentAccount = commentingAccounts.find((a: any) => String(a.id) === finalRole);
                     const displayName = currentAccount?.custom_name 
                       ? currentAccount.custom_name 
                       : (currentAccount?.username 
                         ? `@${currentAccount.username}` 
                         : (currentAccount?.first_name || `Персонаж ${r.role || '?'}`));

                     return (
                       <div key={r.id} style={{
                         backgroundColor: 'var(--bg-card)',
                         borderRadius: '8px',
                         padding: '8px 10px',
                         fontSize: '12px',
                         borderLeft: `3px solid ${getRoleColor(finalRole)}`,
                       }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                           <span style={{ fontWeight: 600, color: getRoleColor(finalRole) }}>
                             {displayName}
                           </span>
                           <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>#{i + 1}</span>
                         </div>

                         {r.type === 'reply' && replyText && (
                           <div style={{
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            borderLeft: '2px solid var(--text-muted)',
                            padding: '2px 6px',
                            marginBottom: '4px',
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            borderRadius: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            Ответ на #{replyReplicaIndex + 1}: {replyText}
                          </div>
                        )}

                        <div style={{ color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {r.text || <em style={{ color: 'var(--text-muted)' }}>Пустое сообщение</em>}
                        </div>

                        {r.reactions && (
                          <div style={{ display: 'flex', gap: '3px', marginTop: '6px', fontSize: '10px' }}>
                            <span style={{
                              backgroundColor: 'rgba(255,255,255,0.04)',
                              borderRadius: '4px',
                              padding: '1px 4px',
                              color: 'var(--text-muted)'
                            }}>
                              {r.reactions} {r.reactionCount > 0 ? `×${r.reactionCount}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Custom Template Modal */}
      {showAddTemplateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '520px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
                Добавить свой готовый шаблон
              </h3>
              <button
                type="button"
                onClick={() => setShowAddTemplateModal(false)}
                style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px', fontWeight: 800 }}
              >
                ✕
              </button>
            </div>

            <div>
              <label style={labelStyle}>Название шаблона (для кнопки)</label>
              <input
                type="text"
                placeholder="Например: 💎 Обсуждение новой реферальной программы"
                value={newTemplateTitle}
                onChange={e => setNewTemplateTitle(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Подробная инструкция промпта для ИИ</label>
              <textarea
                rows={5}
                placeholder="Опишите детальнее: ролевую модель участников, их аргументы, эмоции, темы вопросов и финал общения..."
                value={newTemplatePrompt}
                onChange={e => setNewTemplatePrompt(e.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowAddTemplateModal(false)}
                style={{
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleAddCustomTemplate}
                disabled={!newTemplateTitle.trim() || !newTemplatePrompt.trim()}
                style={{
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  opacity: (!newTemplateTitle.trim() || !newTemplatePrompt.trim()) ? 0.5 : 1
                }}
              >
                Сохранить шаблон
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
