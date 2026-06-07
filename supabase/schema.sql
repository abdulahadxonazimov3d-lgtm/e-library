-- Elektron Kutubxona BMI loyihasi uchun Supabase schema
-- Supabase Dashboard -> SQL Editor -> New query -> shu faylni to‘liq Run qiling.

create extension if not exists "pgcrypto";


create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  group_name text not null,
  email text not null unique,
  password text not null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  group_name text not null default '',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null default 'Admin tomonidan to‘ldiriladi',
  category text not null,
  description text not null default '',
  cover_url text,
  cover_path text,
  pdf_url text,
  pdf_path text,
  pdf_text text default '',
  views int not null default 0,
  downloads int not null default 0,
  rating numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(title, category)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  text text not null,
  rate int not null check (rate between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(book_id, user_id)
);

create table if not exists public.reading_history (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('reading','downloaded')),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null check (correct_index between 0 and 3),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  book_title text not null,
  total int not null,
  correct int not null,
  percent int not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = uid and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, group_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'group_name',''),
    'user'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.increment_book_view(book_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.books set views = views + 1, updated_at = now() where id = book_uuid;
end;
$$;

create or replace function public.increment_book_download(book_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.books set downloads = downloads + 1, updated_at = now() where id = book_uuid;
end;
$$;

create or replace function public.refresh_book_rating(book_uuid uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.books
  set rating = coalesce((select round(avg(rate)::numeric, 1) from public.comments where book_id = book_uuid), 0),
      updated_at = now()
  where id = book_uuid;
end;
$$;

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.comments enable row level security;
alter table public.favorites enable row level security;
alter table public.reading_history enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_results enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

drop policy if exists "books_select_auth" on public.books;
create policy "books_select_auth" on public.books for select using (auth.role() = 'authenticated');

drop policy if exists "books_admin_all" on public.books;
create policy "books_admin_all" on public.books for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "comments_select_auth" on public.comments;
create policy "comments_select_auth" on public.comments for select using (auth.role() = 'authenticated');
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "comments_admin_delete" on public.comments;
create policy "comments_admin_delete" on public.comments for delete using (public.is_admin());

drop policy if exists "favorites_select_own_or_admin" on public.favorites;
create policy "favorites_select_own_or_admin" on public.favorites for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites for insert with check (auth.uid() = user_id);
drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites for delete using (auth.uid() = user_id);

drop policy if exists "history_select_own_or_admin" on public.reading_history;
create policy "history_select_own_or_admin" on public.reading_history for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "history_insert_own" on public.reading_history;
create policy "history_insert_own" on public.reading_history for insert with check (auth.uid() = user_id);

drop policy if exists "quiz_questions_select_auth" on public.quiz_questions;
create policy "quiz_questions_select_auth" on public.quiz_questions for select using (auth.role() = 'authenticated');
drop policy if exists "quiz_questions_admin_all" on public.quiz_questions;
create policy "quiz_questions_admin_all" on public.quiz_questions for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "quiz_results_select_own_or_admin" on public.quiz_results;
create policy "quiz_results_select_own_or_admin" on public.quiz_results for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "quiz_results_insert_own" on public.quiz_results;
create policy "quiz_results_insert_own" on public.quiz_results for insert with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('book-covers','book-covers', true), ('book-pdfs','book-pdfs', true)
on conflict (id) do nothing;

drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read" on storage.objects for select using (bucket_id = 'book-covers');
drop policy if exists "pdfs_public_read" on storage.objects;
create policy "pdfs_public_read" on storage.objects for select using (bucket_id = 'book-pdfs');

drop policy if exists "covers_admin_write" on storage.objects;
create policy "covers_admin_write" on storage.objects for all using (bucket_id = 'book-covers' and public.is_admin()) with check (bucket_id = 'book-covers' and public.is_admin());
drop policy if exists "pdfs_admin_write" on storage.objects;
create policy "pdfs_admin_write" on storage.objects for all using (bucket_id = 'book-pdfs' and public.is_admin()) with check (bucket_id = 'book-pdfs' and public.is_admin());

insert into public.books (title, author, category, description)
values
('Python dasturlash asoslari', 'Admin tomonidan to‘ldiriladi', 'Dasturlash', 'Python dasturlash asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Java dasturlash tili', 'Admin tomonidan to‘ldiriladi', 'Dasturlash', 'Java dasturlash tili bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('C++ algoritmlar va masalalar', 'Admin tomonidan to‘ldiriladi', 'Dasturlash', 'C++ algoritmlar va masalalar bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('JavaScript amaliy qo‘llanma', 'Admin tomonidan to‘ldiriladi', 'Dasturlash', 'JavaScript amaliy qo‘llanma bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Dasturlash mantiqi', 'Admin tomonidan to‘ldiriladi', 'Dasturlash', 'Dasturlash mantiqi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('HTML va CSS asoslari', 'Admin tomonidan to‘ldiriladi', 'Web dasturlash', 'HTML va CSS asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('React bilan frontend yaratish', 'Admin tomonidan to‘ldiriladi', 'Web dasturlash', 'React bilan frontend yaratish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('PHP va MySQL asoslari', 'Admin tomonidan to‘ldiriladi', 'Web dasturlash', 'PHP va MySQL asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Node.js backend dasturlash', 'Admin tomonidan to‘ldiriladi', 'Web dasturlash', 'Node.js backend dasturlash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Responsive web dizayn', 'Admin tomonidan to‘ldiriladi', 'Web dasturlash', 'Responsive web dizayn bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('SQL asoslari', 'Admin tomonidan to‘ldiriladi', 'Ma''lumotlar bazasi', 'SQL asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('PostgreSQL amaliy qo‘llanma', 'Admin tomonidan to‘ldiriladi', 'Ma''lumotlar bazasi', 'PostgreSQL amaliy qo‘llanma bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Ma''lumotlar bazasini loyihalash', 'Admin tomonidan to‘ldiriladi', 'Ma''lumotlar bazasi', 'Ma''lumotlar bazasini loyihalash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('NoSQL tizimlari', 'Admin tomonidan to‘ldiriladi', 'Ma''lumotlar bazasi', 'NoSQL tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Database xavfsizligi', 'Admin tomonidan to‘ldiriladi', 'Ma''lumotlar bazasi', 'Database xavfsizligi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Sun''iy intellektga kirish', 'Admin tomonidan to‘ldiriladi', 'Sun''iy intellekt', 'Sun''iy intellektga kirish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Mashinali o‘qitish asoslari', 'Admin tomonidan to‘ldiriladi', 'Sun''iy intellekt', 'Mashinali o‘qitish asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Neyron tarmoqlar', 'Admin tomonidan to‘ldiriladi', 'Sun''iy intellekt', 'Neyron tarmoqlar bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('AI tavsiya tizimlari', 'Admin tomonidan to‘ldiriladi', 'Sun''iy intellekt', 'AI tavsiya tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Natural Language Processing', 'Admin tomonidan to‘ldiriladi', 'Sun''iy intellekt', 'Natural Language Processing bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Axborot xavfsizligi asoslari', 'Admin tomonidan to‘ldiriladi', 'Kiberxavfsizlik', 'Axborot xavfsizligi asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Tarmoq xavfsizligi', 'Admin tomonidan to‘ldiriladi', 'Kiberxavfsizlik', 'Tarmoq xavfsizligi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kriptografiya asoslari', 'Admin tomonidan to‘ldiriladi', 'Kiberxavfsizlik', 'Kriptografiya asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Web xavfsizlik', 'Admin tomonidan to‘ldiriladi', 'Kiberxavfsizlik', 'Web xavfsizlik bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Etik xakerlikka kirish', 'Admin tomonidan to‘ldiriladi', 'Kiberxavfsizlik', 'Etik xakerlikka kirish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kompyuter tarmoqlari asoslari', 'Admin tomonidan to‘ldiriladi', 'Kompyuter tarmoqlari', 'Kompyuter tarmoqlari asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Cisco tarmoq texnologiyalari', 'Admin tomonidan to‘ldiriladi', 'Kompyuter tarmoqlari', 'Cisco tarmoq texnologiyalari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('IP manzillash', 'Admin tomonidan to‘ldiriladi', 'Kompyuter tarmoqlari', 'IP manzillash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Server administratsiyasi', 'Admin tomonidan to‘ldiriladi', 'Kompyuter tarmoqlari', 'Server administratsiyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Bulutli tarmoqlar', 'Admin tomonidan to‘ldiriladi', 'Kompyuter tarmoqlari', 'Bulutli tarmoqlar bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Operatsion tizimlar asoslari', 'Admin tomonidan to‘ldiriladi', 'Operatsion tizimlar', 'Operatsion tizimlar asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Linux administratsiyasi', 'Admin tomonidan to‘ldiriladi', 'Operatsion tizimlar', 'Linux administratsiyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Windows Server boshqaruvi', 'Admin tomonidan to‘ldiriladi', 'Operatsion tizimlar', 'Windows Server boshqaruvi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Jarayonlar va xotira boshqaruvi', 'Admin tomonidan to‘ldiriladi', 'Operatsion tizimlar', 'Jarayonlar va xotira boshqaruvi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('OS xavfsizlik komponentlari', 'Admin tomonidan to‘ldiriladi', 'Operatsion tizimlar', 'OS xavfsizlik komponentlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Flutter asoslari', 'Admin tomonidan to‘ldiriladi', 'Mobil dasturlash', 'Flutter asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Dart dasturlash tili', 'Admin tomonidan to‘ldiriladi', 'Mobil dasturlash', 'Dart dasturlash tili bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Android dasturlash', 'Admin tomonidan to‘ldiriladi', 'Mobil dasturlash', 'Android dasturlash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Mobil ilova dizayni', 'Admin tomonidan to‘ldiriladi', 'Mobil dasturlash', 'Mobil ilova dizayni bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Firebase bilan mobil ilovalar', 'Admin tomonidan to‘ldiriladi', 'Mobil dasturlash', 'Firebase bilan mobil ilovalar bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Qurilish materiallari', 'Admin tomonidan to‘ldiriladi', 'Qurilish', 'Qurilish materiallari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Bino va inshootlar konstruksiyasi', 'Admin tomonidan to‘ldiriladi', 'Qurilish', 'Bino va inshootlar konstruksiyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Qurilish texnologiyasi', 'Admin tomonidan to‘ldiriladi', 'Qurilish', 'Qurilish texnologiyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Smeta ishi asoslari', 'Admin tomonidan to‘ldiriladi', 'Qurilish', 'Smeta ishi asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Qurilishda mehnat xavfsizligi', 'Admin tomonidan to‘ldiriladi', 'Qurilish', 'Qurilishda mehnat xavfsizligi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Arxitektura asoslari', 'Admin tomonidan to‘ldiriladi', 'Arxitektura', 'Arxitektura asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Binolarni loyihalash', 'Admin tomonidan to‘ldiriladi', 'Arxitektura', 'Binolarni loyihalash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Interyer dizayn', 'Admin tomonidan to‘ldiriladi', 'Arxitektura', 'Interyer dizayn bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Shaharsozlik asoslari', 'Admin tomonidan to‘ldiriladi', 'Arxitektura', 'Shaharsozlik asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Arxitektura grafikasi', 'Admin tomonidan to‘ldiriladi', 'Arxitektura', 'Arxitektura grafikasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Geodeziya asoslari', 'Admin tomonidan to‘ldiriladi', 'Geodeziya', 'Geodeziya asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kartografiya', 'Admin tomonidan to‘ldiriladi', 'Geodeziya', 'Kartografiya bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('GPS va GNSS texnologiyalari', 'Admin tomonidan to‘ldiriladi', 'Geodeziya', 'GPS va GNSS texnologiyalari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Topografik chizmalar', 'Admin tomonidan to‘ldiriladi', 'Geodeziya', 'Topografik chizmalar bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('GIS tizimlari', 'Admin tomonidan to‘ldiriladi', 'Geodeziya', 'GIS tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektrotexnika asoslari', 'Admin tomonidan to‘ldiriladi', 'Elektrotexnika', 'Elektrotexnika asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektr zanjirlari', 'Admin tomonidan to‘ldiriladi', 'Elektrotexnika', 'Elektr zanjirlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektr xavfsizligi', 'Admin tomonidan to‘ldiriladi', 'Elektrotexnika', 'Elektr xavfsizligi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Transformatorlar', 'Admin tomonidan to‘ldiriladi', 'Elektrotexnika', 'Transformatorlar bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektr jihozlari montaji', 'Admin tomonidan to‘ldiriladi', 'Elektrotexnika', 'Elektr jihozlari montaji bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Avtomobil tuzilishi', 'Admin tomonidan to‘ldiriladi', 'Avtomobil servisi', 'Avtomobil tuzilishi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Dvigatel diagnostikasi', 'Admin tomonidan to‘ldiriladi', 'Avtomobil servisi', 'Dvigatel diagnostikasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Avtomobil elektr jihozlari', 'Admin tomonidan to‘ldiriladi', 'Avtomobil servisi', 'Avtomobil elektr jihozlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Texnik xizmat ko‘rsatish', 'Admin tomonidan to‘ldiriladi', 'Avtomobil servisi', 'Texnik xizmat ko‘rsatish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Avtoservis boshqaruvi', 'Admin tomonidan to‘ldiriladi', 'Avtomobil servisi', 'Avtoservis boshqaruvi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Payvandlash texnologiyasi', 'Admin tomonidan to‘ldiriladi', 'Payvandlash', 'Payvandlash texnologiyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektr yoyli payvandlash', 'Admin tomonidan to‘ldiriladi', 'Payvandlash', 'Elektr yoyli payvandlash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Gaz payvandlash', 'Admin tomonidan to‘ldiriladi', 'Payvandlash', 'Gaz payvandlash bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Payvand choklari nazorati', 'Admin tomonidan to‘ldiriladi', 'Payvandlash', 'Payvand choklari nazorati bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Payvandlash xavfsizligi', 'Admin tomonidan to‘ldiriladi', 'Payvandlash', 'Payvandlash xavfsizligi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Santexnika tizimlari', 'Admin tomonidan to‘ldiriladi', 'Santexnika', 'Santexnika tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Ichki suv ta''minoti', 'Admin tomonidan to‘ldiriladi', 'Santexnika', 'Ichki suv ta''minoti bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kanalizatsiya tizimlari', 'Admin tomonidan to‘ldiriladi', 'Santexnika', 'Kanalizatsiya tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Isitish tizimlari', 'Admin tomonidan to‘ldiriladi', 'Santexnika', 'Isitish tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Quvurlarni montaj qilish', 'Admin tomonidan to‘ldiriladi', 'Santexnika', 'Quvurlarni montaj qilish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Iqtisodiyot nazariyasi', 'Admin tomonidan to‘ldiriladi', 'Iqtisodiyot', 'Iqtisodiyot nazariyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Menejment asoslari', 'Admin tomonidan to‘ldiriladi', 'Iqtisodiyot', 'Menejment asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Marketing asoslari', 'Admin tomonidan to‘ldiriladi', 'Iqtisodiyot', 'Marketing asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Biznes reja tuzish', 'Admin tomonidan to‘ldiriladi', 'Iqtisodiyot', 'Biznes reja tuzish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Moliyaviy savodxonlik', 'Admin tomonidan to‘ldiriladi', 'Iqtisodiyot', 'Moliyaviy savodxonlik bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Pedagogika asoslari', 'Admin tomonidan to‘ldiriladi', 'Pedagogika', 'Pedagogika asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Ta''lim metodikasi', 'Admin tomonidan to‘ldiriladi', 'Pedagogika', 'Ta''lim metodikasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Baholash mezonlari', 'Admin tomonidan to‘ldiriladi', 'Pedagogika', 'Baholash mezonlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Raqamli pedagogika', 'Admin tomonidan to‘ldiriladi', 'Pedagogika', 'Raqamli pedagogika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kasbiy ta''lim metodikasi', 'Admin tomonidan to‘ldiriladi', 'Pedagogika', 'Kasbiy ta''lim metodikasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Oliy matematika', 'Admin tomonidan to‘ldiriladi', 'Matematika', 'Oliy matematika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Diskret matematika', 'Admin tomonidan to‘ldiriladi', 'Matematika', 'Diskret matematika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Ehtimollar nazariyasi', 'Admin tomonidan to‘ldiriladi', 'Matematika', 'Ehtimollar nazariyasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Matematik statistika', 'Admin tomonidan to‘ldiriladi', 'Matematika', 'Matematik statistika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Chiziqli algebra', 'Admin tomonidan to‘ldiriladi', 'Matematika', 'Chiziqli algebra bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Umumiy fizika', 'Admin tomonidan to‘ldiriladi', 'Fizika', 'Umumiy fizika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektr va magnetizm', 'Admin tomonidan to‘ldiriladi', 'Fizika', 'Elektr va magnetizm bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Mexanika', 'Admin tomonidan to‘ldiriladi', 'Fizika', 'Mexanika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Optika', 'Admin tomonidan to‘ldiriladi', 'Fizika', 'Optika bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Atom fizikasi', 'Admin tomonidan to‘ldiriladi', 'Fizika', 'Atom fizikasi bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektron kutubxona tizimlari', 'Admin tomonidan to‘ldiriladi', 'Kutubxonashunoslik', 'Elektron kutubxona tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kutubxona fondini boshqarish', 'Admin tomonidan to‘ldiriladi', 'Kutubxonashunoslik', 'Kutubxona fondini boshqarish bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Bibliografiya asoslari', 'Admin tomonidan to‘ldiriladi', 'Kutubxonashunoslik', 'Bibliografiya asoslari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Elektron resurslar tahlili', 'Admin tomonidan to‘ldiriladi', 'Kutubxonashunoslik', 'Elektron resurslar tahlili bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.'),
('Kitob tavsiya tizimlari', 'Admin tomonidan to‘ldiriladi', 'Kutubxonashunoslik', 'Kitob tavsiya tizimlari bo‘yicha elektron o‘quv resursi. PDF fayl va kitob rasmi admin tomonidan Supabase Storage orqali yuklanadi.')
on conflict (title, category) do nothing;

-- Admin qilish:
-- 1) Avval sayt orqali yoki Supabase Auth orqali admin email bilan user yarating.
-- 2) Keyin quyidagini o‘zingizning admin emailingiz bilan ishlating:
-- update public.profiles set role='admin', full_name='Admin' where id = (select id from auth.users where email='admin@kutubxona.uz');


grant usage on schema public to anon, authenticated;
grant select on public.books to authenticated;
grant select, insert on public.reading_history to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert on public.comments to authenticated;
grant select on public.quiz_questions to authenticated;
grant select, insert on public.quiz_results to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.increment_book_view(uuid) to authenticated;
grant execute on function public.increment_book_download(uuid) to authenticated;
grant execute on function public.refresh_book_rating(uuid) to authenticated;


-- DEMO ADMIN PANEL UCHUN:
-- admin@kutubxona.uz / 123456 lokal admin kirishi Supabase Auth ro‘yxatdan o‘tishini talab qilmasligi uchun.
-- BMI demo uchun qulay. Real production tizimda buni service role yoki Supabase Auth admin bilan almashtirish tavsiya qilinadi.

drop policy if exists "profiles_demo_admin_select" on public.profiles;
create policy "profiles_demo_admin_select" on public.profiles
for select using (auth.role() = 'anon');

drop policy if exists "books_demo_admin_all" on public.books;
create policy "books_demo_admin_all" on public.books
for all using (auth.role() = 'anon') with check (auth.role() = 'anon');

drop policy if exists "quiz_questions_demo_admin_all" on public.quiz_questions;
create policy "quiz_questions_demo_admin_all" on public.quiz_questions
for all using (auth.role() = 'anon') with check (auth.role() = 'anon');

drop policy if exists "comments_demo_admin_select" on public.comments;
create policy "comments_demo_admin_select" on public.comments
for select using (auth.role() = 'anon');

drop policy if exists "favorites_demo_admin_select" on public.favorites;
create policy "favorites_demo_admin_select" on public.favorites
for select using (auth.role() = 'anon');

drop policy if exists "history_demo_admin_select" on public.reading_history;
create policy "history_demo_admin_select" on public.reading_history
for select using (auth.role() = 'anon');

drop policy if exists "quiz_results_demo_admin_select" on public.quiz_results;
create policy "quiz_results_demo_admin_select" on public.quiz_results
for select using (auth.role() = 'anon');

drop policy if exists "covers_demo_admin_write" on storage.objects;
create policy "covers_demo_admin_write" on storage.objects
for all using (bucket_id = 'book-covers' and auth.role() = 'anon')
with check (bucket_id = 'book-covers' and auth.role() = 'anon');

drop policy if exists "pdfs_demo_admin_write" on storage.objects;
create policy "pdfs_demo_admin_write" on storage.objects
for all using (bucket_id = 'book-pdfs' and auth.role() = 'anon')
with check (bucket_id = 'book-pdfs' and auth.role() = 'anon');

grant select on public.profiles to anon;
grant select, insert, update, delete on public.books to anon;
grant select, insert, update, delete on public.quiz_questions to anon;
grant select on public.comments to anon;
grant select on public.favorites to anon;
grant select on public.reading_history to anon;
grant select on public.quiz_results to anon;


-- Email tasdiqlashsiz ishlaydigan foydalanuvchilar jadvali uchun ruxsatlar
alter table public.app_users enable row level security;

drop policy if exists "app_users_demo_all" on public.app_users;
create policy "app_users_demo_all" on public.app_users
for all using (true) with check (true);

grant select, insert, update, delete on public.app_users to anon, authenticated;

-- App foydalanuvchilar Supabase Auth ishlatmagani uchun user_id FK cheklovlarini olib tashlash
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass::text as table_name, conname
    from pg_constraint
    where contype = 'f'
      and conrelid in ('public.comments'::regclass, 'public.favorites'::regclass, 'public.reading_history'::regclass, 'public.quiz_results'::regclass)
      and pg_get_constraintdef(oid) ilike '%auth.users%'
  loop
    execute format('alter table %s drop constraint if exists %I', r.table_name, r.conname);
  end loop;
end $$;

-- Oddiy foydalanuvchilar Supabase Auth sessiyasiz ishlashi uchun demo RLS ruxsatlari
drop policy if exists "comments_app_select" on public.comments;
create policy "comments_app_select" on public.comments for select using (auth.role() = 'anon');
drop policy if exists "comments_app_insert" on public.comments;
create policy "comments_app_insert" on public.comments for insert with check (auth.role() = 'anon');

drop policy if exists "favorites_app_all" on public.favorites;
create policy "favorites_app_all" on public.favorites for all using (auth.role() = 'anon') with check (auth.role() = 'anon');

drop policy if exists "history_app_all" on public.reading_history;
create policy "history_app_all" on public.reading_history for all using (auth.role() = 'anon') with check (auth.role() = 'anon');

drop policy if exists "quiz_results_app_all" on public.quiz_results;
create policy "quiz_results_app_all" on public.quiz_results for all using (auth.role() = 'anon') with check (auth.role() = 'anon');

drop policy if exists "books_app_select" on public.books;
create policy "books_app_select" on public.books for select using (auth.role() = 'anon');

drop policy if exists "quiz_questions_app_select" on public.quiz_questions;
create policy "quiz_questions_app_select" on public.quiz_questions for select using (auth.role() = 'anon');

grant select, insert on public.comments to anon;
grant select, insert, delete on public.favorites to anon;
grant select, insert on public.reading_history to anon;
grant select, insert on public.quiz_results to anon;
grant select on public.books to anon;
grant select on public.quiz_questions to anon;
grant execute on function public.increment_book_view(uuid) to anon;
grant execute on function public.increment_book_download(uuid) to anon;
grant execute on function public.refresh_book_rating(uuid) to anon;
