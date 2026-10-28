import { test as base, expect, type Page } from '@playwright/test';

const accounts = [
  {
    id: 1,
    phone: '+49 *** *** 6039',
    first_name: 'Профиль',
    last_name: 'Диалоги',
    username: 'demo_dialogs',
    custom_name: 'Диалоги · Основной',
    status: 'active',
    is_active: true,
    proxy_id: 1,
    in_commenting_pool: true,
    in_reaction_pool: false,
    source_type: 'tdata',
  },
  {
    id: 2,
    phone: '+49 *** *** 9047',
    first_name: 'Профиль',
    last_name: 'Реакции',
    username: 'demo_reactions',
    status: 'active',
    is_active: true,
    proxy_id: 2,
    in_commenting_pool: true,
    in_reaction_pool: true,
  },
  {
    id: 3,
    phone: '+49 *** *** 4038',
    first_name: 'Профиль',
    last_name: 'Резерв',
    username: 'demo_reserve',
    status: 'error',
    is_active: false,
    proxy_id: null,
    in_commenting_pool: false,
    in_reaction_pool: false,
  },
];

const scenario = {
  id: 1,
  title: 'Обсуждение публикации',
  is_active: true,
  min_delay: 10,
  max_delay: 30,
  weight: 1,
  mode: 'manual',
  ai_prompt: '',
  ai_provider: '',
  ai_model: '',
  system_instruction: '',
};
const steps = [
  {
    id: 1,
    role_id: 1,
    step_order: 0,
    delay_before_min: 10,
    delay_before_max: 20,
    text: 'Какие результаты показал ваш подход на практике?',
    reply_to_step_id: null,
    min_delay: 10,
    max_delay: 20,
    reactions: '',
    reaction_count: 0,
    is_ai_dynamic: false,
  },
];

const test = base.extend<{ mockApi: void }>({
  mockApi: [
    async ({ page }, use) => {
      await page.routeWebSocket('**/ws/inbox*', () => {});
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let data: unknown = [];
        if (path === '/api/auth/login')
          data = { access_token: 'isolated-ui-test-token' };
        else if (path === '/api/accounts') data = accounts;
        else if (path === '/api/proxies')
          data = [
            {
              id: 1,
              host: '192.0.2.24',
              port: 1080,
              protocol: 'socks5',
              status: 'active',
            },
            {
              id: 2,
              host: '198.51.100.17',
              port: 1080,
              protocol: 'socks5',
              status: 'active',
            },
          ];
        else if (path === '/api/config/proxy-mode') data = { use_proxy: true };
        else if (path === '/api/scenarios') data = [scenario];
        else if (path === '/api/scenarios/1/steps') data = steps;
        else if (path === '/api/channels')
          data = [
            {
              id: 1,
              channel_username: 'demo_channel',
              is_active: true,
              min_delay_seconds: 10,
              max_delay_seconds: 30,
              no_repeat_scenarios: false,
              execution_mode: 'scenario',
            },
          ];
        else if (path === '/api/channels/monitor/status')
          data = { running: false };
        else if (path === '/api/channels/smooth-join/status')
          data = { status: 'idle' };
        else if (path === '/api/settings/ai')
          data = {
            ai_provider: 'openai',
            ai_default_model: 'gpt-4o-mini',
            ai_api_key: '',
            ai_system_prompt: '',
          };
        else if (path === '/api/prompts/categories')
          data = [{ id: 'software', label: 'Технологии', color: '#24785c' }];
        else if (path === '/api/prompts')
          data = [
            {
              id: 1,
              title: 'Обсуждение продукта',
              description:
                'Содержательный диалог о новых возможностях продукта.',
              category: 'software',
              categories: ['software'],
              mode: 'static',
              prompt_text: 'Обсудите преимущества и ограничения продукта.',
              tags: 'продукт,обсуждение',
              is_builtin: false,
              created_at: '2026-10-28T09:00:00Z',
            },
          ];
        else if (path === '/api/logs/stats')
          data = {
            total: 1,
            ok_count: 1,
            error_count: 0,
            warning_count: 0,
            active_accounts: 1,
            count_24h: 1,
            success_rate: 100,
          };
        else if (path === '/api/logs/filters')
          data = {
            action_types: ['message_sent'],
            statuses: ['ok'],
            accounts: [{ id: 1, label: 'Профиль' }],
          };
        else if (path === '/api/logs/actions')
          data = [
            {
              id: 1,
              executed_at: '2026-10-28T09:15:00Z',
              account_id: 1,
              account_phone: accounts[0].phone,
              account_name: 'Профиль',
              account_username: 'demo_dialogs',
              scenario_id: 1,
              action_type: 'message_sent',
              status: 'ok',
              target: '@demo_channel',
              target_id: '48',
              details: 'Сообщение отправлено',
            },
          ];
        else if (path === '/api/inbox/chats')
          data = [
            {
              account_id: 1,
              peer_id: 101,
              peer_name: 'Обсуждение проекта',
              peer_username: 'demo_chat',
              account_phone: accounts[0].phone,
              account_name: 'Профиль',
              last_message: 'Спасибо, давайте обсудим детали.',
              updated_at: '2026-10-28T09:15:00Z',
            },
          ];
        else if (path === '/api/inbox/messages/1/101')
          data = [
            {
              id: 1,
              account_id: 1,
              peer_id: 101,
              peer_name: 'Обсуждение проекта',
              incoming: true,
              is_incoming: true,
              text: 'Спасибо, давайте обсудим детали.',
              created_at: '2026-10-28T09:15:00Z',
            },
          ];
        await route.fulfill({ json: data });
      });
      await use();
    },
    { auto: true },
  ],
});

