create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('fisherman','reviewer','admin');
create type public.report_state as enum ('pending_upload','submitted','under_review','needs_information','corroborated','unsubstantiated','duplicate','closed');
create type public.case_state as enum ('new','reviewing','ready_for_referral','referred','acknowledged','in_progress','resolved','closed_without_resolution');
create type public.outbox_state as enum ('draft','approved','sending','provider_accepted','failed','unknown');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Nelayan',
  role public.app_role not null default 'fisherman',
  consent_version text,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);
create function public.create_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, display_name, role) values(new.id, coalesce(nullif(left(new.raw_user_meta_data->>'display_name',80),''),'Nelayan'), 'fisherman');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();

create table public.study_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  aoi_version text not null,
  geom geometry(Polygon,4326) not null,
  habitat_source text,
  habitat_license text,
  zoning_verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index study_areas_geom_idx on public.study_areas using gist(geom);
insert into public.study_areas(code,name,aoi_version,geom) values
 ('pilot','Teluk Jakarta dan Kepulauan Seribu — search envelope','pilot-aoi-v0.1',ST_MakeEnvelope(106.35,-6.20,107.10,-5.35,4326));

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null,
  category text not null, jurisdiction_notes text, created_at timestamptz not null default now()
);
create table public.area_memberships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  area_id uuid not null references public.study_areas(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  primary key(user_id,area_id)
);
create table public.agency_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  address text not null,
  verification_source text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id),
  is_test boolean not null default true,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null, started_at timestamptz not null, ended_at timestamptz,
  status text not null default 'active' check(status in ('active','ended')),
  created_at timestamptz not null default now(), unique(owner_id,client_id)
);
create index trips_owner_idx on public.trips(owner_id,started_at desc);
create unique index trips_one_active_owner_idx on public.trips(owner_id) where status='active';
create table public.trip_points (
  id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade,
  client_id uuid not null, lon double precision not null check(lon between -180 and 180), lat double precision not null check(lat between -90 and 90),
  geom geometry(Point,4326) generated always as (ST_SetSRID(ST_MakePoint(lon,lat),4326)) stored,
  recorded_at timestamptz not null, accuracy_m real not null check(accuracy_m>=0 and accuracy_m<100000),
  quality text not null check(quality in ('accepted','uncertain','gap')),
  created_at timestamptz not null default now(), unique(trip_id,client_id)
);
create index trip_points_geom_idx on public.trip_points using gist(geom);
create table public.shared_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  pseudonym text not null,
  approximate_lon double precision not null, approximate_lat double precision not null,
  approximate_geom geometry(Point,4326) generated always as (ST_SetSRID(ST_MakePoint(approximate_lon,approximate_lat),4326)) stored,
  heartbeat_at timestamptz not null,
  sharing_enabled boolean not null default true
);
create index shared_presence_geom_idx on public.shared_presence using gist(approximate_geom);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(), run_key text not null unique,
  source_name text not null, job_url text, status text not null check(status in ('running','success','failed','no_new_data','insufficient_quality')),
  started_at timestamptz not null default now(), ended_at timestamptz,
  latest_check_at timestamptz, latest_available_observation_at timestamptz,
  latest_usable_observation_at timestamptz, latest_published_result_at timestamptz,
  counts jsonb not null default '{}'::jsonb, error_code text
);
create table public.source_assets (
  id uuid primary key default gen_random_uuid(), source_name text not null, product_id text not null,
  asset_id text not null, source_url text not null, observed_start timestamptz not null,
  observed_end timestamptz not null, native_resolution text, footprint geometry(Geometry,4326),
  quality_flags jsonb not null default '[]'::jsonb, fetched_at timestamptz not null default now(),
  unique(source_name,product_id,asset_id)
);
create index source_assets_footprint_idx on public.source_assets using gist(footprint);
create table public.observations (
  id uuid primary key default gen_random_uuid(), result_key text not null unique,
  type text not null check(type in ('heat_stress','optical_change','environment_input')),
  area_id uuid references public.study_areas(id), lon double precision not null, lat double precision not null,
  geom geometry(Point,4326) generated always as (ST_SetSRID(ST_MakePoint(lon,lat),4326)) stored,
  source_name text not null, source_product_id text not null, source_asset_ids text[] not null,
  source_url text not null, observed_start timestamptz not null, observed_end timestamptz not null,
  fetched_at timestamptz not null, processed_at timestamptz not null,
  published_at timestamptz not null default now(), native_resolution text, output_resolution text,
  algorithm_version text not null, parameters_hash text not null,
  quality_flags jsonb not null default '[]'::jsonb, coverage_fraction real check(coverage_fraction between 0 and 1),
  metrics jsonb not null default '{}'::jsonb, limitations text not null,
  state text not null check(state in ('published','insufficient_clear_imagery','insufficient_reference_quality','unavailable')),
  run_id uuid references public.analysis_runs(id), manifest jsonb not null default '{}'::jsonb
);
create index observations_geom_idx on public.observations using gist(geom);
create index observations_published_idx on public.observations(type,observed_end desc) where state='published';
create table public.analysis_artifacts (
  id uuid primary key default gen_random_uuid(), observation_id uuid not null references public.observations(id) on delete cascade,
  kind text not null, storage_key text not null, sha256 text not null, manifest_version text not null,
  unique(observation_id,kind)
);
create table public.environment_cells (
  id uuid primary key default gen_random_uuid(), result_key text not null unique,
  area_id uuid not null references public.study_areas(id), geom geometry(Polygon,4326) not null,
  lon double precision not null, lat double precision not null,
  center geometry(Point,4326) generated always as (ST_SetSRID(ST_MakePoint(lon,lat),4326)) stored,
  observed_start timestamptz not null, observed_end timestamptz not null,
  source_asset_ids text[] not null, sst_c real, chlorophyll_mg_m3 real,
  front_rank real, chlorophyll_component real, index_score integer check(index_score between 0 and 100),
  algorithm_version text not null, resolution text not null, quality_flags jsonb not null default '[]'::jsonb,
  exclusion text, zoning_verified boolean not null default false,
  published_at timestamptz not null default now()
);
create index environment_cells_geom_idx on public.environment_cells using gist(geom);
create function public.cell_presence_counts(p_viewer uuid)
returns table(cell_id uuid, participant_count bigint) language sql stable security definer set search_path=public as $$
  select c.id, count(p.user_id) from public.environment_cells c
  left join public.shared_presence p on p.sharing_enabled and p.heartbeat_at > now()-interval '3 minutes'
    and p.user_id<>p_viewer and extensions.ST_Contains(c.geom,p.approximate_geom)
  group by c.id
