// AI-помічник на базі Claude (Anthropic API).
// Ключ API зберігається лише у вашому браузері й надсилається напряму в Anthropic.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — найрозумніша (рекомендовано)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — швидша і дешевша' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — найдешевша' },
];

export class AIError extends Error {}

function makeClient(settings, fetchImpl) {
  if (!settings.apiKey) throw new AIError('Додайте API-ключ Anthropic у вкладці «Налаштування».');
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

// Серверний «запасний» маршрут на випадок відмови моделі (є для Opus і Sonnet).
function fallbackParams(model) {
  if (model.startsWith('claude-haiku')) return {};
  return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
}

function explainError(e) {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AIError('Невірний API-ключ. Перевірте його в Налаштуваннях.');
  if (e instanceof Anthropic.PermissionDeniedError) return new AIError('Ключ не має доступу до цієї моделі або функції.');
  if (e instanceof Anthropic.RateLimitError) return new AIError('Забагато запитів або закінчився баланс. Спробуйте за хвилину / поповніть рахунок в console.anthropic.com.');
  if (e instanceof Anthropic.BadRequestError) return new AIError('Запит відхилено: ' + e.message);
  if (e instanceof Anthropic.APIConnectionError) return new AIError('Немає з’єднання з Anthropic. Перевірте інтернет.');
  if (e instanceof Anthropic.APIError) return new AIError('Помилка AI: ' + e.message);
  return new AIError(e?.message || String(e));
}

function checkStop(msg) {
  if (msg.stop_reason === 'refusal') throw new AIError('Модель відмовилася обробляти цей запит. Спробуйте переформулювати.');
  if (msg.stop_reason === 'max_tokens') throw new AIError('Відповідь вийшла задовгою. Спробуйте надіслати менше позицій за раз.');
}

const UNIT_ENUM = z.enum(['g', 'kg', 'ml', 'l', 'pcs']);

function ingredientCatalog(ingredients) {
  if (!ingredients.length) return '(список порожній)';
  return ingredients.map((i) => `- id=${i.id} | ${i.name} | одиниця: ${i.baseUnit}`).join('\n');
}

const SYSTEM_BASE =
  'Ти — помічник з обліку для невеликого українського бренду печива в американському стилі. ' +
  'Відповідай українською. Будь точним з числами: не вигадуй ціни чи кількості, яких немає у вхідних даних.';

async function parseCall(settings, { system, content, schema, effort = 'low' }, fetchImpl) {
  const client = makeClient(settings, fetchImpl);
  try {
    const msg = await client.beta.messages.parse({
      model: settings.model || 'claude-opus-5-5',
      max_tokens: 16000,
      ...fallbackParams(settings.model || 'claude-opus-5-5'),
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system: SYSTEM_BASE + '\n\n' + system,
      messages: [{ role: 'user', content }],
    });
    checkStop(msg);
    if (!msg.parsed_output) throw new AIError('AI повернув відповідь у неочікуваному форматі. Спробуйте ще раз.');
    return msg.parsed_output;
  } catch (e) {
    throw explainError(e);
  }
}

// ───────── 1. Список покупок / чек → ціни інгредієнтів ─────────

const PurchaseSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe('Назва товару, як у чеку, але охайно'),
      matchedIngredientId: z.string().nullable().describe('id інгредієнта з каталогу, якщо це той самий продукт; інакше null'),
      qty: z.number().describe('Загальна кількість купленого товару в одиницях unit (наприклад 2 пачки по 200 г = 400, unit g)'),
      unit: UNIT_ENUM,
      totalPrice: z.number().describe('Скільки всього заплачено за цю позицію, грн'),
      category: z.enum(['Основа', 'Начинка', 'Декор', 'Пакування', 'Інше']),
    }),
  ),
  comment: z.string().describe('Коротка примітка українською: що було незрозуміло або що варто перевірити'),
});

/**
 * @param {{text?: string, image?: {data: string, mediaType: string}}} input
 */
export async function parsePurchases(settings, ingredients, input, fetchImpl) {
  const content = [];
  if (input.image) content.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.data } });
  content.push({
    type: 'text',
    text:
      `Каталог моїх інгредієнтів:\n${ingredientCatalog(ingredients)}\n\n` +
      (input.text ? `Мій список покупок / чек:\n"""\n${input.text}\n"""\n\n` : '') +
      (input.image ? 'На фото — чек або список покупок.\n\n' : '') +
      'Витягни кожну куплену позицію. Перерахуй кількість у загальну (кількість упаковок × вага упаковки). ' +
      'Для борошна/цукру/масла тощо використовуй g або kg, для рідин ml або l, для яєць, коробок, пакетів — pcs. ' +
      'Якщо позиція — це той самий продукт, що й у каталозі (навіть якщо назва трохи інша), вкажи його id. ' +
      'Пропусти позиції, що не стосуються виробництва (наприклад пакет-майка в магазині), і згадай це в comment.',
  });
  return parseCall(settings, {
    system: 'Ти розбираєш чеки та списки покупок у структуровані дані для обліку собівартості.',
    content,
    schema: PurchaseSchema,
  }, fetchImpl);
}

// ───────── 2. Рецепт текстом → техкарта ─────────