async function authenticate(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem('tgactor_token', 'isolated-ui-test-token'),
  );
}

async function chooseTheme(page: Page, theme: string) {
  const labels: Record<string, string> = {
    light: 'Светлая',
    'dark-charcoal': 'Графит',
    'dark-crimson': 'Бордо',
    'deep-indigo': 'Сланец',
  };
  await page.getByRole('combobox', { name: 'Тема оформления' }).click();
  await page.getByRole('option', { name: labels[theme], exact: true }).click();
}

async function expectFitsViewport(page: Page) {
  const width = page.viewportSize()!.width;
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(width + 1);
}

const sections = [
  ['/', 'Ваши аккаунты'],
  ['/pools', 'Роли ваших аккаунтов'],
  ['/channels', 'Мониторинг каналов'],
  ['/scenarios', 'Сценарии диалогов'],
  ['/prompts', 'Студия промптов'],
  ['/inbox', 'Все диалоги. Один инбокс.'],
  ['/history', 'История действий'],
] as const;

for (const [path, title] of sections) {
  test(`section ${path} renders with data and fits the viewport`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await authenticate(page);
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    if (path === '/')
      await expect(
        page.getByText('Диалоги · Основной', { exact: true }),
      ).toBeVisible();
    if (path === '/scenarios')
      await expect(
        page.getByPlaceholder('Напишите точный текст сообщения...'),
      ).toHaveValue(steps[0].text);
    if (path === '/prompts')
      await expect(
        page.getByRole('heading', { name: 'Обсуждение продукта' }),
      ).toBeVisible();
    if (path === '/inbox')
      await expect(
        page.getByText('Обсуждение проекта', { exact: true }),
      ).toBeVisible();
    if (path === '/inbox') {
      await page.getByText('Обсуждение проекта', { exact: true }).click();
      await expect(page.getByPlaceholder('Сообщение...')).toBeVisible();
    }
    if (path === '/history')
      await expect(
        page.getByText('Сообщение отправлено', { exact: true }).first(),
      ).toBeVisible();
    await expectFitsViewport(page);
    expect(errors).toEqual([]);
    if (process.env.CAPTURE_UI)
      await page.screenshot({
        path: `test-results/preview-${path.slice(1) || 'accounts'}-${test.info().project.name}.png`,
        fullPage: true,
      });
  });
}

test('login submits the existing API contract and displays errors', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'С возвращением' }),
  ).toBeVisible();
  await expectFitsViewport(page);
  if (process.env.CAPTURE_UI)
    await page.screenshot({
      path: `test-results/preview-login-${test.info().project.name}.png`,
    });
  const submit = page.getByRole('button', { name: 'Войти в TgActor' });
  await expect(submit).toBeDisabled();
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Неверный пароль' } }),
  );
  await page.getByLabel('Пароль').fill('wrong-password');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('Неверный пароль');
  await page.unroute('**/api/auth/login');
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ json: { access_token: 'isolated-ui-test-token' } }),
  );
  const request = page.waitForRequest('**/api/auth/login');
  await page.getByLabel('Пароль').fill('correct-password');
  await submit.click();
  expect((await request).postDataJSON()).toEqual({
    password: 'correct-password',
  });
  await expect(
    page.getByRole('heading', { name: 'Ваши аккаунты' }),
  ).toBeVisible();
});

