-- 在 Supabase 的 SQL Editor 里粘贴本文件全部内容，点 Run 即可
CREATE TABLE family_data (
  id integer PRIMARY KEY,
  data jsonb NOT NULL
);
GRANT ALL ON family_data TO anon;
GRANT ALL ON family_data TO authenticated;
