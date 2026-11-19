import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { recommendSeats, recommendBooths, type ExhibitionLayout, type InventorySeat } from '@ebooking/seatvision';
import { RecommendBody, uuid } from '@ebooking/shared';
import { parse, type Ctx } from '../app';
import { HttpError } from '../auth';
import { interpretSeatRequest } from '../ai/intent';

const CATEGORIES = ['theatre', 'concert', 'comedy', 'workshop', 'conference', 'family', 'exhibition'] as const;

export async function publicRoutes(app: FastifyInstance, { db }: Ctx) {
  // Public catalogue: only intentionally public fields of PUBLISHED events.
  app.get('/api/events', async (req) => {
    const q = parse(z.object({ category: z.enum(CATEGORIES).optional(), q: z.string().max(80).optional() }), req.query);
    const params: unknown[] = [];
    let where = `e.status = 'published'`;
    if (q.category) where += ` and e.category = $${params.push(q.category)}`;
    if (q.q) where += ` and (e.title_ar ilike $${params.push(`%${q.q}%`)} or e.title_en ilike $${params.length})`;
    return db.query(
      `select e.id, e.slug, e.category, e.inventory_type, e.title_ar, e.title_en, e.description_ar, e.description_en, e.accent_color, e.demo, e.stage_mode,
              v.name_ar as venue_ar, v.name_en as venue_en, o.name as organizer,
              (select min(price_fils) from public.ticket_categories c where c.event_id = e.id) as price_from,
              (select max(price_fils) from public.ticket_categories c where c.event_id = e.id) as price_to,
              (select min(starts_at) from public.performances p where p.event_id = e.id and p.starts_at > now()) as next_at,
              (select count(*)::int from public.performances p where p.event_id = e.id and p.starts_at > now()) as upcoming
         from public.events e join public.venues v on v.id = e.venue_id join public.organizations o on o.id = e.org_id
        where ${where} order by next_at nulls last`,
      params,
    );
  });

  app.get('/api/events/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const e = await db.one<any>(
      `select e.id, e.slug, e.category, e.inventory_type, e.title_ar, e.title_en, e.description_ar, e.description_en, e.accent_color, e.demo, e.stage_mode,
              e.service_fee_bps, e.service_fee_fixed_fils, e.max_per_order, e.age_restriction, e.cancellation_policy_ar, e.cancellation_policy_en,
              e.accessibility_ar, e.accessibility_en, v.name_ar as venue_ar, v.name_en as venue_en, v.fictional, o.name as organizer,
              l.preview_authenticity
         from public.events e join public.venues v on v.id = e.venue_id join public.organizations o on o.id = e.org_id
         left join public.venue_layout_versions l on l.id = e.layout_version_id
        where e.slug = $1 and e.status = 'published'`,
      [slug],
    );
    if (!e) throw new HttpError(404, 'event_not_found');
    const performances = await db.query(
      `select p.id, p.starts_at, p.ends_at, p.status, p.label_ar, p.label_en, p.sales_end,
              coalesce((select count(*)::int from public.performance_seat_inventory i where i.performance_id = p.id and i.status = 'available'),
                       (select sum(capacity - held - sold)::int from public.capacity_inventory c where c.performance_id = p.id)) as available,
              coalesce((select count(*)::int from public.performance_seat_inventory i where i.performance_id = p.id),
                       (select sum(capacity)::int from public.capacity_inventory c where c.performance_id = p.id)) as total
         from public.performances p where p.event_id = $1 and p.starts_at > now() order by p.starts_at`,
      [e.id],
    );
    const categories = await db.query(`select id, code, name_ar, name_en, price_fils, color from public.ticket_categories where event_id = $1 order by price_fils desc`, [e.id]);
    return { ...e, performances, categories };
  });

  app.get('/api/performances/:id/seatmap', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const p = await db.one<any>(
      `select p.id, p.starts_at, p.label_ar, p.label_en, e.id as event_id, e.slug, e.title_ar, e.title_en, e.stage_mode, e.layout_version_id, e.max_per_order,
              e.service_fee_bps, e.service_fee_fixed_fils, l.geometry, l.preview_authenticity, l.version as layout_version, v.name_ar as venue_ar, v.name_en as venue_en, v.fictional
         from public.performances p join public.events e on e.id = p.event_id
         join public.venue_layout_versions l on l.id = e.layout_version_id join public.venues v on v.id = e.venue_id
        where p.id = $1 and e.status = 'published' and e.inventory_type = 'assigned_seat'`,
      [id],
    );
    if (!p) throw new HttpError(404, 'performance_not_found');
    const [sections, seats, categories, refs] = await Promise.all([
      db.query(`select code, name_ar, name_en, tier, default_category, color from public.venue_sections where layout_version_id = $1 order by code`, [p.layout_version_id]),
      db.query(
        `select s.seat_code as id, s.section_code as section, s.row_label as row, s.seat_number as number, s.tier, s.x, s.y, s.z, s.yaw, s.eye_height, s.aisle, s.accessible,
                s.view_score as score, s.distance_m as distance, s.h_angle_deg as h_angle, s.v_angle_deg as v_angle, s.centre_offset_m as centre_offset, s.c_value_m as c_value, s.blocked_by,
                i.status, i.category_id
           from public.venue_seats s join public.performance_seat_inventory i on i.seat_code = s.seat_code and i.performance_id = $2
          where s.layout_version_id = $1 order by s.section_code, s.row_label, s.seat_number`,
        [p.layout_version_id, id],
      ),
      db.query(`select id, code, name_ar, name_en, price_fils, color from public.ticket_categories where event_id = $1 order by price_fils desc`, [p.event_id]),
      db.query(`select section_code, seat_code, asset_path, version from public.seat_view_references where layout_version_id = $1 and status = 'approved'`, [p.layout_version_id]),
    ]);
    reply.header('cache-control', 'no-store');
    return { performance: p, sections, seats, categories, verifiedReferences: refs };
  });

  // lightweight revalidation endpoint — the renderer never polls per frame
  app.get('/api/performances/:id/availability', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const pub = await db.one(`select 1 from public.performances p join public.events e on e.id = p.event_id where p.id = $1 and e.status = 'published'`, [id]);
    if (!pub) throw new HttpError(404, 'performance_not_found');
    const seats = await db.query<{ c: string; s: string }>(`select seat_code as c, status as s from public.performance_seat_inventory where performance_id = $1`, [id]);
    const capacity = await db.query(`select category_id, capacity, held, sold, capacity - held - sold as available from public.capacity_inventory where performance_id = $1`, [id]);
    reply.header('cache-control', 'no-store');
    return { seats, capacity, at: new Date().toISOString() };
  });

  app.post('/api/recommend', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(RecommendBody, req.body);
    const { intent, source } = await interpretSeatRequest(body.query);
    // Source of truth: database inventory + precomputed geometry. The AI never invents seats/prices.
    const rows = await db.query<any>(
      `select s.seat_code, s.section_code, s.row_label, s.seat_number, s.tier, s.view_score, s.distance_m, s.h_angle_deg, s.centre_offset_m, s.accessible, i.status, c.price_fils, c.code
         from public.performance_seat_inventory i
         join public.performances p on p.id = i.performance_id join public.events e on e.id = p.event_id
         join public.venue_seats s on s.layout_version_id = e.layout_version_id and s.seat_code = i.seat_code
         join public.ticket_categories c on c.id = i.category_id
        where i.performance_id = $1 and e.status = 'published'`,
      [body.performanceId],
    );
    if (!rows.length) throw new HttpError(404, 'performance_not_found');
    const inv: InventorySeat[] = rows.map((r) => ({
      id: r.seat_code, sectionCode: r.section_code, row: r.row_label, number: r.seat_number, tier: r.tier, status: r.status,
      priceFils: r.price_fils, categoryCode: r.code, score: r.view_score, distance: r.distance_m, horizontalAngleDeg: r.h_angle_deg, centreOffset: r.centre_offset_m, accessible: r.accessible,
    }));
    return { ...recommendSeats(inv, intent, 5), source, estimated: true };
  });

  // ───────────── exhibitions (SpaceVision) ─────────────
  app.get('/api/exhibitions/:slug', async (req) => {
    const { slug } = parse(z.object({ slug: z.string().max(80) }), req.params);
    const e = await db.one<any>(
      `select e.id, e.slug, e.title_ar, e.title_en, e.description_ar, e.description_en, e.accent_color, e.demo, l.geometry, l.preview_authenticity,
              v.name_ar as venue_ar, v.name_en as venue_en, o.name as organizer,
              (select json_build_object('starts_at', min(starts_at), 'ends_at', max(ends_at)) from public.performances where event_id = e.id) as dates
         from public.events e join public.venue_layout_versions l on l.id = e.layout_version_id join public.venues v on v.id = e.venue_id join public.organizations o on o.id = e.org_id
        where e.slug = $1 and e.status = 'published' and e.inventory_type = 'exhibition_booth'`,
      [slug],
    );
    if (!e) throw new HttpError(404, 'exhibition_not_found');
    const booths = await db.query(
      `select id, booth_code as code, zone, width_m as width, depth_m as depth, x, z, open_sides, fronts_main_aisle, dist_main_entrance_m as dist_entrance, dist_nearest_exit_m as dist_exit, layout_score as score, status, price_fils
         from public.exhibition_booths where event_id = $1 order by booth_code`,
      [e.id],
    );
    return { ...e, booths };
  });

  app.post('/api/exhibitions/recommend', async (req) => {
    const b = parse(z.object({ eventId: uuid, nearEntrance: z.boolean().default(false), corner: z.boolean().default(false), mainAisle: z.boolean().default(false), minArea: z.number().min(0).max(500).optional() }), req.body);
    const ev = await db.one<{ geometry: any }>(
      `select l.geometry from public.events e join public.venue_layout_versions l on l.id = e.layout_version_id
        where e.id = $1 and e.status = 'published' and e.inventory_type = 'exhibition_booth'`,
      [b.eventId],
    );
    if (!ev) throw new HttpError(404, 'exhibition_not_found');
    const rows = await db.query<any>(
      `select booth_code, zone, width_m, depth_m, x, z, open_sides, fronts_main_aisle, dist_main_entrance_m, dist_nearest_exit_m, status, price_fils
         from public.exhibition_booths where event_id = $1`,
      [b.eventId],
    );
    // Rank from the STORED, versioned layout (never a regenerated demo plan), so real venues rank correctly.
    const g = ev.geometry;
    const layout: ExhibitionLayout = {
      code: 'stored', nameAr: '', nameEn: '', fictional: true,
      hall: g.hall, entrances: g.entrances, exits: g.exits, mainAisles: g.mainAisles,
      booths: rows.map((r) => ({
        code: r.booth_code, zone: r.zone, center: { x: r.x, z: r.z }, width: r.width_m, depth: r.depth_m, area: r.width_m * r.depth_m,
        openSides: r.open_sides, frontsMainAisle: r.fronts_main_aisle, facing: { x: 0, z: 0 },
        distToMainEntrance: r.dist_main_entrance_m, distToNearestExit: r.dist_nearest_exit_m,
      })),
    };
    return { recommendations: recommendBooths(layout, rows.map((x) => ({ code: x.booth_code, status: x.status, priceFils: x.price_fils })), b), basis: 'layout_measurements_only' };
  });
}