$$;
revoke all on function public.cell_presence_counts(uuid) from public, anon, authenticated;
grant execute on function public.cell_presence_counts(uuid) to service_role;

create table public.reports (
  id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles(id),
  client_id uuid not null, area_id uuid references public.study_areas(id),
  category text not null check(category in ('coral_concern','mangrove_damage','shoreline_erosion','marine_waste','water_pollution','other')),
  lon double precision not null check(lon between -180 and 180), lat double precision not null check(lat between -90 and 90),
  geom geometry(Point,4326) generated always as (ST_SetSRID(ST_MakePoint(lon,lat),4326)) stored,
  location_method text not null check(location_method in ('gps','manual')),
  accuracy_m real, observed_at timestamptz not null, description text not null check(length(description) between 10 and 4000),
  text_only_reason text, status public.report_state not null default 'pending_upload',
  revision integer not null default 1, reviewer_note_public text,
  created_at timestamptz not null default now(), submitted_at timestamptz,
  unique(author_id,client_id)
);
create index reports_geom_idx on public.reports using gist(geom);
create index reports_area_status_idx on public.reports(area_id,status,created_at desc);
create table public.report_media (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id) on delete cascade,
  client_id uuid not null, storage_path text not null, mime text not null,
  size_bytes integer not null check(size_bytes between 1 and 1500000),
  upload_status text not null check(upload_status in ('complete','failed')),
  created_at timestamptz not null default now(), unique(report_id,client_id)
);
create table public.field_validations (
  id uuid primary key default gen_random_uuid(), report_id uuid not null unique references public.reports(id) on delete cascade,
  observation_id uuid not null references public.observations(id),
  stance text not null check(stance in ('similar','not_observed','cannot_assess')),
  distance_m real not null, time_separation_hours real not null,
  created_at timestamptz not null default now()
);
create table public.cases (
  id uuid primary key default gen_random_uuid(), area_id uuid not null references public.study_areas(id),
  category text not null, title text not null, status public.case_state not null default 'new',
  priority text not null default 'routine' check(priority in ('routine','priority_review','urgent_review')),
  assigned_reviewer uuid references public.profiles(id), organization_id uuid references public.organizations(id),
  public_note text, private_note text, recommendation_rule text, revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.case_evidence (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
  report_id uuid references public.reports(id), observation_id uuid references public.observations(id),
  evidence_revision integer not null default 1,
  check((report_id is null) <> (observation_id is null)),
  unique(case_id,report_id), unique(case_id,observation_id), unique(report_id)
);
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id),
  case_revision integer not null, recipient_id uuid not null references public.agency_recipients(id),
  sender text not null, recipient_address text not null, subject text not null, body text not null,
  content_hash text not null, state public.outbox_state not null default 'draft',
  approved_by uuid references public.profiles(id), approved_at timestamptz,
  provider_message_id text, attempts integer not null default 0, last_attempt_at timestamptz,
  error_code text, created_at timestamptz not null default now(),
  unique(case_id,case_revision,recipient_id)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
  entity_type text not null, entity_id uuid not null, action text not null,
  reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create function public.open_case_for_report() returns trigger language plpgsql security definer set search_path=public as $$