const RecipeSchema = z.object({
  name: z.string(),
  yieldQty: z.number().describe('Скільки штук печива виходить з цього замісу'),
  items: z.array(
    z.object({
      name: z.string(),
      matchedIngredientId: z.string().nullable(),
      qty: z.number().describe('Кількість на весь заміс в одиницях unit'),
      unit: UNIT_ENUM,
      perPiece: z.boolean().describe('true лише для пакування/наліпок, які йдуть по 1 на кожне печиво'),
      category: z.enum(['Основа', 'Начинка', 'Декор', 'Пакування', 'Інше']),
    }),
  ),
  note: z.string().describe('Короткий опис технології, якщо він був у тексті'),
});

export async function parseRecipe(settings, ingredients, text, fetchImpl) {
  return parseCall(settings, {
    system: 'Ти перетворюєш рецепти на техкарти для розрахунку собівартості.',
    content: [{
      type: 'text',
      text:
        `Каталог моїх інгредієнтів:\n${ingredientCatalog(ingredients)}\n\nРецепт:\n"""\n${text}\n"""\n\n` +
        'Склади техкарту. Переведи «склянки», «ложки» тощо в грами/мілілітри за стандартними мірами й вкажи це в note. ' +
        'Яйця — у штуках. Якщо інгредієнт є в каталозі — вкажи його id. Якщо вихід не вказано — оцінь його й скажи про це в note.',
    }],
    schema: RecipeSchema,
    effort: 'medium',
  }, fetchImpl);
}

// ───────── 3. Середні ціни в регіоні (з пошуком в інтернеті) ─────────

const PriceSchema = z.object({
  items: z.array(
    z.object({
      ingredientId: z.string(),
      packQty: z.number().describe('Розмір типової упаковки в одиницях unit'),
      unit: UNIT_ENUM,
      packPrice: z.number().describe('Середня ціна такої упаковки, грн'),
      found: z.boolean().describe('false, якщо надійної ціни знайти не вдалося'),
      source: z.string().describe('Де знайдено: назви магазинів/сайтів'),
    }),
  ),
  comment: z.string(),
});

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(raw);
}

export async function searchPrices(settings, ingredients, city, fetchImpl) {
  const client = makeClient(settings, fetchImpl);
  const model = settings.model || 'claude-opus-5-5';
  const list = ingredients.map((i) => `- id=${i.id} | ${i.name} | одиниця: ${i.baseUnit}`).join('\n');
  const messages = [{
    role: 'user',
    content:
      `Знайди актуальні роздрібні/дрібнооптові ціни в Україні (регіон: ${city || 'Україна'}) на ці інгредієнти для кондитерського виробництва:\n${list}\n\n` +
      'Шукай у великих мережах і кондитерських магазинах (Сільпо, АТБ, Novus, Metro, Ашан, Zakaz.ua, Rozetka, спеціалізовані магазини для кондитерів). ' +
      'Для кожного інгредієнта вкажи типовий розмір упаковки й середню ціну за неї в гривнях.\n\n' +
      'У самому кінці відповіді дай ЛИШЕ JSON у блоці ```json з такою структурою:\n' +
      '{"items":[{"ingredientId":"...","packQty":1000,"unit":"g","packPrice":45.5,"found":true,"source":"Сільпо, Metro"}],"comment":"..."}\n' +
      'unit — одне з: g, kg, ml, l, pcs.',
  }];
  const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: Math.min(4 + ingredients.length, 20), user_location: { type: 'approximate', country: 'UA', city: city || undefined } }];
  try {
    let msg;
    for (let i = 0; i < 6; i++) {
      // Стрімінг — щоб довгий пошук не впирався в таймаут HTTP
      msg = await client.beta.messages.stream({
        model,
        max_tokens: 32000,
        ...fallbackParams(model),
        output_config: { effort: 'medium' },
        system: SYSTEM_BASE,
        tools,
        messages,
      }).finalMessage();
      // pause_turn — сервер призупинив довгий пошук; продовжуємо з того ж місця
      if (msg.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: msg.content });
    }
    checkStop(msg);
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    let data;
    try {
      data = PriceSchema.parse(extractJson(text));
    } catch {
      throw new AIError('Не вдалося прочитати ціни з відповіді AI. Спробуйте ще раз або з меншою кількістю інгредієнтів.');
    }
    return data;
  } catch (e) {
    throw explainError(e);
  }
}

// ───────── 4. Бізнес-аналітик: питання по ваших даних ─────────

export async function askAnalyst(settings, contextJson, question, history = [], fetchImpl) {
  const client = makeClient(settings, fetchImpl);
  const model = settings.model || 'claude-opus-5-5';
  try {
    const msg = await client.beta.messages.stream({
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: SYSTEM_BASE + '\nТи також бізнес-аналітик і технолог. Давай конкретні, практичні поради з цифрами. Форматуй відповідь коротко: абзаци й списки.' },
        { type: 'text', text: 'Поточні дані бізнесу (JSON):\n' + contextJson, cache_control: { type: 'ephemeral' } },
      ],
      messages: [...history, { role: 'user', content: question }],
    }).finalMessage();
    checkStop(msg);
    return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  } catch (e) {
    throw explainError(e);
  }
}

/** Зменшує фото перед відправкою (економія токенів і ліміт розміру). */
export async function imageToBase64(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL('image/jpeg', 0.85);
    return { data: dataUrl.split(',')[1], mediaType: 'image/jpeg', preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
