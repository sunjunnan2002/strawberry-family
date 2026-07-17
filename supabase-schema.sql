-- 在 Supabase 的 SQL Editor 里粘贴本文件全部内容，点 Run 即可
CREATE TABLE IF NOT EXISTS family_data (
  id integer PRIMARY KEY,
  data jsonb NOT NULL
);
GRANT ALL ON family_data TO anon;
GRANT ALL ON family_data TO authenticated;
-- 关闭行级安全，允许 anon key 直接读写（家族战数据本就公开共享）
ALTER TABLE family_data DISABLE ROW LEVEL SECURITY;