test('account search, status filters and phone authentication remain usable', async ({
  page,
}) => {
  await authenticate(page);
  await page.goto('/');
  await expect(
    page.getByText('Диалоги · Основной', { exact: true }),
  ).toBeVisible();
  await page
    .getByPlaceholder('Поиск по имени, @username, телефону, ID...')
    .fill('Реакции');
  await expect(
    page.getByText('Профиль Реакции', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Диалоги · Основной', { exact: true }),
  ).toHaveCount(0);
  await page
    .getByPlaceholder('Поиск по имени, @username, телефону, ID...')
    .clear();
  await page.getByRole('button', { name: /Требуют внимания/ }).click();
  await expect(page.getByText('Профиль Резерв', { exact: true })).toBeVisible();
  await expect(page.getByText('Профиль Реакции', { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'По номеру телефона' }).click();
  await expect(page.getByPlaceholder('+79991234567')).toBeVisible();
  await page.getByPlaceholder('+79991234567').fill('+4915174286039');
  const request = page.waitForRequest('**/api/accounts/send-code');
  await page.getByRole('button', { name: 'Запросить код в Telegram' }).click();
  expect((await request).postDataJSON()).toMatchObject({
    phone: '+4915174286039',
  });
});

test('themes persist after reload', async ({ page }) => {
  await authenticate(page);
  await page.goto('/');
  for (const theme of [
    'dark-charcoal',
    'dark-crimson',
    'deep-indigo',
    'light',
  ]) {
    await chooseTheme(page, theme);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(theme);
  }
  await chooseTheme(page, 'dark-charcoal');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe('dark-charcoal');
  await expect(
    page.getByRole('heading', { name: 'Ваши аккаунты' }),
  ).toBeVisible();
});

test('workspace navigation is available on desktop and mobile', async ({
  page,
  isMobile,
}) => {
  await authenticate(page);
  await page.goto('/');
  if (isMobile) {
    await page.getByRole('button', { name: 'Открыть навигацию' }).click();
    await expect(page.getByRole('dialog', { name: 'Навигация' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Закрыть навигацию' }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Открыть навигацию' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Открыть навигацию' }).click();
  }
  await page.getByRole('link', { name: 'Пулы аккаунтов', exact: true }).click();
  await expect(page).toHaveURL('/pools');
  await expect(
    page.getByRole('heading', { name: 'Роли ваших аккаунтов' }),
  ).toBeVisible();
  if (isMobile)
    await expect(page.getByRole('dialog', { name: 'Навигация' })).toHaveCount(
      0,
    );
  else {
    await page.getByRole('button', { name: 'Свернуть навигацию' }).click();
    await page.getByRole('link', { name: 'Сценарии', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Сценарии диалогов' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Развернуть навигацию' }).click();
  }
});

test('scenario edits use the existing save endpoint', async ({ page }) => {
  await authenticate(page);
  await page.goto('/scenarios');
  const message = page.getByPlaceholder('Напишите точный текст сообщения...');
  await expect(message).toHaveValue(steps[0].text);
  await message.fill('Как вы оцениваете результаты после обновления?');
  const request = page.waitForRequest('**/api/scenarios/1/steps/bulk');
  await page
    .getByRole('button', { name: 'Сохранить шаги', exact: true })
    .click();
  expect((await request).postDataJSON()).toMatchObject({
    steps: [
      { role_id: 1, text: 'Как вы оцениваете результаты после обновления?' },
    ],
  });
  await expect(
    page.getByText('Диалоговые шаги успешно сохранены!', { exact: true }),
  ).toBeVisible();
});

test('inbox opens a conversation and sends through the original API', async ({
  page,
}) => {
  await authenticate(page);
  await page.goto('/inbox');
  await page.getByText('Обсуждение проекта', { exact: true }).click();
  await expect(page.getByPlaceholder('Сообщение...')).toBeVisible();
  await page
    .getByPlaceholder('Сообщение...')
    .fill('Да, давайте обсудим детали.');
  const request = page.waitForRequest('**/api/inbox/send');
  await page.getByPlaceholder('Сообщение...').press('Enter');
  const body = (await request).postData() || '';
  expect(body).toContain('Да, давайте обсудим детали.');
  expect(body).toContain('101');
  await expect(page.getByPlaceholder('Сообщение...')).toHaveValue('');
  await expectFitsViewport(page);
});

test('empty accounts and server failures have distinct states', async ({
  page,
}) => {
  await authenticate(page);
  await page.route('**/api/accounts', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Аккаунты отсутствуют' }),
  ).toBeVisible();
  await page.route('**/api/accounts', (route) =>
    route.fulfill({ status: 500, json: { detail: 'Unavailable' } }),
  );
  await page.getByRole('button', { name: 'Обновить статус' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось загрузить аккаунты',
    { timeout: 15000 },
  );
  await expect(
    page.getByRole('button', { name: 'Повторить', exact: true }),
  ).toBeVisible();
});

test('all sections fit compact phones and tablet widths', async ({
  page,
  isMobile,
}) => {
  test.slow();
  await authenticate(page);
  for (const width of isMobile ? [360, 375] : [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of sections) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      if (path === '/channels')
        await expect(page.getByPlaceholder('Поиск канала...')).toBeVisible();
      if (path === '/scenarios')
        await expect(
          page.getByPlaceholder('Напишите точный текст сообщения...'),
        ).toHaveValue(steps[0].text);
      await expectFitsViewport(page);
    }
  }
});

test('prompt deletion uses a styled confirmation and preserves cancellation', async ({
  page,
}) => {
  await authenticate(page);
  await page.goto('/prompts');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE') requests.push(request.url());
  });
  await page
    .getByRole('button', { name: 'Удалить шаблон', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Удалить шаблон?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toEqual([]);
  await page
    .getByRole('button', { name: 'Удалить шаблон', exact: true })
    .click();
  const request = page.waitForRequest(
    (request) =>
      request.method() === 'DELETE' && request.url().endsWith('/api/prompts/1'),
  );
  await dialog.getByRole('button', { name: 'Удалить', exact: true }).click();
  await request;
  await expect(dialog).toHaveCount(0);
});
