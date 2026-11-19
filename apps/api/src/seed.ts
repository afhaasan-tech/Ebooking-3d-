import { generateDemoVenue, scoreVenue, computeMetrics, buildFrontSeatIndex, generateDemoExhibition, scoreBooth } from '@ebooking/seatvision';
import type { Db, Tx } from './db';
import { createLocalUser } from './auth';

/**
 * DEMO SEED. Every venue, organizer, event and booking here is fictional.
 * Demo credentials are local test values only (see README "Demo accounts").
 */
export const DEMO_PASSWORD = 'Demo-Pass-2026';
export const DEMO_USERS = {
  customer: { id: '00000000-0000-4000-a000-000000000001', email: 'customer@demo.ebooking.test', name: 'عميل تجريبي' },
  owner: { id: '00000000-0000-4000-a000-000000000002', email: 'owner@gulfstage.demo.test', name: 'مالك Gulf Stage' },
  manager: { id: '00000000-0000-4000-a000-000000000003', email: 'manager@gulfstage.demo.test', name: 'مدير Gulf Stage' },
  staff: { id: '00000000-0000-4000-a000-000000000004', email: 'staff@gulfstage.demo.test', name: 'موظف بوابة' },
  otherOwner: { id: '00000000-0000-4000-a000-000000000005', email: 'owner@desertlights.demo.test', name: 'مالك Desert Lights' },
  admin: { id: '00000000-0000-4000-a000-000000000006', email: 'admin@ebooking.demo.test', name: 'مشرف المنصة' },
  buyers: { id: '00000000-0000-4000-a000-000000000007', email: 'demo-buyers@demo.ebooking.test', name: 'مشترون تجريبيون' },
} as const;

export const ORG_GULF = '10000000-0000-4000-a000-000000000001';
export const ORG_DESERT = '10000000-0000-4000-a000-000000000002';

// deterministic RNG for reproducible demo inventory
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const day = 86400000;
const iso = (d: number, h: number, m = 0) => {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  // Kuwait is UTC+3
  return new Date(base.getTime() + d * day + (h - 3) * 3600000 + m * 60000).toISOString();
};

