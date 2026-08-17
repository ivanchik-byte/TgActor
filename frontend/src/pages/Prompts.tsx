import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Plus,
  Search,
  Copy,
  Check,
  Zap,
  BookOpen,
  Trash2,
  Edit3,
  RefreshCw,
  Dices,
  X,
  Flame,
  Shield,
  Coins,
  Cpu,
  TrendingUp,
  MessageSquare,
  Settings2,
  Tag,
  FolderPlus,
  Layers,
  HelpCircle,
  Swords,
  Rocket,
  Wrench,
  Users,
  SlidersHorizontal,
  Wand2
} from 'lucide-react';
import { useToast } from '../components/ToastContext';

interface CategoryItem {
  id: string;
  label: string;
  color: string;
  is_builtin: boolean;
}

interface StudioRoleInstruction {
  role_order: number;
  role_name: string;
  goal: string;
  instruction: string;
  sample_text: string;
}

interface StudioGenerateData {
  title: string;
  category: string;
  categories?: string[];
  mode: 'static' | 'dynamic';
  prompt_text: string;
  system_instruction?: string;
  roles: StudioRoleInstruction[];
  steps_payload: any[];
}

interface PromptTemplateItem {
  id: number;
  title: string;
  description: string | null;
  category: string;
  categories: string[];
  mode: 'static' | 'dynamic';
  prompt_text: string;
  system_instruction: string | null;
  roles_breakdown: string | null;
  steps_payload: string | null;
  tags: string | null;
  is_builtin: boolean;
  created_at: string | null;
}

const DEFAULT_CATEGORY_ICONS: Record<string, any> = {
  software: Cpu,
  crypto: Coins,
  warmup: TrendingUp,
  skepticism: Shield,
  services: Flame,
  general: MessageSquare
};

const DRAMA_PRESETS = [
  {
    id: 'skepticism_proof',
    title: 'Скепсис → Пруф → Рекомендация',
    desc: 'Озвучивание проблемы или сомнений → совет проверенного решения → подтверждение личным опытом',
    icon: Shield,
    color: '#a78bfa',
    badge: 'Воронка доверия'
  },
  {
    id: 'warmup_interest',
    title: 'Прогрев интереса & Кейс',
    desc: 'Интригующий вопрос о механике → обсуждение результатов и деталей → уточняющий вопрос',
    icon: TrendingUp,
    color: '#4ade80',
    badge: 'Прогрев'
  },
  {
    id: 'expert_qa',
    title: 'Вопрос эксперту (Q&A)',
    desc: 'Сложный практический вопрос по теме → экспертный емкий совет → подтверждение пользы',
    icon: HelpCircle,
    color: '#38bdf8',
    badge: 'Экспертиза'
  },
  {
    id: 'friendly_dispute',
    title: 'Живой спор мнений',
    desc: 'Две стороны аргументированно отстаивают разные подходы без негатива → третий подводит баланс',
    icon: Swords,
    color: '#f87171',
    badge: 'Вовлечение'
  },
  {
    id: 'native_mention',
    title: 'Нативная рекомендация',
    desc: 'Естественное обсуждение задачи и сухое, искреннее упоминание нужного инструмента или услуги',
    icon: Rocket,
    color: '#ec4899',
    badge: 'Интеграция'
  },
  {
    id: 'problem_solving',
    title: 'Разбор проблемы / Фикс',
    desc: 'Жалоба на трудность/ошибку → разбор причины → проверенный пошаговый совет',
    icon: Wrench,
    color: '#fbbf24',
    badge: 'Техподдержка'
  },
  {
    id: 'crypto_insight',
    title: 'Обсуждение рынка / Трейдинг',
    desc: 'Быстрый обмен мнениями по тарифам, комиссиям, переводам и инструментам',
    icon: Coins,
    color: '#2dd4bf',
    badge: 'Инсайды'
  },
  {
    id: 'none',
    title: 'Без шаблона (Свой сценарий)',
    desc: '«Отключить навязанный шаблон. Впишите сами детальные инструкции в поле выше — ИИ составит диалог строго по вашему описанию»',
    icon: SlidersHorizontal,
    color: '#94a3b8',
    badge: 'Свой формат'
  }
];

const TONE_PRESETS = [
  {
    id: 'telegram_slang',
    title: 'Разговорный Telegram',
    sample: 'хз, норм, по факту, рил, годнота, бро, без эмодзи',
    badge: 'Рекомендуется'
  },
  {
    id: 'tech_slang',
    title: 'Технический IT / Профи',
    sample: 'прокси, сессии, лимиты, парсинг, задержки, воркеры, API',
    badge: 'IT & Dev'
  },
  {
    id: 'concise_casual',
    title: 'Лаконичный бытовой',
    sample: 'коротко, 1-2 простых предложения, мобильный чат',
    badge: 'Быстрый'
  },
  {
    id: 'crypto_trader',
    title: 'Крипта & Трейдинг',
    sample: 'газ, комиссии, кошельки, переводы, холд, свап',
    badge: 'Web3'
  },
  {
    id: 'cautious_skeptic',
    title: 'Осторожный скептик',
    sample: 'проверка фактов, подозрительность, логика',
    badge: 'Скепсис'
  },
  {
    id: 'friendly_helper',
    title: 'Дружелюбный советчик',
    sample: 'помощь новичку без лести и занудства',
    badge: 'Помощь'
  },
  {
    id: 'neutral',
    title: 'Универсальный нейтральный',
    sample: 'простой живой язык, естественная речь без специфического сленга',
    badge: 'Базовый'
  }
];

const ROLES_PRESETS = [
  { count: 2, label: '2 бота', hint: 'Диалог тет-а-тет: Зачинщик + Эксперт' },
  { count: 3, label: '3 бота (Рекомендуется)', hint: 'Классический тред: Скептик + Советчик + Пруф' },
  { count: 4, label: '4 бота', hint: 'Активная ветка: Скептик + Эксперт + Сомневающийся + Пруф' },
  { count: 5, label: '5 ботов', hint: 'Массовое живое обсуждение темы' }
];

const SAMPLE_TOPICS = [
  'Отзыв о качестве услуги или продукта: реальные впечатления от покупки, сравнение с аналогами и искренняя рекомендация',
  'Вопрос в комментариях про выбор надежного крипто-кошелька для USDT и TON с минимальными комиссиями и быстрым выводом',
  'Обсуждение новости или тренда: один участник делится мнением, второй аргументированно спорит, третий подводит итог',
  'Поиск специалиста или проверенного сервиса (ремонт, дизайн, разработка, маркетинг): запрос рекомендации и живой совет',
  'Опыт использования нового гаджета или авто: плюсы, минусы, реальный расход/автономность и ответ на вопрос подписчика'
];

const COLOR_PALETTE = [
  '#38bdf8', // Sky
  '#a78bfa', // Violet
  '#4ade80', // Green
  '#fbbf24', // Amber
  '#f87171', // Red
  '#ec4899', // Pink
  '#2dd4bf', // Teal
  '#94a3b8'  // Gray
];

