-- PDF Studio — Supabase schema. Run this in your Supabase project's SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',          -- 'free' | 'pro'
  stripe_customer_id text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users may read ONLY their own profile. (No client write policy — only the
-- service-role webhook updates `plan`, so users can't grant themselves Pro.)
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