export async function seed(db: Db, opts: { presell?: boolean } = {}) {
  const presell = opts.presell ?? true;
  await db.tx(async (tx) => {
    for (const [k, u] of Object.entries(DEMO_USERS)) {
      await createLocalUser(tx, u.email, DEMO_PASSWORD, u.name, k === 'admin' ? 'platform_admin' : 'customer', u.id);
    }
    await tx.query(`insert into public.organizations(id, name, slug) values ($1, 'Gulf Stage Productions (Demo)', 'gulf-stage-demo'), ($2, 'Desert Lights Events (Demo)', 'desert-lights-demo')`, [ORG_GULF, ORG_DESERT]);
    await tx.query(
      `insert into public.organization_members(org_id, user_id, role) values ($1,$2,'owner'),($1,$3,'manager'),($1,$4,'staff'),($5,$6,'owner')`,
      [ORG_GULF, DEMO_USERS.owner.id, DEMO_USERS.manager.id, DEMO_USERS.staff.id, ORG_DESERT, DEMO_USERS.otherOwner.id],
    );
    // SaaS plans: prices intentionally null until commercially approved ("Price on Request")
    const plans = await tx.query<{ id: string; code: string }>(
      `insert into public.organizer_plans(code, name_ar, name_en, annual_fee_fils, commission_bps, features) values
        ('starter','الأساسية','Starter', null, null, '{"maxEvents":5,"seatvision":true}'),
        ('pro','الاحترافية','Professional', null, null, '{"maxEvents":50,"seatvision":true,"exhibitions":true}'),
        ('enterprise','المؤسسات','Enterprise', null, null, '{"maxEvents":null,"customQuotes":true}')
       returning id, code`,
    );
    const pro = plans.find((p) => p.code === 'pro')!.id;
    await tx.query(`insert into public.organizer_subscriptions(org_id, plan_id, status, current_period_end) values ($1,$3,'trial', (now() + interval '45 days')::date), ($2,$3,'active', (now() + interval '300 days')::date)`, [ORG_GULF, ORG_DESERT, pro]);
    await tx.query(`insert into public.platform_settings(key, value) values ('fees', '{"defaultServiceFeeBps":200,"defaultServiceFeeFixedFils":250,"defaultCommissionBps":null}'), ('demo_mode', 'true')`);

    // ─── theatre venue + layout v1 with precomputed SeatVision metrics ───
    const venue = generateDemoVenue(1);
    const scores = scoreVenue(venue);
    const front = buildFrontSeatIndex(venue.seats);
    const v = await tx.one<{ id: string }>(
      `insert into public.venues(code, kind, name_ar, name_en, fictional) values ($1,'theatre',$2,$3,true) returning id`,
      [venue.venueCode, venue.nameAr, venue.nameEn],
    );
    const layout = await tx.one<{ id: string }>(
      `insert into public.venue_layout_versions(venue_id, version, status, preview_authenticity, geometry, published_at)
       values ($1, 1, 'published', 'simulated', $2, now()) returning id`,
      [v!.id, JSON.stringify({ stage: venue.stage, arcCenter: venue.arcCenter, obstacles: venue.obstacles, bounds: venue.bounds, fictional: true })],
    );
    const layoutId = layout!.id;
    for (const s of venue.sections) {
      await tx.query(`insert into public.venue_sections values ($1,$2,$3,$4,$5,$6,$7)`, [layoutId, s.code, s.nameAr, s.nameEn, s.tier, s.defaultCategory, s.color]);
    }
    const seatRows: unknown[][] = venue.seats.map((s) => {
      const sc = scores.get(s.id)!;
      const m = computeMetrics(s, venue, front.get(s.id));
      return [layoutId, s.id, s.sectionCode, s.row, s.number, s.tier, s.position.x, s.position.y, s.position.z, s.yaw, s.eyeHeight, s.aisle, s.accessible ?? null, sc.score, m.distance, m.horizontalAngleDeg, m.verticalAngleDeg, m.centreOffset, m.cValue, m.blockedBy];
    });
    await bulkInsert(tx, 'public.venue_seats', ['layout_version_id', 'seat_code', 'section_code', 'row_label', 'seat_number', 'tier', 'x', 'y', 'z', 'yaw', 'eye_height', 'aisle', 'accessible', 'view_score', 'distance_m', 'h_angle_deg', 'v_angle_deg', 'centre_offset_m', 'c_value_m', 'blocked_by'], seatRows);

    // ─── other venues ───
    const hall = await tx.one<{ id: string }>(`insert into public.venues(code, kind, name_ar, name_en, fictional) values ('DEMO-COMMUNITY-HALL','open_space','قاعة المجتمع التجريبية','Demo Community Hall',true) returning id`);
    const expoLayout = generateDemoExhibition();
    const expoVenue = await tx.one<{ id: string }>(`insert into public.venues(code, kind, name_ar, name_en, fictional) values ($1,'exhibition_hall',$2,$3,true) returning id`, [expoLayout.code, expoLayout.nameAr, expoLayout.nameEn]);
    const expoLv = await tx.one<{ id: string }>(
      `insert into public.venue_layout_versions(venue_id, version, status, preview_authenticity, geometry, published_at) values ($1,1,'published','simulated',$2,now()) returning id`,
      [expoVenue!.id, JSON.stringify({ hall: expoLayout.hall, entrances: expoLayout.entrances, exits: expoLayout.exits, mainAisles: expoLayout.mainAisles, fictional: true })],
    );

    // ─── events ───
    const policyAr = 'التذاكر غير قابلة للاسترداد إلا في حال إلغاء العرض من المنظم. (سياسة تجريبية)';
    const policyEn = 'Tickets are non-refundable unless the organizer cancels the show. (Demo policy)';
    const accAr = 'تتوفر مساحات تجريبية للكراسي المتحركة في الصف الأخير (عادي وسط). البيانات تجريبية وغير موثّقة.';
    const accEn = 'Demo wheelchair spaces in the last row of Standard Centre. Demo data, not verified.';

    const theatreEvents = [
      { slug: 'mubarakiya-nights', cat: 'theatre', mode: 'theatre', ar: 'ليالي المباركية — مسرحية كوميدية (عرض تجريبي)', en: 'Mubarakiya Nights — Comedy Play (Demo)', dar: 'مسرحية عائلية خيالية عن تاجر قديم في سوق المباركية يحاول إنقاذ دكانه بخطة مضحكة.', den: 'A fictional family comedy about an old Mubarakiya merchant hatching a hilarious plan to save his shop.', color: '#d4a64a', perfs: [[3, 20], [4, 20], [10, 21]], prices: [45000, 30000, 20000, 10000] },
      { slug: 'echoes-of-the-gulf', cat: 'concert', mode: 'concert', ar: 'أصداء الخليج — حفل موسيقي (عرض تجريبي)', en: 'Echoes of the Gulf — Live Concert (Demo)', dar: 'أمسية موسيقية خيالية لفرقة تجريبية تمزج العود بالإيقاعات الحديثة.', den: 'A fictional evening blending oud with modern rhythms by a demo band.', color: '#7aa8d8', perfs: [[7, 21], [8, 21]], prices: [55000, 35000, 22000, 12000] },
    ];
    for (const ev of theatreEvents) {
      const e = await tx.one<{ id: string }>(
        `insert into public.events(org_id, slug, category, inventory_type, title_ar, title_en, description_ar, description_en, venue_id, layout_version_id, status, demo, stage_mode, service_fee_bps, service_fee_fixed_fils, max_per_order, cancellation_policy_ar, cancellation_policy_en, accessibility_ar, accessibility_en, accent_color, age_restriction)
         values ($1,$2,$3,'assigned_seat',$4,$5,$6,$7,$8,$9,'published',true,$10,200,250,6,$11,$12,$13,$14,$15,$16) returning id`,
        [ORG_GULF, ev.slug, ev.cat, ev.ar, ev.en, ev.dar, ev.den, v!.id, layoutId, ev.mode, policyAr, policyEn, accAr, accEn, ev.color, ev.cat === 'concert' ? '+12' : null],
      );
      const cats = await tx.query<{ id: string; code: string }>(
        `insert into public.ticket_categories(event_id, code, name_ar, name_en, price_fils, color) values
          ($1,'VIP','كبار الشخصيات','VIP',$2,'#d4a64a'),($1,'PREMIUM','بريميوم','Premium',$3,'#b98a3c'),
          ($1,'STANDARD','عادي','Standard',$4,'#6f7d8c'),($1,'ECONOMY','اقتصادي','Economy',$5,'#4a5a6a') returning id, code`,
        [e!.id, ...ev.prices],
      );
      const catByCode = Object.fromEntries(cats.map((c) => [c.code, c.id]));
      for (const s of venue.sections) await tx.query(`insert into public.pricing_rules values ($1,$2,$3)`, [e!.id, s.code, catByCode[s.defaultCategory]]);
      for (const [d, h] of ev.perfs) {
        const p = await tx.one<{ id: string }>(`insert into public.performances(event_id, starts_at, ends_at, sales_start, sales_end) values ($1,$2,$3, now() - interval '1 day', $2) returning id`, [e!.id, iso(d, h), iso(d, h + 2, 30)]);
        const inv = venue.seats.map((s) => [p!.id, s.id, catByCode[s.defaultCategory], 'available']);
        await bulkInsert(tx, 'public.performance_seat_inventory', ['performance_id', 'seat_code', 'category_id', 'status'], inv);
        // a few seats blocked for a (fictional) camera platform
        await tx.query(`update public.performance_seat_inventory set status='blocked' where performance_id=$1 and seat_code in ('STC-K-1','STC-K-2')`, [p!.id]);
      }
    }

    // general admission comedy (Gulf Stage)
    const ga = await tx.one<{ id: string }>(
      `insert into public.events(org_id, slug, category, inventory_type, title_ar, title_en, description_ar, description_en, venue_id, status, demo, service_fee_bps, service_fee_fixed_fils, max_per_order, accent_color, cancellation_policy_ar, cancellation_policy_en)
       values ($1,'diwaniya-standup','comedy','general_admission','ضحكة ديوانية — ستاند أب (عرض تجريبي)','Diwaniya Laughs — Stand-up (Demo)','أمسية ستاند أب خيالية. دخول عام بدون كراسي مرقمة.','A fictional stand-up night. General admission, unassigned seating.',$2,'published',true,200,250,10,'#e07a5f',$3,$4) returning id`,
      [ORG_GULF, hall!.id, policyAr, policyEn],
    );
    const gaCat = await tx.one<{ id: string }>(`insert into public.ticket_categories(event_id, code, name_ar, name_en, price_fils) values ($1,'GA','دخول عام','General Admission',8000) returning id`, [ga!.id]);
    for (const d of [5, 12]) {
      const p = await tx.one<{ id: string }>(`insert into public.performances(event_id, starts_at, sales_start, sales_end) values ($1,$2, now() - interval '1 day', $2) returning id`, [ga!.id, iso(d, 21, 30)]);
      await tx.query(`insert into public.capacity_inventory(performance_id, category_id, capacity) values ($1,$2,150)`, [p!.id, gaCat!.id]);
    }

    // time-slot workshop (Desert Lights — a DIFFERENT tenant)
    const ws = await tx.one<{ id: string }>(
      `insert into public.events(org_id, slug, category, inventory_type, title_ar, title_en, description_ar, description_en, venue_id, status, demo, service_fee_bps, service_fee_fixed_fils, max_per_order, accent_color)
       values ($1,'arabic-calligraphy-workshop','workshop','time_slot','ورشة الخط العربي للمبتدئين (تجريبي)','Arabic Calligraphy for Beginners (Demo)','ورشة خيالية بجلسات محدودة العدد.','A fictional workshop with limited-capacity sessions.',$2,'published',true,0,250,4,'#81b29a') returning id`,
      [ORG_DESERT, hall!.id],
    );
    const wsCat = await tx.one<{ id: string }>(`insert into public.ticket_categories(event_id, code, name_ar, name_en, price_fils) values ($1,'SEAT','مقعد في الورشة','Workshop place',15000) returning id`, [ws!.id]);
    for (const [d, h, lAr, lEn] of [[6, 10, 'الجلسة الصباحية', 'Morning session'], [6, 16, 'جلسة العصر', 'Afternoon session'], [13, 10, 'الجلسة الصباحية', 'Morning session']] as const) {
      const p = await tx.one<{ id: string }>(`insert into public.performances(event_id, starts_at, sales_start, sales_end, label_ar, label_en) values ($1,$2, now() - interval '1 day', $2, $3, $4) returning id`, [ws!.id, iso(d, h), lAr, lEn]);
      await tx.query(`insert into public.capacity_inventory(performance_id, category_id, capacity) values ($1,$2,20)`, [p!.id, wsCat!.id]);
    }

    // exhibition (Gulf Stage) — booth prices left NULL = Price on Request
    const ex = await tx.one<{ id: string }>(
      `insert into public.events(org_id, slug, category, inventory_type, title_ar, title_en, description_ar, description_en, venue_id, layout_version_id, status, demo, accent_color)
       values ($1,'small-business-expo','exhibition','exhibition_booth','معرض المشاريع الصغيرة (تجريبي)','Small Business Expo (Demo)','معرض خيالي لأصحاب المشاريع الصغيرة. مخطط القاعة تجريبي ولا يمثل أي مول حقيقي.','A fictional expo for small businesses. The hall plan is simulated and does not represent any real mall.',$2,$3,'published',true,'#c9a0dc') returning id`,
      [ORG_GULF, expoVenue!.id, expoLv!.id],
    );
    await tx.query(`insert into public.performances(event_id, starts_at, ends_at, sales_start, sales_end, label_ar, label_en) values ($1,$2,$3, now() - interval '1 day', $2, 'أيام المعرض', 'Expo days')`, [ex!.id, iso(20, 10), iso(22, 22)]);
    for (const b of expoLayout.booths) {
      await tx.query(
        `insert into public.exhibition_booths(event_id, booth_code, zone, width_m, depth_m, x, z, open_sides, fronts_main_aisle, dist_main_entrance_m, dist_nearest_exit_m, layout_score, status, price_fils)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null)`,
        [ex!.id, b.code, b.zone, b.width, b.depth, b.center.x, b.center.z, b.openSides, b.frontsMainAisle, b.distToMainEntrance, b.distToNearestExit, scoreBooth(b, expoLayout).score, ['A03', 'B05', 'D02'].includes(b.code) ? 'booked' : b.code === 'C06' ? 'unavailable' : 'available'],
      );
    }
  });

  if (presell) await presellDemo(db);
}

