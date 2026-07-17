# 小草莓家族云端版 — 部署指南（Render.com + Supabase）

本指南帮助小楠把「小草莓家族战」部署成一个**永久网址**，所有人打开就能看到并修改**同一份共享数据**。

部署完成后：
- 得到一个固定网址，如 `https://strawberry-family.onrender.com`
- 数据存在 Supabase 免费数据库里，永久保存、不丢
- 不需要你的电脑一直开机

---

## 第一步：准备云端数据库（Supabase，免费）

> Render 的硬盘是临时性的，重启会清空。所以数据必须放在外部数据库。Supabase 有免费额度，够用。

1. 打开 https://supabase.com ，点 **Start your project**，用邮箱注册（免费）。
2. 登录后点 **New project**：
   - Name 随便填，比如 `strawberry-family`
   - Database Password 记一下（用自动生成的就行，存好）
   - Region 选 **Northeast Asia (Tokyo)** 或离你近的
   - 点 **Create new project**（等一两分钟）
3. 进入项目后，左侧菜单点 **SQL Editor** → **New query**。
4. 把下面这段 SQL 整个粘进去，点 **Run**：

```sql
CREATE TABLE family_data (
  id integer PRIMARY KEY,
  data jsonb NOT NULL
);
GRANT ALL ON family_data TO anon;
GRANT ALL ON family_data TO authenticated;
-- 关闭行级安全，允许 anon key 直接读写（家族战数据本就公开共享）
ALTER TABLE family_data DISABLE ROW LEVEL SECURITY;
```

5. 左上角点项目名，进 **Project Settings** → **API**：
   - 复制 **Project URL**（形如 `https://xxxx.supabase.co`）
   - 复制 **anon public** 那一栏的 key（一长串 `eyJ...`）

> 这两个值下一步要填到 Render 里。先复制到记事本。

---

## 第二步：把代码推到 GitHub

> Render 通过 GitHub 拉代码部署。需要先有一个 GitHub 账号（免费注册 https://github.com ）。

1. 在 GitHub 新建一个仓库，名字比如 `strawberry-family`，**公开（Public）**即可，不要勾选 README。
2. 在你电脑的这个目录（`小草莓家族-cloud/`）里，打开命令行执行：

```bash
git init
git add .
git commit -m "小草莓家族云端版"
git branch -M main
git remote add origin https://github.com/你的用户名/strawberry-family.git
git push -u origin main
```

> 如果提示登录，按提示在浏览器里授权即可。

---

## 第三步：部署到 Render（免费）

1. 打开 https://render.com ，点 **Sign In** → 用 **GitHub** 登录（免费）。
2. 登录后点 **New** → **Web Service**。
3. 选择刚才 push 的 `strawberry-family` 仓库，点 **Connect**。
4. 配置：
   - **Name**：`strawberry-family`
   - **Region**：Oregon（默认）
   - **Branch**：`main`
   - **Runtime**：Node
   - **Build Command**：`echo no-build-step`
   - **Start Command**：`node server.js`
   - **Plan**：**Free**
5. 往下找到 **Environment Variables**，点 **Add Environment Variable** 添加两项：
   - `SUPABASE_URL` = 第一步复制的 Project URL
   - `SUPABASE_ANON_KEY` = 第一步复制的 anon key
6. 点 **Create Web Service**。

> 第一次部署要等几分钟（免费版构建较慢）。部署完成后，Render 会给一个网址，形如 `https://strawberry-family.onrender.com`。

---

## 第四步：验证

1. 打开你的 Render 网址，应该能看到家族战看板。
2. 在手机上、朋友电脑上分别打开同一个网址，任意一方修改数据，其他人刷新就能看到 —— 因为数据都在 Supabase 里。
3. 也可以访问 `https://你的网址.onrender.com/api/health` 看返回里 `"storage":"supabase"` 表示云端数据库已生效。

---

## 常见问题

**Q：免费版 Render 第一次打开很慢 / 显示空白？**
A：免费服务 15 分钟没人访问会「休眠」，第一次访问需要唤醒（约 30 秒）。之后就快了。家族战使用频率低，这完全够用。

**Q：以后改了代码怎么更新？**
A：改完代码 `git push` 到 GitHub，Render 会自动重新部署。

**Q：不想用 Supabase 行不行？**
A：行，但不接数据库时数据只存在 Render 临时硬盘，重启会丢。本地电脑跑（用 `start.bat`）则数据存在你电脑上。

**Q：Supabase 免费额度够吗？**
A：够。免费版 500MB 数据库、每周 2 亿行读取额度，家族战这种小数据用几十年都用不完。
