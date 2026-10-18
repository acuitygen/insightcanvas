create table if not exists clinic_meta (
  key text primary key,
  value text not null
);

create table if not exists clinic_patient (
  id text primary key,
  name text not null,
  sex text not null,
  age integer not null,
  phone text not null,
  city text not null,
  history text not null,
  allergies text not null,
  created_on date not null
);

create table if not exists clinic_medicine (
  id text primary key,
  name text not null,
  strength text not null,
  unit_price integer not null,
  stock integer not null,
  reorder_at integer not null
);

create table if not exists clinic_visit (
  id text primary key,
  patient_id text not null,
  visit_date date not null,
  clinician text not null,
  complaint text not null,
  diagnosis text not null,
  condition text not null,
  consult_fee integer not null,
  notes text not null
);

create table if not exists clinic_dispense (
  id text primary key,
  visit_id text not null,
  medicine_id text not null,
  quantity integer not null,
  unit_price integer not null
);

create index if not exists clinic_patient_name_idx on clinic_patient (name);
create index if not exists clinic_visit_patient_idx on clinic_visit (patient_id);
create index if not exists clinic_visit_date_idx on clinic_visit (visit_date);
create index if not exists clinic_dispense_visit_idx on clinic_dispense (visit_id);
