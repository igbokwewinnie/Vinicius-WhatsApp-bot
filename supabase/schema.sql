create table conversations (
  id uuid primary key default gen_random_uuid(),
  phone_number text unique not null,
  whatsapp_name text,
  status text default 'active'
    check (status in ('active', 'escalated', 'resolved', 'spam')),
  strike_count integer default 0,
  last_message_at timestamptz default now(),
  booking_step text default 'idle',
  booking_data jsonb default '{}',
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  twilio_sid text unique,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  node_used text,
  created_at timestamptz default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  full_name text not null,
  phone_number text not null,
  division text not null check (division in (
    'defence','infrastructure','aviation',
    'technology','automobile','agro','general'
  )),
  purpose text not null,
  preferred_date date not null,
  preferred_time time not null,
  status text default 'pending'
    check (status in ('pending','confirmed','cancelled','completed')),
  created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  full_name text,
  phone_number text not null,
  email text,
  division_interest text,
  enquiry_summary text,
  status text default 'new'
    check (status in ('new','contacted','qualified','closed')),
  created_at timestamptz default now()
);

create table knowledge_base (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  question text not null,
  answer text not null,
  division text,
  created_at timestamptz default now()
);

create table staff_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_number text not null,
  email text not null,
  division text not null,
  role text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users(id),
  message text not null,
  target_group text not null,
  recipient_count integer default 0,
  sent_at timestamptz default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  conversation_id uuid references conversations(id),
  metadata jsonb,
  created_at timestamptz default now()
);

alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table appointments;

alter table conversations enable row level security;
alter table messages enable row level security;
alter table appointments enable row level security;
alter table leads enable row level security;
alter table knowledge_base enable row level security;
alter table staff_members enable row level security;
alter table announcements enable row level security;
alter table audit_logs enable row level security;

create policy "service role full access" on conversations
  using (true) with check (true);
create policy "service role full access" on messages
  using (true) with check (true);
create policy "service role full access" on appointments
  using (true) with check (true);
create policy "service role full access" on leads
  using (true) with check (true);
create policy "service role full access" on knowledge_base
  using (true) with check (true);
create policy "service role full access" on staff_members
  using (true) with check (true);
create policy "service role full access" on announcements
  using (true) with check (true);
create policy "service role full access" on audit_logs
  using (true) with check (true);

-- Run this if conversations table already exists:
-- alter table conversations add column if not exists booking_step text default 'idle';
-- alter table conversations add column if not exists booking_data jsonb default '{}';
