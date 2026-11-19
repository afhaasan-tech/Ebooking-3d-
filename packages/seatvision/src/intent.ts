/**
 * Deterministic Arabic (incl. Kuwaiti dialect) + English seat-request parser.
 * Produces a structured intent only. It never creates seats, prices or availability.
 */
export type CategoryCode = 'VIP' | 'PREMIUM' | 'STANDARD' | 'ECONOMY';

export interface SeatIntent {
  quantity: number;
  together: boolean;
  /** Total budget for the whole group, in fils. */
  maxTotalFils: number | null;
  preferCentre: boolean;
  avoidEdge: boolean;
  preferClose: boolean;
  bestView: boolean;
  cheapest: boolean;
  categories: CategoryCode[];
  accessible: boolean;
  tier: 'floor' | 'balcony' | null;
  /** Which phrases were recognised, for transparent explanations. */
  matched: string[];
  language: 'ar' | 'en';
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const norm = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ـ]/g, '')
    .toLowerCase();

const WORD_NUMS: Array<[RegExp, number]> = [
  [/\b(one|single)\b|واحد/, 1],
  [/\b(two|pair|couple)\b|كرسيين|مقعدين|تذكرتين|اثنين|ثنين|زوج/, 2],
  [/\bthree\b|ثلاث|ثلاثه/, 3],
  [/\bfour\b|اربع|اربعه/, 4],
  [/\bfive\b|خمس|خمسه/, 5],
  [/\bsix\b|ست\b|سته/, 6],
];

const SEAT_WORD = '(?:كراسي|كرسي|مقاعد|مقعد|تذاكر|تذكره|seats?|tickets?|people|persons?|اشخاص|شخص|نفر)';

export function parseSeatIntent(raw: string): SeatIntent {
  const q = norm(raw);
  const language: 'ar' | 'en' = /[؀-ۿ]/.test(raw) ? 'ar' : 'en';
  const matched: string[] = [];

  // ---- budget (total) ----
  let maxTotalFils: number | null = null;
  const money = new RegExp(`(\\d+(?:\\.\\d{1,3})?)\\s*(?:kwd|kd|دينار|د\\.ك|دك)|(?:kwd|kd)\\s*(\\d+(?:\\.\\d{1,3})?)`).exec(q);
  const budgetWord = /(?:ميزانيه|ميزانيتي|budget|under|below|max|less than|تحت|اقل من|ما يزيد|بحدود|حدود|within)\s*(\d+(?:\.\d{1,3})?)/.exec(q);
  const amount = money?.[1] ?? money?.[2] ?? budgetWord?.[1];
  if (amount) {
    const [w, f = ''] = amount.split('.');
    maxTotalFils = Number(w) * 1000 + Number(f.padEnd(3, '0'));
    matched.push('budget');
  }

  // ---- quantity ----
  let quantity = 0;
  const qty = new RegExp(`(\\d+)\\s*${SEAT_WORD}|${SEAT_WORD}\\s*(\\d+)`).exec(q);
  if (qty) {
    const n = Number(qty[1] ?? qty[2]);
    if (!amount || String(n) !== amount) quantity = n;
  }
  if (!quantity) {
    for (const [re, n] of WORD_NUMS) {
      if (re.test(q)) {
        quantity = n;
        break;
      }
    }
  }
  if (!quantity) {
    // "for my family of 4", "احنا 3"
    const bare = /(?:احنا|نحن|we are|for)\s*(\d)\b/.exec(q);
    if (bare) quantity = Number(bare[1]);
  }
  if (quantity) matched.push('quantity');
  quantity = Math.min(Math.max(quantity || 1, 1), 6);

  const has = (re: RegExp, tag: string) => {
    const ok = re.test(q);
    if (ok) matched.push(tag);
    return ok;
  };

  const avoidEdge = has(/(?:مو|مب|مش|بدون)\s*(?:وايد\s*|كثير\s*)?(?:(?:علي|ع)\s*)?(?:ال)?طرف|بعيد عن (?:ال)?طرف|not\s+(?:too\s+(?:far\s+)?)?(?:on\s+the\s+)?(?:edge|side)|avoid\s+(?:the\s+)?(?:edge|side)s?|no\s+side/, 'avoid_edge');
  const preferCentre = has(/بالنص|في النص|بالوسط|وسط|النص|\bcent(?:re|er)\b|\bmiddle\b/, 'centre');
  const together = quantity > 1 ? true : false;
  if (quantity > 1) has(/يم بعض|جنب بعض|مع بعض|ورا بعض|together|adjacent|next to each other|side by side/, 'together');
  const preferClose = has(/قريب|قدام|الصفوف الاولي|close|near|front|first rows?/, 'close');
  const bestView = has(/احسن|افضل|best|top|great view|اطلاله|اطلالة|رؤيه/, 'best_view');
  const cheapest = has(/ارخص|رخيص|cheap|cheapest|budget seats|اقتصادي/, 'cheapest');
  const accessible = has(/كرسي متحرك|متحرك|ذوي الاحتياجات|اعاقه|wheelchair|accessible|disab/, 'accessible');

  const categories: CategoryCode[] = [];
  if (has(/\bvip\b|كبار الشخصيات|في اي بي/, 'cat_vip')) categories.push('VIP');
  if (has(/premium|بريميوم|مميز/, 'cat_premium')) categories.push('PREMIUM');
  if (has(/standard|عادي/, 'cat_standard')) categories.push('STANDARD');
  if (has(/economy|اقتصادي/, 'cat_economy')) categories.push('ECONOMY');

  let tier: SeatIntent['tier'] = null;
  if (has(/balcony|بلكون|البلكونه|فوق/, 'balcony')) tier = 'balcony';
  else if (has(/floor|ارضي|تحت عند المسرح/, 'floor')) tier = 'floor';

  return { quantity, together, maxTotalFils, preferCentre, avoidEdge, preferClose, bestView, cheapest, categories, accessible, tier, matched, language };
}