/** Simulated prior sales through the REAL booking functions, clearly marked demo. */
async function presellDemo(db: Db) {
  const rand = rng(20261119);
  const perfs = await db.query<{ id: string; event_id: string; service_fee_bps: number; service_fee_fixed_fils: number }>(
    `select p.id, p.event_id, e.service_fee_bps, e.service_fee_fixed_fils from public.performances p join public.events e on e.id = p.event_id where e.inventory_type = 'assigned_seat' order by p.starts_at`,
  );
  let n = 0;
  for (const p of perfs) {
    const seats = await db.query<{ seat_code: string; section_code: string; row_label: string; seat_number: number }>(
      `select i.seat_code, s.section_code, s.row_label, s.seat_number from public.performance_seat_inventory i
         join public.performances pf on pf.id = i.performance_id join public.events e on e.id = pf.event_id
         join public.venue_seats s on s.layout_version_id = e.layout_version_id and s.seat_code = i.seat_code
        where i.performance_id = $1 and i.status = 'available' order by s.section_code, s.row_label, s.seat_number`,
      [p.id],
    );
    const groups = 22 + Math.floor(rand() * 10);
    for (let g = 0; g < groups; g++) {
      const start = Math.floor(rand() * (seats.length - 4));
      const size = 1 + Math.floor(rand() * 4);
      const pick = seats.slice(start, start + size).filter((s, i, a) => s.section_code === a[0].section_code && s.row_label === a[0].row_label);
      if (!pick.length) continue;
      try {
        await db.tx(async (tx) => {
          const hold = await tx.one<{ id: string }>(`select app.hold_seats($1, $2, $3, null, 600, 6) as id`, [p.id, pick.map((s) => s.seat_code), DEMO_USERS.buyers.id]);
          const items = await tx.query<{ seat_code: string; category_id: string; price_fils: number }>(
            `select hi.seat_code, hi.category_id, c.price_fils from public.seat_hold_items hi join public.ticket_categories c on c.id = hi.category_id where hi.hold_id = $1`,
            [hold!.id],
          );
          const sub = items.reduce((a, i) => a + i.price_fils, 0);
          const fee = Math.floor((sub * p.service_fee_bps + 5000) / 10000) + p.service_fee_fixed_fils * items.length;
          const o = await tx.one<{ id: string }>(
            `insert into public.orders(reference, user_id, performance_id, hold_id, status, subtotal_fils, service_fee_fils, total_fils, contact_name, contact_email, contact_mobile, demo, created_at)
             values ($1,$2,$3,$4,'payment_processing',$5,$6,$7,'Demo Buyer','demo-buyers@demo.ebooking.test','+96550000000',true, now() - ($8 || ' hours')::interval) returning id`,
            [`EBK-SEED${String(++n).padStart(4, '0')}`, DEMO_USERS.buyers.id, p.id, hold!.id, sub, fee, sub + fee, String(Math.floor(rand() * 200))],
          );
          for (const i of items) await tx.query(`insert into public.order_items(order_id, seat_code, category_id, unit_price_fils) values ($1,$2,$3,$4)`, [o!.id, i.seat_code, i.category_id, i.price_fils]);
          await tx.query(`insert into public.payments(order_id, provider, method, amount_fils, status, provider_ref, idempotency_key, demo_scenario) values ($1,'demo','knet',$2,'succeeded',$3,$4,'seed')`, [o!.id, sub + fee, `SEED-${n}`, `seed-idempotency-${n}-xxxxxxxx`]);
          await tx.query(`select app.confirm_order($1)`, [o!.id]);
        });
      } catch {
        // overlapping random groups simply fail to hold — exactly what the invariant should do
      }
    }
  }
}

async function bulkInsert(tx: Tx, table: string, cols: string[], rows: unknown[][], chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(',')})`).join(',');
    await tx.query(`insert into ${table}(${cols.join(',')}) values ${values}`, params);
  }
}
