-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists members_email_unique on public.members (email);

alter table public.members enable row level security;

-- 서버(Vercel API)는 Service Role Key로 저장하므로 별도 공개 정책 없음