export default function Prompts() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMode, setSelectedMode] = useState<string>('all');

  // UI Modals state
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplateItem | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);

  // Category manager state
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatColor, setNewCatColor] = useState('#38bdf8');
  const [isAddingCat, setIsAddingCat] = useState(false);

  // Studio generator parameters
  const [studioTopic, setStudioTopic] = useState('');
  const [studioMode, setStudioMode] = useState<'dynamic' | 'static'>('dynamic');
  const [studioDrama, setStudioDrama] = useState<string>('skepticism_proof');
  const [studioTone, setStudioTone] = useState<string>('telegram_slang');
  const [studioRolesCount, setStudioRolesCount] = useState<number>(3);
  const [studioStepsCount, setStudioStepsCount] = useState<number>(4);
  const [studioResult, setStudioResult] = useState<StudioGenerateData | null>(null);
  const [studioActiveTab, setStudioActiveTab] = useState<'steps' | 'roles' | 'overview'>('steps');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [studioCopied, setStudioCopied] = useState(false);

  // Quick Launch from Template Modal state
  const [quickLaunchTemplate, setQuickLaunchTemplate] = useState<PromptTemplateItem | null>(null);
  const [quickLaunchStepsCount, setQuickLaunchStepsCount] = useState<number>(4);
  const [quickLaunchTitle, setQuickLaunchTitle] = useState<string>('');
  const [quickLaunchMode, setQuickLaunchMode] = useState<'dynamic' | 'static'>('dynamic');

  // Build steps with exact count and natural replies for any template
  const buildStepsForTemplate = (template: PromptTemplateItem, count: number, mode: 'dynamic' | 'static') => {
    let existingSteps: any[] = [];
    let roles: any[] = [];
    try {
      if (template.steps_payload) {
        existingSteps = JSON.parse(template.steps_payload);
      }
    } catch {}
    try {
      if (template.roles_breakdown) {
        roles = JSON.parse(template.roles_breakdown);
      }
    } catch {}

    if (roles.length === 0) {
      roles = [
        { role_order: 1, role_name: 'Зачинщик', goal: 'Начать тред', instruction: template.prompt_text, sample_text: 'Начало обсуждения' },
        { role_order: 2, role_name: 'Эксперт', goal: 'Дать совет', instruction: `${template.prompt_text} (совет)`, sample_text: 'Рекомендую проверенное решение' },
        { role_order: 3, role_name: 'Скептик', goal: 'Задать вопрос', instruction: `${template.prompt_text} (вопрос)`, sample_text: 'А как насчет рисков' }
      ];
    }

    const result: any[] = [];
    for (let i = 0; i < count; i++) {
      const roleIdx = i % roles.length;
      const roleObj = roles[roleIdx];
      const roleOrder = roleObj.role_order || (roleIdx + 1);
      const roleName = roleObj.role_name || `Бот #${roleOrder}`;

      if (i < existingSteps.length && existingSteps[i]) {
        const ex = existingSteps[i];
        result.push({
          step_order: i + 1,
          role_id: roleOrder,
          role_name: roleName,
          text: ex.text || ex.sample_text || roleObj.sample_text || `Шаг ${i + 1}`,
          sample_text: ex.sample_text || ex.text || roleObj.sample_text || `Шаг ${i + 1}`,
          ai_prompt: mode === 'dynamic' ? (ex.ai_prompt || roleObj.instruction || template.prompt_text) : null,
          is_ai_dynamic: mode === 'dynamic',
          reply_to_step: i > 0 ? (ex.reply_to_step || i) : null,
          delay_before_min: ex.delay_before_min || 4.0,
          delay_before_max: ex.delay_before_max || 9.0,
          reactions: i === count - 1 ? '👍' : null,
          reaction_count: i === count - 1 ? 1 : 0
        });
      } else {
        const replyTarget = i > 0 ? i : null;
        let promptInstr = '';
        let sampleText = '';
        if (i === 0) {
          promptInstr = `Ты — ${roleName} (Роль ${roleOrder}). Начни живое обсуждение под постом от первого лица по теме: "${template.title}". Задай открытый вопрос участникам, пиши на 'ты', 1-2 предложения, без эмодзи и без точки в конце.`;
          sampleText = roleObj.sample_text || 'Кто в курсе, как сейчас лучше решить этот вопрос';
        } else if (i === 1) {
          promptInstr = `Ты — ${roleName} (Роль ${roleOrder}). Ответь на сообщение из Шага #1. Посоветуй проверенное решение или поделись опытом. Пиши уверенно и просто на 'ты', без рекламы, без эмодзи и без точки в конце.`;
          sampleText = roleObj.sample_text || 'Тут главное не спешить и делать всё по проверенной схеме';
        } else if (i === 2) {
          promptInstr = `Ты — ${roleName} (Роль ${roleOrder}). Вклинись в тред (Шаг #2). Вырази легкое сомнение по затратам или сложности. Пиши лаконично на 'ты', без эмодзи и без точки в конце.`;
          sampleText = 'А по затратам как выходит, окупается вообще';
        } else if (i === count - 1) {
          promptInstr = `Ты — ${roleName} (Роль ${roleOrder}). Подведи позитивный итог дискуссии (Шаг #${i}), поблагодари за полезный совет. Пиши лаконично, без эмодзи и без точки в конце.`;
          sampleText = 'Понял, спасибо за наводку, попробую на днях';
        } else {
          promptInstr = `Ты — ${roleName} (Роль ${roleOrder}). Ответь на реплику из Шага #${i}. Добавь важный практический нюанс или лайфхак. Пиши живо на 'ты', без эмодзи и без точки в конце.`;
          sampleText = 'Да, там еще важно учитывать текущие комиссии';
        }

        result.push({
          step_order: i + 1,
          role_id: roleOrder,
          role_name: roleName,
          text: sampleText,
          sample_text: sampleText,
          ai_prompt: mode === 'dynamic' ? promptInstr : null,
          is_ai_dynamic: mode === 'dynamic',
          reply_to_step: replyTarget,
          delay_before_min: 4.0,
          delay_before_max: 9.0,
          reactions: i === count - 1 ? '👍' : null,
          reaction_count: i === count - 1 ? 1 : 0
        });
      }
    }
    return result;
  };

  const handleOpenQuickLaunch = (template: PromptTemplateItem) => {
    let stepsCount = 4;
    try {
      if (template.steps_payload) {
        const parsed = JSON.parse(template.steps_payload);
        if (Array.isArray(parsed) && parsed.length > 0) stepsCount = parsed.length;
      } else if (template.roles_breakdown) {
        const parsed = JSON.parse(template.roles_breakdown);
        if (Array.isArray(parsed) && parsed.length > 0) stepsCount = parsed.length;
      }
    } catch {}
    setQuickLaunchTemplate(template);
    setQuickLaunchTitle(template.title);
    setQuickLaunchStepsCount(stepsCount);
    setQuickLaunchMode(template.mode);
  };

  // Update studioResult fields
  const handleUpdateStudioField = (field: string, value: any) => {
    if (!studioResult) return;
    setStudioResult({ ...studioResult, [field]: value });
  };

  const handleUpdateStudioRole = (idx: number, field: string, value: any) => {
    if (!studioResult) return;
    const newRoles = [...studioResult.roles];
    newRoles[idx] = { ...newRoles[idx], [field]: value };
    setStudioResult({ ...studioResult, roles: newRoles });
  };

  const handleUpdateStudioStep = (idx: number, field: string, value: any) => {
    if (!studioResult) return;
    const newSteps = [...studioResult.steps_payload];
    newSteps[idx] = { ...newSteps[idx], [field]: value };
    setStudioResult({ ...studioResult, steps_payload: newSteps });
  };

  const handleDeleteStudioStep = (idx: number) => {
    if (!studioResult || studioResult.steps_payload.length <= 1) return;
    const newSteps = studioResult.steps_payload.filter((_, i) => i !== idx).map((s, i) => ({
      ...s,
      step_order: i + 1,
      reply_to_step: s.reply_to_step && s.reply_to_step > idx ? s.reply_to_step - 1 : (s.reply_to_step === idx + 1 ? (i > 0 ? i : null) : s.reply_to_step)
    }));
    setStudioResult({ ...studioResult, steps_payload: newSteps });
  };

  const handleAddStudioStep = () => {
    if (!studioResult) return;
    const count = studioResult.steps_payload.length;
    const roleId = ((count) % Math.max(1, studioResult.roles.length)) + 1;
    const roleObj = studioResult.roles.find(r => r.role_order === roleId) || studioResult.roles[0];
    const isDynamic = studioResult.mode === 'dynamic';
    const newStep = {
      step_order: count + 1,
      role_id: roleId,
      role_name: roleObj?.role_name || `Бот ${roleId}`,
      text: roleObj?.sample_text || `Шаг ${count + 1}`,
      sample_text: roleObj?.sample_text || `Шаг ${count + 1}`,
      ai_prompt: roleObj?.instruction ? `Ты — ${roleObj.role_name}. ${roleObj.instruction}. Ответь естественно на 'ты', без эмодзи и без точки в конце.` : `Инструкция для шага ${count + 1}`,
      is_ai_dynamic: isDynamic,
      reply_to_step: count > 0 ? count : null,
      delay_before_min: 4.0,
      delay_before_max: 9.0,
      reactions: null,
      reaction_count: 0
    };
    setStudioResult({ ...studioResult, steps_payload: [...studioResult.steps_payload, newStep] });
  };

  // Enhance / Detail prompt with AI
  const handleEnhancePrompt = async () => {
    setIsEnhancing(true);
    try {
      const res = await axios.post('/api/prompts/enhance-prompt', {
        text: studioTopic.trim() || undefined
      });
      if (res.data.status === 'ok') {
        setStudioTopic(res.data.enhanced_prompt);
        showToast('Промпт улучшен и детализирован с помощью ИИ', 'success');
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка улучшения промпта с ИИ', 'error');
    } finally {
      setIsEnhancing(false);
    }
  };

  // Manual Template Form state (Multi-Category support)
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategories, setFormCategories] = useState<string[]>(['software']);
  const [formMode, setFormMode] = useState<'dynamic' | 'static'>('dynamic');
  const [formPromptText, setFormPromptText] = useState('');
  const [formTags, setFormTags] = useState('');

  // 1. Fetch categories
  const { data: categories = [] } = useQuery<CategoryItem[]>({
    queryKey: ['promptCategories'],
    queryFn: async () => {
      const res = await axios.get('/api/prompts/categories');
      return res.data;
    }
  });

  // Fast category lookup map
  const categoryMap = useMemo(() => {
    const map: Record<string, CategoryItem> = {};
    for (const c of categories) {
      map[c.id] = c;
    }
    return map;
  }, [categories]);

  // 2. Fetch templates
  const { data: templates = [], isLoading } = useQuery<PromptTemplateItem[]>({
    queryKey: ['promptTemplates', selectedCategory, selectedMode, searchTerm],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (selectedMode !== 'all') params.mode = selectedMode;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const res = await axios.get('/api/prompts', { params });
      return res.data;
    }
  });

  // Statistics
  const stats = useMemo(() => {
    const total = templates.length;
    const dynamicCount = templates.filter((t) => t.mode === 'dynamic').length;
    const staticCount = templates.filter((t) => t.mode === 'static').length;
    const builtInCount = templates.filter((t) => t.is_builtin).length;
    return { total, dynamicCount, staticCount, builtInCount };
  }, [templates]);

  // Copy helper
  const handleCopyText = (text: string, id?: number) => {
    navigator.clipboard.writeText(text);
    if (id !== undefined) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setStudioCopied(true);
      setTimeout(() => setStudioCopied(false), 2000);
    }
    showToast('Промпт скопирован в буфер обмена', 'success');
  };

  // Add new Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatLabel.trim()) return;
    setIsAddingCat(true);
    try {
      await axios.post('/api/prompts/categories', {
        label: newCatLabel.trim(),
        color: newCatColor
      });
      showToast(`Категория "${newCatLabel.trim()}" создана`, 'success');
      setNewCatLabel('');
      queryClient.invalidateQueries({ queryKey: ['promptCategories'] });
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка создания категории', 'error');
    } finally {
      setIsAddingCat(false);
    }
  };

  // Delete Category
  const handleDeleteCategory = async (catId: string, label: string) => {
    if (!window.confirm(`Удалить категорию "${label}"?`)) return;
    try {
      await axios.delete(`/api/prompts/categories/${catId}`);
      showToast(`Категория "${label}" удалена`, 'success');
      if (selectedCategory === catId) setSelectedCategory('all');
      queryClient.invalidateQueries({ queryKey: ['promptCategories'] });
      queryClient.invalidateQueries({ queryKey: ['promptTemplates'] });
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка удаления категории', 'error');
    }
  };

  // Toggle category inside multi-select form
  const toggleFormCategory = (catId: string) => {
    setFormCategories((prev) => {
      if (prev.includes(catId)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((id) => id !== catId);
      } else {
        return [...prev, catId];
      }
    });
  };

  // AI Studio Generation trigger
  const handleGenerateStudio = async () => {
    if (!studioTopic.trim()) {
      showToast('Введите краткую тему или описание сцены', 'error');
      return;
    }
    setIsGenerating(true);
    try {
      const res = await axios.post('/api/prompts/generate-studio', {
        topic: studioTopic.trim(),
        mode: studioMode,
        drama_type: studioDrama,
        tone: studioTone,
        roles_count: studioRolesCount,
        steps_count: studioStepsCount
      });
      if (res.data.status === 'ok') {
        setStudioResult(res.data.data);
        showToast('Точечные инструкции успешно сформированы', 'success');
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка генерации в студии промптов', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save generated studio prompt to library
  const handleSaveStudioToLibrary = async () => {
    if (!studioResult) return;
    try {
      const dramaCatMap: Record<string, string[]> = {
        skepticism_proof: ['skepticism', 'software'],
        warmup_interest: ['warmup', 'software'],
        expert_qa: ['services', 'software'],
        friendly_dispute: ['skepticism', 'general']
      };
      const cats = dramaCatMap[studioDrama] || ['software'];

      await axios.post('/api/prompts', {
        title: studioResult.title,
        description: `Сгенерировано в AI Студии (${studioDrama === 'skepticism_proof' ? 'Скепсис -> Пруф' : studioDrama})`,
        categories: cats,
        mode: studioResult.mode,
        prompt_text: studioResult.prompt_text,
        system_instruction: studioResult.system_instruction || null,
        roles_breakdown: JSON.stringify(studioResult.roles),
        steps_payload: JSON.stringify(studioResult.steps_payload),
        tags: 'ai_studio,точечные_инструкции'
      });
      showToast('Промпт с цепочкой сообщений сохранен в библиотеку', 'success');
      queryClient.invalidateQueries({ queryKey: ['promptTemplates'] });
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка сохранения шаблона', 'error');
    }
  };

  // 1-Click Create Scenario from Studio Result or Template
  const handleCreateScenario = async (payload: { title: string; mode: string; prompt_text: string; steps: any[] }) => {
    try {
      const res = await axios.post('/api/prompts/create-scenario', {
        title: payload.title,
        mode: payload.mode,
        prompt_text: payload.prompt_text,
        min_delay: 5.0,
        max_delay: 12.0,
        weight: 1,
        steps: payload.steps
      });
      if (res.data.status === 'ok') {
        showToast(`Сценарий "${res.data.title}" создан в 1 клик!`, 'success');
        navigate(`/scenarios`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка создания сценария', 'error');
    }
  };

  // Delete custom template
  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('Удалить этот шаблон из библиотеки?')) return;
    try {
      await axios.delete(`/api/prompts/${id}`);
      showToast('Шаблон удален', 'success');
      queryClient.invalidateQueries({ queryKey: ['promptTemplates'] });
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка удаления', 'error');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (template: PromptTemplateItem) => {
    setEditingTemplate(template);
    setFormTitle(template.title);
    setFormDescription(template.description || '');
    setFormCategories(template.categories && template.categories.length > 0 ? template.categories : ['software']);
    setFormMode(template.mode);
    setFormPromptText(template.prompt_text);
    setFormTags(template.tags || '');
    setIsManualModalOpen(true);
  };

  // Save manual/edited template
  const handleSaveManualForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formPromptText.trim()) {
      showToast('Заполните название и текст промпта', 'error');
      return;
    }

    try {
      if (editingTemplate) {
        await axios.put(`/api/prompts/${editingTemplate.id}`, {
          title: formTitle,
          description: formDescription,
          categories: formCategories,
          mode: formMode,
          prompt_text: formPromptText,
          tags: formTags
        });
        showToast('Шаблон обновлен', 'success');
      } else {
        await axios.post('/api/prompts', {
          title: formTitle,
          description: formDescription,
          categories: formCategories,
          mode: formMode,
          prompt_text: formPromptText,
          tags: formTags
        });
        showToast('Шаблон добавлен в библиотеку', 'success');
      }
      setIsManualModalOpen(false);
      setEditingTemplate(null);
      queryClient.invalidateQueries({ queryKey: ['promptTemplates'] });
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Ошибка сохранения', 'error');
    }
  };

  const handleRandomTopic = () => {
    const random = SAMPLE_TOPICS[Math.floor(Math.random() * SAMPLE_TOPICS.length)];
    setStudioTopic(random);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Banner & Studio Actions */}
      <div
        className="rounded-[var(--radius-container)] p-6 md:p-8 border border-[var(--border-color)] bg-[var(--bg-card)] relative overflow-hidden"
        style={{
          boxShadow: 'var(--shadow-bento)'
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="p-2 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent-text)]">
                <Sparkles className="w-5 h-5" />
              </span>
              <span className="text-xs uppercase tracking-widest font-bold text-[var(--accent-text)]">
                AI Prompt Studio & Multi-Category Library
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[var(--text-main)]">
              Студия Промптов
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl leading-relaxed">
              Формулируйте точечные пошаговые инструкции для ИИ, объединяйте шаблоны в несколько категорий и создавайте реалистичные ветки сценариев в 1 клик.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsCategoryManagerOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] bg-[var(--bg-main)] hover:bg-[var(--bg-card-hover)] transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              title="Управление категориями"
            >
              <Settings2 className="w-4 h-4 text-[var(--accent-text)]" />
              <span>Категории</span>
            </button>

            <button
              onClick={() => {
                setEditingTemplate(null);
                setFormTitle('');
                setFormDescription('');
                setFormCategories(['software']);
                setFormPromptText('');
                setFormTags('');
                setIsManualModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] bg-[var(--bg-main)] hover:bg-[var(--bg-card-hover)] transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Создать вручную</span>
            </button>

            <button
              onClick={() => setIsStudioOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              <span>✨ AI Генератор</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[var(--border-color)]">
          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Всего шаблонов</span>
              <div className="text-lg font-bold text-[var(--text-main)]">{stats.total}</div>
            </div>
            <BookOpen className="w-4 h-4 text-[var(--accent-text)]" />
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Динамические (Live)</span>
              <div className="text-lg font-bold text-emerald-400">{stats.dynamicCount}</div>
            </div>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Статические</span>
              <div className="text-lg font-bold text-sky-400">{stats.staticCount}</div>
            </div>
            <MessageSquare className="w-4 h-4 text-sky-400" />
          </div>

          <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-between">
            <div>
              <span className="text-[11px] text-[var(--text-muted)] font-medium">Категорий</span>
              <div className="text-lg font-bold text-purple-400">{categories.length}</div>
            </div>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Command Bar */}
      <div className="p-4 rounded-[var(--radius-card)] bg-[var(--bg-card)] border border-[var(--border-color)] flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск по теме, промпту или тегам..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        {/* Dynamic Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-color)]'
            }`}
          >
            Все категории
          </button>
          {categories.map((cat) => {
            const Icon = DEFAULT_CATEGORY_ICONS[cat.id] || Tag;
            const isSel = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSel
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-color)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: isSel ? 'white' : cat.color }} />
                <span>{cat.label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setIsCategoryManagerOpen(true)}
            className="p-1.5 rounded-lg bg-[var(--bg-main)] border border-dashed border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:border-[var(--accent)] transition-colors cursor-pointer"
            title="Добавить / настроить категории"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1 bg-[var(--bg-main)] p-1 rounded-xl border border-[var(--border-color)] flex-shrink-0">
          <button
            onClick={() => setSelectedMode('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
              selectedMode === 'all' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
            }`}
          >
            Все
          </button>
          <button
            onClick={() => setSelectedMode('dynamic')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
              selectedMode === 'dynamic' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-[var(--text-muted)]'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Динамика</span>
          </button>
          <button
            onClick={() => setSelectedMode('static')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
              selectedMode === 'static' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-[var(--text-muted)]'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Статика</span>
          </button>
        </div>
      </div>

      {/* 3. Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 rounded-[var(--radius-card)] bg-[var(--bg-card)] border border-[var(--border-color)] animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 rounded-[var(--radius-card)] bg-[var(--bg-card)] border border-[var(--border-color)] text-center">
          <Sparkles className="w-10 h-10 text-[var(--accent-text)] mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-bold text-[var(--text-main)]">Промпты не найдены</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
            Попробуйте изменить поисковый запрос или сгенерируйте новый сценарий в AI Студии.
          </p>
          <button
            onClick={() => setIsStudioOpen(true)}
            className="mt-4 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Открыть AI Студию</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => {
            const isExpanded = expandedTemplateId === template.id;
            const rolesList: StudioRoleInstruction[] = template.roles_breakdown
              ? (() => {
                  try {
                    return JSON.parse(template.roles_breakdown);
                  } catch {
                    return [];
                  }
                })()
              : [];

            const stepsList: any[] = template.steps_payload
              ? (() => {
                  try {
                    return JSON.parse(template.steps_payload);
                  } catch {
                    return [];
                  }
                })()
              : [];

            const effectiveSteps = stepsList.length > 0
              ? stepsList
              : (rolesList.length > 0
                  ? rolesList.map((r, idx) => ({
                      step_order: idx + 1,
                      role_id: idx + 1,
                      role_name: r.role_name,
                      text: r.sample_text || `Шаг ${idx + 1}`,
                      sample_text: r.sample_text || `Шаг ${idx + 1}`,
                      ai_prompt: r.instruction,
                      is_ai_dynamic: template.mode === 'dynamic',
                      reply_to_step: idx > 0 ? idx : null,
                      delay_before_min: 4.0,
                      delay_before_max: 9.0
                    }))
                  : [
                      {
                        step_order: 1,
                        role_id: 1,
                        role_name: 'Зачинщик',
                        text: 'Начало обсуждения',
                        ai_prompt: template.prompt_text,
                        is_ai_dynamic: template.mode === 'dynamic',
                        reply_to_step: null,
                        delay_before_min: 4.0,
                        delay_before_max: 8.0
                      }
                    ]);

            const tCategories = template.categories && template.categories.length > 0
              ? template.categories
              : [template.category || 'general'];

            return (
              <div
                key={template.id}
                className="rounded-[var(--radius-card)] bg-[var(--bg-card)] border border-[var(--border-color)] p-5 flex flex-col justify-between hover:border-[var(--border-subtle)] transition-all relative group"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div>
                  {/* Top Badges (Multi-category tags) */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {tCategories.map((cId) => {
                        const catObj = categoryMap[cId] || { id: cId, label: cId, color: '#38bdf8' };
                        const Icon = DEFAULT_CATEGORY_ICONS[catObj.id] || Tag;
                        return (
                          <span
                            key={cId}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 border"
                            style={{
                              color: catObj.color,
                              backgroundColor: `${catObj.color}15`,
                              borderColor: `${catObj.color}35`
                            }}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            <span>{catObj.label}</span>
                          </span>
                        );
                      })}

                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                          template.mode === 'dynamic'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                        }`}
                      >
                        {template.mode === 'dynamic' ? <Zap className="w-2.5 h-2.5" /> : <MessageSquare className="w-2.5 h-2.5" />}
                        <span>{template.mode === 'dynamic' ? 'Динамика' : 'Статика'}</span>
                      </span>

                      {/* SMS Messages Count Badge */}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent)] font-mono">
                        💬 {effectiveSteps.length} смс
                      </span>

                      {template.is_builtin && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          ⭐ Системный
                        </span>
                      )}
                    </div>

                    {/* Actions Menu */}
                    {!template.is_builtin && (
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEdit(template)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] cursor-pointer"
                          title="Редактировать"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-base font-bold text-[var(--text-main)] tracking-tight mb-1">
                    {template.title}
                  </h3>
                  {template.description && (
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-3 leading-relaxed">
                      {template.description}
                    </p>
                  )}

                  {/* Prompt Text Box */}
                  <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] mb-3">
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] font-semibold uppercase mb-1">
                      <span>Инструкция сценария:</span>
                      <button
                        onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                        className="text-[var(--accent-text)] hover:underline cursor-pointer font-bold"
                      >
                        {isExpanded ? 'Свернуть детали ▲' : 'Развернуть цепочку ▼'}
                      </button>
                    </div>
                    <p className={`text-xs text-[var(--text-main)] font-mono leading-relaxed ${isExpanded ? '' : 'line-clamp-3'}`}>
                      {template.prompt_text}
                    </p>
                  </div>

                  {/* Expanded Step-by-Step SMS Sequence */}
                  {isExpanded && stepsList.length > 0 && (
                    <div className="space-y-2 mb-3 animate-in fade-in duration-200">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        Пошаговая цепочка сообщений ({stepsList.length} смс):
                      </span>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {stepsList.map((step: any, sIdx: number) => (
                          <div
                            key={sIdx}
                            className="p-2.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-1 text-[11px]">
                              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-main)]">
                                <span className="text-[var(--accent-text)] font-mono">#{sIdx + 1}</span>
                                <span>{step.role_name || `Роль #${step.role_id || (sIdx + 1)}`}</span>
                                {step.reply_to_step && (
                                  <span className="text-[10px] text-[var(--text-dim)] font-normal">
                                    ↳ ответ на #{step.reply_to_step}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-[var(--text-dim)]">
                                ⏱️ {step.delay_before_min || 4}-{step.delay_before_max || 9}с
                              </div>
                            </div>
                            {step.ai_prompt && (
                              <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                <strong className="text-[var(--text-dim)] font-normal">Инструкция: </strong>
                                {step.ai_prompt}
                              </div>
                            )}
                            {(step.text || step.sample_text) && (
                              <div className="text-[10px] font-mono text-[var(--text-main)] bg-[var(--bg-card)] px-2 py-1 rounded border border-[var(--border-color)]">
                                «{step.text || step.sample_text}»
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Roles Breakdown Chips (when not expanded or if no stepsList) */}
                  {(!isExpanded || stepsList.length === 0) && rolesList.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        Драматургия ролей:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                        {rolesList.map((r, i) => (
                          <div
                            key={i}
                            className="p-2 rounded-lg bg-[var(--bg-main)] border border-[var(--border-color)] text-[11px]"
                          >
                            <div className="font-bold text-[var(--text-main)] truncate">
                              #{r.role_order} {r.role_name}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">{r.goal}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {template.tags && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-4">
                      {template.tags.split(',').map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-[var(--bg-main)] text-[10px] text-[var(--text-muted)] border border-[var(--border-color)]"
                        >
                          #{tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between gap-2 mt-2">
                  <button
                    onClick={() => handleCopyText(template.prompt_text, template.id)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    {copiedId === template.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === template.id ? 'Скопировано' : 'Копировать'}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenQuickLaunch(template)}
                      className="px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98] shadow-sm"
                      title="Выбрать количество сообщений (КОЛ смс) и создать сценарий"
                    >
                      <Rocket className="w-3.5 h-3.5" />
                      <span>Создать сценарий ({effectiveSteps.length} смс)</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. AI PROMPT STUDIO MODAL / DRAWER */}
      {isStudioOpen && (
        <div
          onClick={() => setIsStudioOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-container)] shadow-2xl p-6 md:p-8 space-y-6 my-8 max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent-text)]">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-main)] tracking-tight">
                    Интерактивная AI Студия Промптов
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Опишите задумку сцены своими словами — нейросеть создаст точечные роли и структурированные инструкции.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsStudioOpen(false)}
                className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Form */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <label className="text-xs font-bold text-[var(--text-main)]">
                    Краткая тема или задумка сцены:
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isEnhancing}
                      onClick={handleEnhancePrompt}
                      className="text-[11px] text-[var(--accent-text)] hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-semibold"
                      title="Улучшить, дополнить и детализировать набросок с помощью ИИ"
                    >
                      {isEnhancing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5" />
                      )}
                      <span>{isEnhancing ? 'Улучшение...' : '✨ Улучшить с помощью ИИ'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRandomTopic}
                      className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Dices className="w-3.5 h-3.5" />
                      <span>🎲 Случайная идея</span>
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={studioTopic}
                  onChange={(e) => setStudioTopic(e.target.value)}
                  placeholder="Опишите любую тему, нишу или сценарий (например: обсуждение новости, реальный отзыв о продукте/услуге, спор о трендах, вопрос к специалисту или свои точечные инструкции для ботов)..."
                  className="w-full p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
                />
                {studioDrama === 'none' && (
                  <p className="text-[11px] text-[var(--accent-text)] mt-1.5 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Режим «Без шаблона» активен: опишите подробно в поле выше, какую мысль или роли должен сыграть каждый бот.</span>
                  </p>
                )}
              </div>

              {/* 1. Mode Selector Cards */}
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1.5">
                  Режим генерации и выполнения:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStudioMode('dynamic')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      studioMode === 'dynamic'
                        ? 'bg-emerald-500/10 border-emerald-500 text-[var(--text-main)] shadow-sm'
                        : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${studioMode === 'dynamic' ? 'bg-emerald-500 text-white' : 'bg-[var(--bg-card)] text-emerald-400'}`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                        <span>⚡ Динамические промпты на лету</span>
                        {studioMode === 'dynamic' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-normal">
                        ИИ формулирует ответ в момент выхода поста, адаптируясь под тему новости.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioMode('static')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      studioMode === 'static'
                        ? 'bg-sky-500/10 border-sky-500 text-[var(--text-main)] shadow-sm'
                        : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${studioMode === 'static' ? 'bg-sky-500 text-white' : 'bg-[var(--bg-card)] text-sky-400'}`}>
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                        <span>📝 Статический готовый сценарий</span>
                        {studioMode === 'static' && <Check className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-normal">
                        Фиксированные заготовки текста для полного контроля над каждым словом.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Drama Flow Patterns (Visual Cards Grid) */}
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1.5">
                  Драматургия ветки диалога:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {DRAMA_PRESETS.map((drama) => {
                    const DramaIcon = drama.icon;
                    const isSel = studioDrama === drama.id;
                    return (
                      <button
                        type="button"
                        key={drama.id}
                        onClick={() => setStudioDrama(drama.id as any)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSel
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--border-color)] hover:border-[var(--border-subtle)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"
                              style={{ color: drama.color, backgroundColor: `${drama.color}15` }}
                            >
                              <DramaIcon className="w-3 h-3" />
                              <span>{drama.badge}</span>
                            </span>
                            {isSel && <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />}
                          </div>
                          <div className="text-xs font-bold text-[var(--text-main)] mt-1">
                            {drama.title}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                            {drama.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Tone & Vocabulary Styles */}
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1.5">
                  Тональность и стиль сленга:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {TONE_PRESETS.map((tone) => {
                    const isSel = studioTone === tone.id;
                    return (
                      <button
                        type="button"
                        key={tone.id}
                        onClick={() => setStudioTone(tone.id as any)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSel
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--border-color)] hover:border-[var(--border-subtle)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-[var(--accent-text)] bg-[var(--bg-card)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">
                              {tone.badge}
                            </span>
                            {isSel && <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />}
                          </div>
                          <div className="text-xs font-bold text-[var(--text-main)]">
                            {tone.title}
                          </div>
                          <div className="text-[10px] font-mono text-[var(--text-dim)] mt-1 truncate">
                            {tone.sample}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Roles Count & Stepper */}
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1.5">
                  Количество ботов (участников):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {ROLES_PRESETS.map((r) => {
                    const isSel = studioRolesCount === r.count;
                    return (
                      <button
                        type="button"
                        key={r.count}
                        onClick={() => setStudioRolesCount(r.count)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSel
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--border-color)] hover:border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                            <span>{r.label}</span>
                          </span>
                          {isSel && <Check className="w-3.5 h-3.5 text-[var(--accent-text)]" />}
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5">
                          {r.hint}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Messages / Steps Count (КОЛ смс) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[var(--text-muted)]">
                    Количество сообщений в диалоге (КОЛ смс):
                  </label>
                  <span className="text-[11px] font-mono text-[var(--accent-text)] font-semibold">
                    {studioStepsCount} {studioStepsCount === 2 || studioStepsCount === 3 || studioStepsCount === 4 ? 'сообщения' : 'сообщений'} ({studioRolesCount} {studioRolesCount === 2 || studioRolesCount === 3 || studioRolesCount === 4 ? 'бота' : 'ботов'})
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[2, 3, 4, 5, 6, 8, 10].map((count) => {
                    const isSel = studioStepsCount === count;
                    return (
                      <button
                        type="button"
                        key={count}
                        onClick={() => setStudioStepsCount(count)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                          isSel
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-text)] font-bold shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-subtle)]'
                        }`}
                      >
                        <span className="text-xs">{count} смс</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--text-dim)] mt-1">
                  ИИ распределит {studioStepsCount} {studioStepsCount === 2 || studioStepsCount === 3 || studioStepsCount === 4 ? 'реплики' : 'реплик'} между {studioRolesCount} ботами с естественными паузами и ответами.
                </p>
              </div>

              {/* Generate Button */}
              <button
                type="button"
                disabled={isGenerating || !studioTopic.trim()}
                onClick={handleGenerateStudio}
                className="w-full py-3.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Формулирование точечных инструкций и сценария...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Сгенерировать диалог ({studioStepsCount} смс / {studioRolesCount} бота)</span>
                  </>
                )}
              </button>
            </div>

            {/* Studio Generation Results Card (Flexible Interactive Bento) */}
            {studioResult && (
              <div className="p-5 rounded-2xl bg-[var(--bg-main)] border border-[var(--accent)]/50 space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                {/* Header & Tabs */}
                <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[var(--border-color)]">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent)]">
                      Результат
                    </span>
                    <input
                      type="text"
                      value={studioResult.title}
                      onChange={(e) => handleUpdateStudioField('title', e.target.value)}
                      className="text-sm font-bold text-[var(--text-main)] bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-[var(--accent)] focus:outline-none px-1 py-0.5 w-full"
                      placeholder="Название сценария..."
                    />
                  </div>

                  {/* Mode & Step Count Badge */}
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]">
                      {studioResult.mode === 'dynamic' ? '⚡ Динамический' : '📝 Статический'}
                    </span>
                    <span>•</span>
                    <span className="text-[var(--accent-text)] font-semibold">{studioResult.steps_payload.length} смс</span>
                  </div>
                </div>

                {/* Sub-tabs Navigation */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] max-w-fit">
                  <button
                    type="button"
                    onClick={() => setStudioActiveTab('steps')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      studioActiveTab === 'steps'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Пошаговая цепочка ({studioResult.steps_payload.length} смс)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioActiveTab('roles')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      studioActiveTab === 'roles'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Роли и инструкции ({studioResult.roles.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioActiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      studioActiveTab === 'overview'
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Общий промпт</span>
                  </button>
                </div>

                {/* TAB 1: STEPS TIMELINE (Messages) */}
                {studioActiveTab === 'steps' && (
                  <div className="space-y-3">
                    <div className="space-y-2.5">
                      {studioResult.steps_payload.map((step, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-2.5 transition-all hover:border-[var(--accent)]/40"
                        >
                          {/* Step Header */}
                          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold px-2 py-0.5 rounded-md bg-[var(--bg-main)] text-[var(--accent-text)] border border-[var(--border-color)] font-mono">
                                #{idx + 1}
                              </span>

                              {/* Role Selector */}
                              <select
                                value={step.role_id}
                                onChange={(e) => {
                                  const rId = Number(e.target.value);
                                  const rObj = studioResult.roles.find(r => r.role_order === rId);
                                  handleUpdateStudioStep(idx, 'role_id', rId);
                                  if (rObj) handleUpdateStudioStep(idx, 'role_name', rObj.role_name);
                                }}
                                className="bg-[var(--bg-main)] text-[var(--text-main)] font-semibold border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
                              >
                                {studioResult.roles.map((r) => (
                                  <option key={r.role_order} value={r.role_order}>
                                    Роль #{r.role_order}: {r.role_name}
                                  </option>
                                ))}
                              </select>

                              {/* Reply-to Selector */}
                              <select
                                value={step.reply_to_step || ''}
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : null;
                                  handleUpdateStudioStep(idx, 'reply_to_step', val);
                                }}
                                className="bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-color)] rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent)]"
                              >
                                <option value="">💬 Новое сообщение (в корень)</option>
                                {studioResult.steps_payload.slice(0, idx).map((_, pIdx) => (
                                  <option key={pIdx + 1} value={pIdx + 1}>
                                    ↳ Ответ на шаг #{pIdx + 1}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Delay & Delete Step Button */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-dim)] bg-[var(--bg-main)] px-2 py-0.5 rounded-md border border-[var(--border-color)]">
                                <span>⏱️</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="60"
                                  value={step.delay_before_min}
                                  onChange={(e) => handleUpdateStudioStep(idx, 'delay_before_min', Number(e.target.value))}
                                  className="w-7 text-center bg-transparent text-[var(--text-main)] focus:outline-none"
                                />
                                <span>-</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="120"
                                  value={step.delay_before_max}
                                  onChange={(e) => handleUpdateStudioStep(idx, 'delay_before_max', Number(e.target.value))}
                                  className="w-7 text-center bg-transparent text-[var(--text-main)] focus:outline-none"
                                />
                                <span>сек</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteStudioStep(idx)}
                                disabled={studioResult.steps_payload.length <= 1}
                                className="p-1 rounded text-[var(--text-dim)] hover:text-red-400 disabled:opacity-30 cursor-pointer"
                                title="Удалить этот шаг"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Step Content: Dynamic Prompt vs Static Text */}
                          {studioResult.mode === 'dynamic' ? (
                            <div className="space-y-1.5">
                              <div>
                                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-text)] block mb-1">
                                  Инструкция (промпт) для ИИ на этом шаге:
                                </label>
                                <textarea
                                  rows={2}
                                  value={step.ai_prompt || ''}
                                  onChange={(e) => handleUpdateStudioStep(idx, 'ai_prompt', e.target.value)}
                                  placeholder="Например: Задай вопрос по теме с легким любопытством на 'ты'..."
                                  className="w-full p-2.5 rounded-lg bg-[var(--bg-main)] text-xs text-[var(--text-main)] border border-[var(--accent)]/40 focus:border-[var(--accent)] focus:outline-none font-mono resize-y"
                                />
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-main)]/60 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)]">
                                <span className="font-semibold text-[var(--text-dim)] flex-shrink-0">Пример фразы:</span>
                                <input
                                  type="text"
                                  value={step.text || step.sample_text || ''}
                                  onChange={(e) => {
                                    handleUpdateStudioStep(idx, 'text', e.target.value);
                                    handleUpdateStudioStep(idx, 'sample_text', e.target.value);
                                  }}
                                  placeholder="Пример сообщения без точки..."
                                  className="w-full bg-transparent text-xs text-[var(--text-muted)] focus:text-[var(--text-main)] focus:outline-none font-mono"
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                                Текст сообщения:
                              </label>
                              <textarea
                                rows={2}
                                value={step.text || ''}
                                onChange={(e) => handleUpdateStudioStep(idx, 'text', e.target.value)}
                                placeholder="Текст реплики сообщения..."
                                className="w-full p-2.5 rounded-lg bg-[var(--bg-main)] text-xs text-[var(--text-main)] border border-[var(--border-color)] focus:border-[var(--accent)] focus:outline-none font-mono resize-y"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddStudioStep}
                      className="w-full py-2.5 rounded-xl border border-dashed border-[var(--border-color)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить сообщение в диалог</span>
                    </button>
                  </div>
                )}

                {/* TAB 2: ROLES & INSTRUCTIONS */}
                {studioActiveTab === 'roles' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {studioResult.roles.map((role, rIdx) => (
                      <div
                        key={role.role_order}
                        className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--bg-main)] text-[var(--accent-text)] border border-[var(--border-color)]">
                            #{role.role_order}
                          </span>
                          <input
                            type="text"
                            value={role.role_name}
                            onChange={(e) => handleUpdateStudioRole(rIdx, 'role_name', e.target.value)}
                            className="text-xs font-bold text-[var(--text-main)] bg-transparent border-b border-transparent hover:border-[var(--border-color)] focus:border-[var(--accent)] focus:outline-none w-full"
                            placeholder="Имя роли..."
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-0.5">
                            Цель персонажа:
                          </label>
                          <input
                            type="text"
                            value={role.goal}
                            onChange={(e) => handleUpdateStudioRole(rIdx, 'goal', e.target.value)}
                            className="text-[11px] text-[var(--accent-text)] font-semibold bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1 w-full focus:outline-none focus:border-[var(--accent)]"
                            placeholder="Цель бота..."
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-0.5">
                            Инструкция:
                          </label>
                          <textarea
                            rows={3}
                            value={role.instruction}
                            onChange={(e) => handleUpdateStudioRole(rIdx, 'instruction', e.target.value)}
                            className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2 w-full focus:outline-none focus:border-[var(--accent)] leading-relaxed resize-y"
                            placeholder="Инструкция для бота..."
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-0.5">
                            Пример реплики:
                          </label>
                          <input
                            type="text"
                            value={role.sample_text}
                            onChange={(e) => handleUpdateStudioRole(rIdx, 'sample_text', e.target.value)}
                            className="text-[10px] text-[var(--text-main)] font-mono bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg px-2 py-1 w-full focus:outline-none focus:border-[var(--accent)]"
                            placeholder="Пример фразы..."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 3: OVERVIEW & GENERAL PROMPT */}
                {studioActiveTab === 'overview' && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] space-y-2">
                      <label className="text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-wider block">
                        Сгенерированный общий промпт сценария:
                      </label>
                      <textarea
                        rows={4}
                        value={studioResult.prompt_text}
                        onChange={(e) => handleUpdateStudioField('prompt_text', e.target.value)}
                        className="w-full text-xs text-[var(--text-main)] font-mono bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg p-2.5 focus:outline-none focus:border-[var(--accent)] resize-y leading-relaxed"
                        placeholder="Общий промпт..."
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons with clear distinction between Template and Scenario */}
                <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-[var(--border-color)]">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Готово: <strong className="text-[var(--text-main)]">{studioResult.roles.length} ролей</strong>, <strong className="text-[var(--text-main)]">{studioResult.steps_payload.length} сообщений</strong>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      onClick={() => handleCopyText(studioResult.prompt_text)}
                      className="px-3 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] flex items-center gap-1.5 cursor-pointer"
                    >
                      {studioCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{studioCopied ? 'Скопировано' : 'Скопировать'}</span>
                    </button>

                    <button
                      onClick={handleSaveStudioToLibrary}
                      className="px-3.5 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] flex items-center gap-1.5 cursor-pointer"
                      title="Сохранить как шаблон в библиотеку промптов для повторного использования"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                      <span>📥 В библиотеку шаблонов</span>
                    </button>

                    <button
                      onClick={() =>
                        handleCreateScenario({
                          title: studioResult.title,
                          mode: studioResult.mode,
                          prompt_text: studioResult.prompt_text,
                          steps: studioResult.steps_payload
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
                      title="Развернуть полноценный живой сценарий со всеми репликами в разделе «Сценарии»"
                    >
                      <Zap className="w-4 h-4" />
                      <span>🚀 Создать сценарий ({studioResult.steps_payload.length} смс)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MANUAL CREATE / EDIT TEMPLATE MODAL (Multi-Category Selector) */}
      {isManualModalOpen && (
        <div
          onClick={() => setIsManualModalOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-container)] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <h3 className="text-base font-bold text-[var(--text-main)]">
                {editingTemplate ? 'Редактировать шаблон' : 'Новый шаблон промпта'}
              </h3>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualForm} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">
                  Название шаблона:
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Например: Скепсис и рекомендация софта"
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Multi-Category Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[var(--text-muted)]">
                    Категории шаблона (можно выбрать несколько):
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCategoryManagerOpen(true)}
                    className="text-[11px] text-[var(--accent-text)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Settings2 className="w-3 h-3" />
                    <span>Настроить категории</span>
                  </button>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] min-h-[46px]">
                  {categories.map((cat) => {
                    const isSelected = formCategories.includes(cat.id);
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => toggleFormCategory(cat.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'text-white shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-card)] border-[var(--border-color)]'
                        }`}
                        style={{
                          backgroundColor: isSelected ? cat.color : undefined,
                          borderColor: isSelected ? cat.color : undefined
                        }}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">
                  Режим:
                </label>
                <select
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] outline-none cursor-pointer"
                >
                  <option value="dynamic">⚡ Динамический (is_ai_dynamic)</option>
                  <option value="static">📝 Статический</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">
                  Краткое описание / цель:
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Например: Скептический вопрос -> нативный ответ -> пруф"
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">
                  Текст промпта (Инструкция для ИИ):
                </label>
                <textarea
                  rows={4}
                  required
                  value={formPromptText}
                  onChange={(e) => setFormPromptText(e.target.value)}
                  placeholder="Подробный текст промпта сценария..."
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] font-mono outline-none focus:border-[var(--accent)] leading-relaxed"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1">
                  Теги (через запятую):
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="софт,tgactor,прокси,кейсы"
                  className="w-full p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. CATEGORY MANAGEMENT MODAL */}
      {isCategoryManagerOpen && (
        <div
          onClick={() => setIsCategoryManagerOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-container)] shadow-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-[var(--accent-text)]" />
                <h3 className="text-base font-bold text-[var(--text-main)]">
                  Управление категориями
                </h3>
              </div>
              <button
                onClick={() => setIsCategoryManagerOpen(false)}
                className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Add new Category Form */}
            <form onSubmit={handleCreateCategory} className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] space-y-3">
              <div className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4 text-[var(--accent-text)]" />
                <span>Добавить новую категорию</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  placeholder="Название (например: E-commerce, Дейтинг...)"
                  className="flex-1 p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />

                <button
                  type="submit"
                  disabled={isAddingCat || !newCatLabel.trim()}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </div>

              {/* Color picker pills */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-[var(--text-muted)]">Цвет бейджа:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setNewCatColor(c)}
                      className={`w-5 h-5 rounded-full border-2 transition-transform cursor-pointer ${
                        newCatColor === c ? 'scale-125 border-white' : 'border-transparent hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </form>

            {/* Categories List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                Существующие категории:
              </span>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-xs font-semibold text-[var(--text-main)]">
                      {cat.label}
                    </span>
                    {cat.is_builtin ? (
                      <span className="text-[10px] text-[var(--text-dim)] font-mono">
                        (системная)
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-mono">
                        (пользовательская)
                      </span>
                    )}
                  </div>

                  {!cat.is_builtin && (
                    <button
                      onClick={() => handleDeleteCategory(cat.id, cat.label)}
                      className="p-1 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                      title="Удалить категорию"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsCategoryManagerOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold cursor-pointer"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. QUICK SCENARIO CREATOR FROM TEMPLATE MODAL */}
      {quickLaunchTemplate && (
        <div
          onClick={() => setQuickLaunchTemplate(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-container)] shadow-2xl p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent-text)]">
                  <Rocket className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-main)]">
                    Создание сценария из шаблона
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    Выберите количество сообщений (КОЛ смс) — цепочка ответов и роли настроятся автоматически.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setQuickLaunchTemplate(null)}
                className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-bold text-[var(--text-main)] block mb-1">
                  Название нового сценария:
                </label>
                <input
                  type="text"
                  value={quickLaunchTitle}
                  onChange={(e) => setQuickLaunchTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="Название..."
                />
              </div>

              {/* Steps Count (КОЛ смс) Bento Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[var(--text-main)]">
                    Количество сообщений в диалоге (КОЛ смс):
                  </label>
                  <span className="text-xs font-bold text-[var(--accent-text)] font-mono">
                    {quickLaunchStepsCount} {quickLaunchStepsCount >= 2 && quickLaunchStepsCount <= 4 ? 'сообщения' : 'сообщений'}
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[2, 3, 4, 5, 6, 8, 10].map((count) => {
                    const isSel = quickLaunchStepsCount === count;
                    return (
                      <button
                        type="button"
                        key={count}
                        onClick={() => setQuickLaunchStepsCount(count)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                          isSel
                            ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-text)] font-bold shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-subtle)]'
                        }`}
                      >
                        <span className="text-xs">{count} смс</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode Toggle */}
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] block mb-1.5">
                  Режим генерации:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setQuickLaunchMode('dynamic')}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all ${
                      quickLaunchMode === 'dynamic'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 font-bold'
                        : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)]'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="text-xs">⚡ Динамический ИИ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickLaunchMode('static')}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 cursor-pointer transition-all ${
                      quickLaunchMode === 'static'
                        ? 'bg-sky-500/15 border-sky-500 text-sky-400 font-bold'
                        : 'bg-[var(--bg-main)] border-[var(--border-color)] text-[var(--text-muted)]'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-xs">📝 Фиксированные реплики</span>
                  </button>
                </div>
              </div>

              {/* Real-time Preview of Step Sequence */}
              <div>
                <label className="text-[11px] font-bold text-[var(--text-dim)] uppercase tracking-wider block mb-1.5">
                  Цепочка ответов ({quickLaunchStepsCount} сообщений):
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 bg-[var(--bg-main)] p-2.5 rounded-xl border border-[var(--border-color)]">
                  {buildStepsForTemplate(quickLaunchTemplate, quickLaunchStepsCount, quickLaunchMode).map((step, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-xs flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[var(--accent-text)] font-bold">#{idx + 1}</span>
                        <span className="font-semibold text-[var(--text-main)]">{step.role_name}</span>
                        {step.reply_to_step && (
                          <span className="text-[10px] text-[var(--text-dim)]">
                            ↳ ответ на #{step.reply_to_step}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--text-dim)] flex-shrink-0">
                        ⏱️ {step.delay_before_min}-{step.delay_before_max}с
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setQuickLaunchTemplate(null)}
                className="px-4 py-2 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                Отмена
              </button>

              <button
                type="button"
                onClick={() => {
                  const builtSteps = buildStepsForTemplate(quickLaunchTemplate, quickLaunchStepsCount, quickLaunchMode);
                  handleCreateScenario({
                    title: quickLaunchTitle.trim() || quickLaunchTemplate.title,
                    mode: quickLaunchMode,
                    prompt_text: quickLaunchTemplate.prompt_text,
                    steps: builtSteps
                  });
                  setQuickLaunchTemplate(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md active:scale-[0.98]"
              >
                <Rocket className="w-4 h-4" />
                <span>🚀 Создать сценарий ({quickLaunchStepsCount} смс)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
