-- Server-only booking primitives. All run inside the caller's transaction:
-- any raised exception rolls back every change made in the call.
-- SECURITY DEFINER functions pin search_path and are not executable by anon/authenticated.

-- ───────────── authorization helpers (used by RLS) ─────────────
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'platform_admin')
$$;

create or replace function app.is_org_member(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members
    where org_id = p_org and user_id = auth.uid() and role = any(p_roles)
  )
$$;

create or replace function app.performance_org(p_performance uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select e.org_id from public.performances p join public.events e on e.id = p.event_id where p.id = p_performance
$$;

create or replace function app.event_org(p_event uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select org_id from public.events where id = p_event
$$;

-- ───────────── hold expiry ─────────────
create or replace function app.release_expired_holds(p_performance uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h record;
  n int := 0;
begin
  for h in
    select id, performance_id from public.seat_holds
    where status = 'active' and expires_at < now()
      and (p_performance is null or performance_id = p_performance)
    order by id
    for update skip locked
  loop
    perform app._release_hold(h.id, 'expired');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function app._release_hold(p_hold uuid, p_new_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h record;
begin
  select * into h from public.seat_holds where id = p_hold for update;
  if not found or h.status <> 'active' then return; end if;

  update public.performance_seat_inventory
     set status = 'available', hold_id = null, updated_at = now()
   where hold_id = p_hold;

  update public.capacity_inventory c
     set held = c.held - i.qty
    from (select category_id, sum(quantity)::int as qty
            from public.seat_hold_items where hold_id = p_hold and seat_code is null
           group by category_id) i
   where c.performance_id = h.performance_id and c.category_id = i.category_id;

  update public.seat_holds set status = p_new_status where id = p_hold;

  -- orders that never reached the payment gateway simply expire;
  -- orders with a payment in flight stay put and are resolved by reconciliation.
  update public.orders set status = 'expired', updated_at = now()
   where hold_id = p_hold and status in ('pending_payment', 'payment_failed');
end $$;

-- previous active holds of the same owner on this performance that are safe to replace
create or replace function app._release_owner_holds(p_performance uuid, p_user uuid, p_session text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h record;
begin
  for h in
    select sh.id from public.seat_holds sh
     where sh.performance_id = p_performance and sh.status = 'active'
       and ((p_user is not null and sh.owner_user_id = p_user) or (p_session is not null and sh.owner_session = p_session))
       and not exists (select 1 from public.orders o where o.hold_id = sh.id and o.status in ('payment_processing', 'confirmed', 'reconciliation_required'))
     order by sh.id
     for update
  loop
    perform app._release_hold(h.id, 'released');
  end loop;
end $$;

create or replace function app._assert_on_sale(p_performance uuid, p_inventory_type text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  select p.status, p.sales_start, p.sales_end, e.status as event_status, e.inventory_type
    into r
    from public.performances p join public.events e on e.id = p.event_id
   where p.id = p_performance;
  if not found then raise exception 'performance_not_found'; end if;
  if r.inventory_type <> p_inventory_type then raise exception 'wrong_inventory_type'; end if;
  if r.event_status <> 'published' or r.status <> 'on_sale' or now() < r.sales_start or now() > r.sales_end then
    raise exception 'not_on_sale';
  end if;
end $$;

-- ───────────── reserved seats: atomic hold ─────────────
-- Replaces the owner's previous basket for this performance (the client always sends the full seat list).
create or replace function app.hold_seats(
  p_performance uuid, p_seats text[], p_user uuid, p_session text, p_ttl_seconds int, p_max int
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hold uuid;
  v_count int;
  v_unavail text[];
begin
  if p_seats is null or cardinality(p_seats) = 0 then raise exception 'no_seats'; end if;
  if cardinality(p_seats) > p_max then raise exception 'too_many_seats'; end if;
  if (select count(distinct s) from unnest(p_seats) s) <> cardinality(p_seats) then raise exception 'duplicate_seats'; end if;
  if p_user is null and p_session is null then raise exception 'no_owner'; end if;

  perform app._assert_on_sale(p_performance, 'assigned_seat');
  perform app.release_expired_holds(p_performance);
  perform app._release_owner_holds(p_performance, p_user, p_session);

  -- lock requested rows in a deterministic order (prevents deadlocks between concurrent buyers)
  perform 1 from public.performance_seat_inventory
   where performance_id = p_performance and seat_code = any(p_seats)
   order by seat_code
   for update;

  select count(*) into v_count from public.performance_seat_inventory
   where performance_id = p_performance and seat_code = any(p_seats);
  if v_count <> cardinality(p_seats) then raise exception 'unknown_seat'; end if;

  select array_agg(seat_code order by seat_code) into v_unavail
    from public.performance_seat_inventory
   where performance_id = p_performance and seat_code = any(p_seats) and status <> 'available';
  if v_unavail is not null then
    raise exception 'seat_unavailable:%', array_to_string(v_unavail, ',');
  end if;

  insert into public.seat_holds (performance_id, kind, owner_user_id, owner_session, expires_at)
  values (p_performance, 'seats', p_user, p_session, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_hold;

  insert into public.seat_hold_items (hold_id, seat_code, category_id)
  select v_hold, seat_code, category_id from public.performance_seat_inventory
   where performance_id = p_performance and seat_code = any(p_seats);

  update public.performance_seat_inventory
     set status = 'held', hold_id = v_hold, updated_at = now()
   where performance_id = p_performance and seat_code = any(p_seats);

  return v_hold;
end $$;

-- ───────────── general admission / time slots: atomic capacity hold ─────────────
create or replace function app.hold_admission(
  p_performance uuid, p_category uuid, p_quantity int, p_user uuid, p_session text, p_ttl_seconds int, p_max int, p_inventory_type text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c record;
  v_hold uuid;
begin
  if p_quantity < 1 or p_quantity > p_max then raise exception 'invalid_quantity'; end if;
  if p_user is null and p_session is null then raise exception 'no_owner'; end if;
  perform app._assert_on_sale(p_performance, p_inventory_type);
  perform app.release_expired_holds(p_performance);
  perform app._release_owner_holds(p_performance, p_user, p_session);

  select * into c from public.capacity_inventory
   where performance_id = p_performance and category_id = p_category
   for update;
  if not found then raise exception 'unknown_category'; end if;
  if c.capacity - c.held - c.sold < p_quantity then raise exception 'capacity_exceeded'; end if;

  insert into public.seat_holds (performance_id, kind, owner_user_id, owner_session, expires_at)
  values (p_performance, 'admission', p_user, p_session, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_hold;
  insert into public.seat_hold_items (hold_id, seat_code, category_id, quantity) values (v_hold, null, p_category, p_quantity);
  update public.capacity_inventory set held = held + p_quantity
   where performance_id = p_performance and category_id = p_category;
  return v_hold;
end $$;

-- ───────────── confirmation: allocate + issue tickets exactly once ─────────────
create or replace function app.confirm_order(p_order uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o record;
  h record;
  it record;
  inv record;
  cap record;
  ok boolean := true;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.status = 'confirmed' then return 'already_confirmed'; end if;
  if o.status in ('cancelled', 'refunded') then return 'not_confirmable'; end if;
  if not exists (select 1 from public.payments where order_id = o.id and status = 'succeeded') then
    return 'payment_not_verified';
  end if;

  select * into h from public.seat_holds where id = o.hold_id for update;

  for it in select * from public.order_items where order_id = o.id order by seat_code nulls last loop
    if it.seat_code is not null then
      select * into inv from public.performance_seat_inventory
       where performance_id = o.performance_id and seat_code = it.seat_code for update;
      if not (inv.status = 'available' or (inv.status = 'held' and inv.hold_id = o.hold_id)) then
        ok := false;
      end if;
    else
      select * into cap from public.capacity_inventory
       where performance_id = o.performance_id and category_id = it.category_id for update;
      if h.status = 'active' then
        null; -- quantity is already counted in "held"
      elsif cap.capacity - cap.held - cap.sold < it.quantity then
        ok := false;
      end if;
    end if;
  end loop;

  if not ok then
    update public.orders set status = 'reconciliation_required', updated_at = now() where id = o.id;
    return 'reconciliation_required';
  end if;

  update public.performance_seat_inventory
     set status = 'sold', hold_id = null, updated_at = now()
   where performance_id = o.performance_id
     and seat_code in (select seat_code from public.order_items where order_id = o.id and seat_code is not null);

  for it in select * from public.order_items where order_id = o.id and seat_code is null loop
    update public.capacity_inventory
       set held = held - case when h.status = 'active' then it.quantity else 0 end,
           sold = sold + it.quantity
     where performance_id = o.performance_id and category_id = it.category_id;
  end loop;

  insert into public.tickets (order_id, order_item_id, performance_id, seat_code, admission_index, demo)
  select o.id, oi.id, o.performance_id, oi.seat_code, g, o.demo
    from public.order_items oi
    cross join lateral generate_series(1, oi.quantity) g
   where oi.order_id = o.id;

  update public.seat_holds set status = 'converted' where id = o.hold_id;
  update public.orders set status = 'confirmed', confirmed_at = now(), updated_at = now() where id = o.id;
  return 'confirmed';
end $$;

-- ───────────── check-in: atomic single use ─────────────
create or replace function app.check_in_ticket(p_ticket uuid, p_staff uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t record;
begin
  update public.tickets set status = 'used' where id = p_ticket and status = 'valid' returning * into t;
  if not found then
    select status into t from public.tickets where id = p_ticket;
    if not found then return 'not_found'; end if;
    return case when t.status = 'used' then 'already_used' else 'void' end;
  end if;
  insert into public.ticket_checkins (ticket_id, checked_in_by) values (p_ticket, p_staff);
  return 'checked_in';
end $$;

-- functions are server-only
revoke all on function app.hold_seats(uuid, text[], uuid, text, int, int) from public;
revoke all on function app.hold_admission(uuid, uuid, int, uuid, text, int, int, text) from public;
revoke all on function app.confirm_order(uuid) from public;
revoke all on function app.check_in_ticket(uuid, uuid) from public;
revoke all on function app.release_expired_holds(uuid) from public;
revoke all on function app._release_hold(uuid, text) from public;
revoke all on function app._release_owner_holds(uuid, uuid, text) from public;
revoke all on function app._assert_on_sale(uuid, text) from public;
