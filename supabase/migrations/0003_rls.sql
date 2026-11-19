-- Row Level Security. Defence in depth: the API also authorizes every request,
-- and all writes to sensitive tables go through the server (service role).

grant usage on schema public to anon, authenticated;
grant usage on schema app to anon, authenticated;
grant execute on function app.is_platform_admin() to anon, authenticated;
grant execute on function app.is_org_member(uuid, text[]) to anon, authenticated;
grant execute on function app.performance_org(uuid) to anon, authenticated;
grant execute on function app.event_org(uuid) to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','organizations','organization_members','organizer_plans','organizer_subscriptions',
    'venues','venue_layout_versions','venue_sections','venue_seats','seat_view_references',
    'events','performances','ticket_categories','pricing_rules',
    'seat_holds','seat_hold_items','performance_seat_inventory','capacity_inventory',
    'orders','order_items','payments','payment_provider_events','tickets','ticket_checkins',
    'exhibition_booths','exhibitor_profiles','exhibition_booking_requests',
    'quick_event_requests','service_quotes','quote_items',
    'support_cases','audit_logs','platform_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- identity
create policy profiles_read on public.profiles for select using (id = auth.uid() or app.is_platform_admin());
create policy orgs_read on public.organizations for select using (app.is_org_member(id, array['owner','manager','staff']) or app.is_platform_admin());
create policy org_members_read on public.organization_members for select
  using (user_id = auth.uid() or app.is_org_member(org_id, array['owner','manager']) or app.is_platform_admin());
create policy plans_read on public.organizer_plans for select using (true);
create policy subs_read on public.organizer_subscriptions for select
  using (app.is_org_member(org_id, array['owner','manager']) or app.is_platform_admin());

-- venues: public demo geometry only once published
create policy venues_read on public.venues for select using (true);
create policy layouts_read on public.venue_layout_versions for select
  using (status = 'published' or app.is_platform_admin()
         or exists (select 1 from public.venues v where v.id = venue_id and v.org_id is not null and app.is_org_member(v.org_id, array['owner','manager'])));
create policy sections_read on public.venue_sections for select
  using (exists (select 1 from public.venue_layout_versions l where l.id = layout_version_id));
create policy seats_read on public.venue_seats for select
  using (exists (select 1 from public.venue_layout_versions l where l.id = layout_version_id));
create policy view_refs_read on public.seat_view_references for select using (status = 'approved' or app.is_platform_admin());

-- events & public catalogue
create policy events_read on public.events for select
  using (status = 'published' or app.is_org_member(org_id, array['owner','manager','staff']) or app.is_platform_admin());
create policy performances_read on public.performances for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy categories_read on public.ticket_categories for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy pricing_read on public.pricing_rules for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy seat_inv_read on public.performance_seat_inventory for select
  using (exists (select 1 from public.performances p where p.id = performance_id));
create policy cap_inv_read on public.capacity_inventory for select
  using (exists (select 1 from public.performances p where p.id = performance_id));

-- holds: owner only
create policy holds_read on public.seat_holds for select using (owner_user_id = auth.uid() or app.is_platform_admin());
create policy hold_items_read on public.seat_hold_items for select
  using (exists (select 1 from public.seat_holds h where h.id = hold_id));

-- orders: customer sees own; organizer owner/manager sees orders for their events; staff do NOT see financials
create policy orders_read on public.orders for select
  using (user_id = auth.uid()
         or app.is_org_member(app.performance_org(performance_id), array['owner','manager'])
         or app.is_platform_admin());
create policy order_items_read on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy payments_read on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy provider_events_read on public.payment_provider_events for select using (app.is_platform_admin());

-- tickets: owner, any member of the organizing org (staff need them for check-in), admin
create policy tickets_read on public.tickets for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
         or app.is_org_member(app.performance_org(performance_id), array['owner','manager','staff'])
         or app.is_platform_admin());
create policy checkins_read on public.ticket_checkins for select
  using (exists (select 1 from public.tickets t where t.id = ticket_id));

-- exhibitions
create policy booths_read on public.exhibition_booths for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy booth_requests_read on public.exhibition_booking_requests for select
  using (user_id = auth.uid() or app.is_org_member(app.event_org(event_id), array['owner','manager']) or app.is_platform_admin());
create policy exhibitor_profiles_read on public.exhibitor_profiles for select
  using (user_id = auth.uid() or app.is_platform_admin()
         or exists (select 1 from public.exhibition_booking_requests r
                     where r.exhibitor_profile_id = exhibitor_profiles.id
                       and app.is_org_member(app.event_org(r.event_id), array['owner','manager'])));

-- quick event
create policy qe_read on public.quick_event_requests for select using (user_id = auth.uid() or app.is_platform_admin());
create policy quotes_read on public.service_quotes for select
  using (exists (select 1 from public.quick_event_requests q where q.id = quick_event_request_id));
create policy quote_items_read on public.quote_items for select
  using (exists (select 1 from public.service_quotes s where s.id = quote_id));

-- administration
create policy support_read on public.support_cases for select using (user_id = auth.uid() or app.is_platform_admin());
create policy audit_read on public.audit_logs for select
  using (app.is_platform_admin() or (org_id is not null and app.is_org_member(org_id, array['owner'])));
create policy settings_read on public.platform_settings for select using (app.is_platform_admin());

-- No INSERT/UPDATE/DELETE policies are defined for anon/authenticated: with RLS enabled
-- this denies all client-side writes. Mutations go through the authenticated API.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
