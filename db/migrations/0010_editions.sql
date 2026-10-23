-- 0010_editions
-- Which edition of the product a company uses: Bison Ops (for businesses that
-- sell from their website) or Fit Funnels (for gyms and fitness studios).
-- Same tools and data; the edition sets the name, the mark, the default
-- color and the words. Set when the company is created.
alter table tenants add column edition text not null default 'bison' check (edition in ('bison', 'fit'));
