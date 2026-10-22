-- 0002_accent_default
-- New default accent for the light and dark redesign. Tenants still on the old
-- default move with it; anyone who picked their own color keeps it.
alter table settings alter column accent set default '#3b5bff';
update settings set accent = '#3b5bff' where accent = '#7df9ff';
