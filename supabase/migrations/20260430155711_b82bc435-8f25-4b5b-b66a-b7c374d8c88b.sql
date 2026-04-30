-- Pin property catalog: shared multi-select properties for board/component pins.
-- Examples: GPIO, SPI-MISO, SPI-MOSI, SPI-SCK, SPI-CS, I2C-SDA, I2C-SCL,
-- UART-TX, UART-RX, PWM, ADC, DAC, INTERRUPT, 3V3, 5V, 12V, VIN, GND,
-- LED-POWER-INDICATOR, LED-GPIO, RESET, AREF, IOREF, USB-D+, USB-D-.

create table if not exists public.pin_property_catalog (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  category text not null default 'other',
  color text,
  description text,
  builtin boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pin_property_catalog enable row level security;

create policy "Anyone can read pin properties"
  on public.pin_property_catalog for select
  to public using (true);

create policy "Anyone can insert pin properties"
  on public.pin_property_catalog for insert
  to public with check (true);

create policy "Anyone can update pin properties"
  on public.pin_property_catalog for update
  to public using (true) with check (true);

create policy "Anyone can delete non-builtin pin properties"
  on public.pin_property_catalog for delete
  to public using (builtin = false);

create trigger touch_pin_property_catalog_updated_at
  before update on public.pin_property_catalog
  for each row execute function public.touch_custom_components_updated_at();

-- Seed defaults
insert into public.pin_property_catalog (key, label, category, color, builtin, sort_order) values
  ('gpio',        'GPIO',        'digital', '#22c55e', true, 10),
  ('input',       'INPUT',       'digital', '#22c55e', true, 11),
  ('output',      'OUTPUT',      'digital', '#22c55e', true, 12),
  ('pwm',         'PWM',         'digital', '#a855f7', true, 20),
  ('adc',         'ADC',         'analog',  '#3b82f6', true, 30),
  ('dac',         'DAC',         'analog',  '#3b82f6', true, 31),
  ('analog-in',   'Analog In',   'analog',  '#3b82f6', true, 32),
  ('interrupt',   'INTERRUPT',   'digital', '#f97316', true, 40),
  ('spi-miso',    'SPI MISO',    'spi',     '#06b6d4', true, 50),
  ('spi-mosi',    'SPI MOSI',    'spi',     '#06b6d4', true, 51),
  ('spi-sck',     'SPI SCK',     'spi',     '#06b6d4', true, 52),
  ('spi-cs',      'SPI CS/SS',   'spi',     '#06b6d4', true, 53),
  ('i2c-sda',     'I2C SDA',     'i2c',     '#f59e0b', true, 60),
  ('i2c-scl',     'I2C SCL',     'i2c',     '#f59e0b', true, 61),
  ('uart-tx',     'UART TX',     'uart',    '#ec4899', true, 70),
  ('uart-rx',     'UART RX',     'uart',    '#ec4899', true, 71),
  ('3v3',         '3.3V',        'power',   '#ef4444', true, 80),
  ('5v',          '5V',          'power',   '#ef4444', true, 81),
  ('12v',         '12V',         'power',   '#dc2626', true, 82),
  ('vin',         'VIN',         'power',   '#ef4444', true, 83),
  ('vbus',        'VBUS',        'power',   '#ef4444', true, 84),
  ('gnd',         'GND',         'ground',  '#111827', true, 90),
  ('reset',       'RESET',       'control', '#6b7280', true, 100),
  ('aref',        'AREF',        'control', '#6b7280', true, 101),
  ('ioref',       'IOREF',       'control', '#6b7280', true, 102),
  ('usb-dp',      'USB D+',      'usb',     '#a78bfa', true, 110),
  ('usb-dm',      'USB D-',      'usb',     '#a78bfa', true, 111),
  ('led-power',   'LED Power Indicator', 'led', '#facc15', true, 120),
  ('led-gpio',    'LED on GPIO', 'led', '#facc15', true, 121),
  ('led-rx',      'LED RX',      'led',     '#facc15', true, 122),
  ('led-tx',      'LED TX',      'led',     '#facc15', true, 123)
on conflict (key) do nothing;