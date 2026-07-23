-- Seed data for local development and db reset.
-- Runs automatically after migrations when you run: npm run supabase:reset

insert into public.todos (name) values
  ('Verify Supabase connection'),
  ('Set up YorkLanes dashboard'),
  ('Assign feature modules to team');

insert into public.courses (code, title, description, credits, department) values
  ('EECS 4314', 'Software Engineering Project', 'Capstone project course.', 3.0, 'EECS'),
  ('CSE 1301', 'Introduction to Computer Programming', 'Introductory programming course.', 3.0, 'CSE')
on conflict (code) do nothing;