declare c_id uuid;
begin
  if new.status='submitted' and old.status='pending_upload' then
    insert into public.cases(area_id,category,title,status,recommendation_rule)
    values(new.area_id,new.category,'Laporan komunitas ' || left(new.id::text,8),'new','manual_review') returning id into c_id;
    insert into public.case_evidence(case_id,report_id,evidence_revision) values(c_id,new.id,new.revision);
    insert into public.audit_events(actor_id,entity_type,entity_id,action,metadata)
    values(new.author_id,'case',c_id,'created_from_report',jsonb_build_object('report_id',new.id));
  end if;
  return new;
end $$;
create trigger after_report_submit after update of status on public.reports
for each row execute function public.open_case_for_report();

create function public.is_assigned_reviewer(p_area_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and (p.role='admin' or (p.role='reviewer' and exists(select 1 from public.area_memberships m where m.user_id=p.id and m.area_id=p_area_id))))
$$;
revoke all on function public.is_assigned_reviewer(uuid) from public;
grant execute on function public.is_assigned_reviewer(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.study_areas enable row level security;
alter table public.organizations enable row level security;
alter table public.area_memberships enable row level security;
alter table public.agency_recipients enable row level security;
alter table public.trips enable row level security;
alter table public.trip_points enable row level security;
alter table public.shared_presence enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.source_assets enable row level security;
alter table public.observations enable row level security;
alter table public.analysis_artifacts enable row level security;
alter table public.environment_cells enable row level security;
alter table public.reports enable row level security;
alter table public.report_media enable row level security;
alter table public.field_validations enable row level security;
alter table public.cases enable row level security;
alter table public.case_evidence enable row level security;
alter table public.email_outbox enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy areas_read on public.study_areas for select to authenticated using(true);
create policy organizations_read on public.organizations for select to authenticated using(true);
create policy memberships_self_read on public.area_memberships for select to authenticated using(user_id=auth.uid());
create policy recipients_reviewer_read on public.agency_recipients for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('reviewer','admin')));
create policy trips_owner_read on public.trips for select to authenticated using(owner_id=auth.uid());
create policy points_owner_read on public.trip_points for select to authenticated using(exists(select 1 from public.trips t where t.id=trip_id and t.owner_id=auth.uid()));
-- No client SELECT policy on shared_presence: only the sanitized server endpoint may expose it.
create policy runs_reviewer_read on public.analysis_runs for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('reviewer','admin')));
create policy assets_published_read on public.source_assets for select to authenticated using(exists(select 1 from public.observations o where o.state='published' and asset_id=any(o.source_asset_ids)));
create policy observations_published_read on public.observations for select to authenticated using(state='published');
create policy cells_read on public.environment_cells for select to authenticated using(true);
create policy reports_owner_or_reviewer_read on public.reports for select to authenticated using(author_id=auth.uid() or public.is_assigned_reviewer(area_id));
create policy media_owner_or_reviewer_read on public.report_media for select to authenticated using(exists(select 1 from public.reports r where r.id=report_id and (r.author_id=auth.uid() or public.is_assigned_reviewer(r.area_id))));
create policy field_owner_or_reviewer_read on public.field_validations for select to authenticated using(exists(select 1 from public.reports r where r.id=report_id and (r.author_id=auth.uid() or public.is_assigned_reviewer(r.area_id))));
create policy cases_reviewer_read on public.cases for select to authenticated using(public.is_assigned_reviewer(area_id));
create policy evidence_reviewer_read on public.case_evidence for select to authenticated using(exists(select 1 from public.cases c where c.id=case_id and public.is_assigned_reviewer(c.area_id)));
create policy outbox_reviewer_read on public.email_outbox for select to authenticated using(exists(select 1 from public.cases c where c.id=case_id and public.is_assigned_reviewer(c.area_id)));
create policy audit_reviewer_read on public.audit_events for select to authenticated using(exists(select 1 from public.cases c where c.id=entity_id and entity_type='case' and public.is_assigned_reviewer(c.area_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('report-media','report-media',false,1500000,array['image/jpeg']),
 ('analysis-artifacts','analysis-artifacts',false,10000000,array['image/png','image/tiff','application/json'])
on conflict(id) do nothing;
-- No browser Storage policies: the API authorizes and handles every upload/download.
