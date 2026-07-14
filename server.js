// ==================== 小草莓家族 - 多人协同云端版 ====================
// 纯 Node.js 内置模块，无需 npm install
// 数据存储：优先用 Supabase（云端持久化），未配置时回退到本地文件
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'cloud-data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ==================== Supabase 配置（云端持久化） ====================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// ==================== MIME 类型 ====================
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
};

// ==================== 初始化数据文件 ====================
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        battleMembers: [],
        contributionMembers: [],
        lastUpdated: null
    }, null, 2));
}

// ==================== 在线用户追踪 ====================
const onlineUsers = new Map();
const HEARTBEAT_TIMEOUT = 20000;

function cleanOfflineUsers() {
    const now = Date.now();
    for (const [id, info] of onlineUsers) {
        if (now - info.lastSeen > HEARTBEAT_TIMEOUT) {
            onlineUsers.delete(id);
        }
    }
}

setInterval(cleanOfflineUsers, 10000);

// ==================== 工具函数 ====================

function sendJSON(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, X-User-Id, X-User-Name, bypass-tunnel-reminder',
        'Access-Control-Max-Age': '86400',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function readBody(req) {
    return new Promise((resolve) => {
        let chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            try {
                resolve(JSON.parse(raw));
            } catch (e) {
                resolve(raw);
            }
        });
    });
}

// ==================== 云端存储层（Supabase） ====================
// 表结构（在 Supabase SQL Editor 执行建表语句）：
//   CREATE TABLE family_data ( id integer PRIMARY KEY, data jsonb NOT NULL );
//   GRANT ALL ON family_data TO anon;
//   GRANT ALL ON family_data TO authenticated;

async function supabaseGet() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/family_data?select=data&id=eq.1`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });
    if (!r.ok) throw new Error('supabase_get_' + r.status);
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length > 0) return rows[0].data;
    return null;
}

async function supabaseUpsert(data) {
    // 先尝试更新 id=1 这一行
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/family_data?id=eq.1`, {
        method: 'PATCH',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ data })
    });
    if (patch.ok) return;
    // 行不存在则插入
    const post = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ id: 1, data })
    });
    if (!post.ok) throw new Error('supabase_upsert_' + post.status);
}

// 读取数据：Supabase 优先，失败回退本地文件
async function loadData() {
    if (USE_SUPABASE) {
        try {
            const d = await supabaseGet();
            return d || { battleMembers: [], contributionMembers: [], lastUpdated: null };
        } catch (e) {
            console.error('[存储] Supabase 读取失败，回退本地文件:', e.message);
        }
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (e) {
        return { battleMembers: [], contributionMembers: [], lastUpdated: null };
    }
}

// 写入数据：Supabase 优先，失败回退本地文件
async function saveData(merged) {
    if (USE_SUPABASE) {
        try {
            await supabaseUpsert(merged);
            return;
        } catch (e) {
            console.error('[存储] Supabase 写入失败，回退本地文件:', e.message);
        }
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2));
}

// ==================== Cell 级别合并逻辑 ====================

function mergeBattleMembers(localMembers, remoteMembers) {
    if (!remoteMembers || !Array.isArray(remoteMembers) || remoteMembers.length === 0) {
        return localMembers;
    }
    const result = localMembers.map(lm => {
        const rm = remoteMembers.find(m => m.name === lm.name);
        if (!rm) return lm;

        if (lm.values && rm.values) {
            const maxLen = Math.max(lm.values.length, rm.values.length);
            const mergedValues = [];
            const mergedTimestamps = [];
            const lmTs = lm.valueTimestamps || [];
            const rmTs = rm.valueTimestamps || [];

            for (let i = 0; i < maxLen; i++) {
                const lmVal = i < lm.values.length ? lm.values[i] : null;
                const rmVal = i < rm.values.length ? rm.values[i] : null;
                const lmT = i < lmTs.length ? lmTs[i] : null;
                const rmT = i < rmTs.length ? rmTs[i] : null;

                if (lmT && rmT) {
                    if (new Date(lmT) >= new Date(rmT)) {
                        mergedValues.push(lmVal);
                        mergedTimestamps.push(lmT);
                    } else {
                        mergedValues.push(rmVal);
                        mergedTimestamps.push(rmT);
                    }
                } else if (lmT) {
                    mergedValues.push(lmVal);
                    mergedTimestamps.push(lmT);
                } else if (rmT) {
                    mergedValues.push(rmVal);
                    mergedTimestamps.push(rmT);
                } else {
                    mergedValues.push(lmVal !== null && lmVal !== undefined ? lmVal : rmVal);
                    mergedTimestamps.push(null);
                }
            }
            return {
                name: lm.name,
                values: mergedValues,
                valueTimestamps: mergedTimestamps
            };
        }
        return lm;
    });

    remoteMembers.forEach(rm => {
        if (!localMembers.find(m => m.name === rm.name)) {
            result.push(rm);
        }
    });

    return result;
}

function mergeContributionMembers(localMembers, remoteMembers) {
    if (!remoteMembers || !Array.isArray(remoteMembers) || remoteMembers.length === 0) {
        return localMembers;
    }
    const result = localMembers.map(lm => {
        const rm = remoteMembers.find(m => m.name === lm.name);
        if (!rm) return lm;

        const merged = { name: lm.name };

        const lmFT = lm.firstTimestamp || null;
        const rmFT = rm.firstTimestamp || null;
        if (lmFT && rmFT) {
            if (new Date(lmFT) >= new Date(rmFT)) {
                merged.firstValue = lm.firstValue;
                merged.firstTimestamp = lmFT;
            } else {
                merged.firstValue = rm.firstValue;
                merged.firstTimestamp = rmFT;
            }
        } else if (lmFT) {
            merged.firstValue = lm.firstValue;
            merged.firstTimestamp = lmFT;
        } else {
            merged.firstValue = rm.firstValue;
            merged.firstTimestamp = rmFT;
        }

        const lmST = lm.secondTimestamp || null;
        const rmST = rm.secondTimestamp || null;
        if (lmST && rmST) {
            if (new Date(lmST) >= new Date(rmST)) {
                merged.secondValue = lm.secondValue;
                merged.secondTimestamp = lmST;
            } else {
                merged.secondValue = rm.secondValue;
                merged.secondTimestamp = rmST;
            }
        } else if (lmST) {
            merged.secondValue = lm.secondValue;
            merged.secondTimestamp = lmST;
        } else {
            merged.secondValue = rm.secondValue;
            merged.secondTimestamp = rmST;
        }

        return merged;
    });

    remoteMembers.forEach(rm => {
        if (!localMembers.find(m => m.name === rm.name)) {
            result.push(rm);
        }
    });

    return result;
}

// ==================== 静态文件服务 ====================

function serveStatic(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    // 安全检查：防止目录遍历
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // 返回 index.html（SPA fallback）
        const indexFile = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexFile)) {
            const content = fs.readFileSync(indexFile);
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Content-Length': Buffer.byteLength(content)
            });
            res.end(content);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
        return;
    }

    const content = fs.readFileSync(filePath);
    const headers = {
        'Content-Type': mime,
        'Content-Length': Buffer.byteLength(content),
    };

    // HTML 不缓存，其他资源缓存 1 小时
    if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache';
    } else {
        headers['Cache-Control'] = 'public, max-age=3600';
    }

    res.writeHead(200, headers);
    res.end(content);
}

// ==================== 路由器 ====================

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept, X-User-Id, X-User-Name, bypass-tunnel-reminder',
            'Access-Control-Max-Age': '86400'
        });
        res.end();
        return;
    }

    // ==================== API 路由 ====================

    // GET /api/health
    if (pathname === '/api/health' && req.method === 'GET') {
        cleanOfflineUsers();
        sendJSON(res, 200, {
            status: 'ok',
            time: new Date().toISOString(),
            onlineCount: onlineUsers.size,
            storage: USE_SUPABASE ? 'supabase' : 'local'
        });
        return;
    }

    // POST /api/heartbeat
    if (pathname === '/api/heartbeat' && req.method === 'POST') {
        const userId = req.headers['x-user-id'] || 'anonymous';
        const userName = req.headers['x-user-name'] || '匿名用户';
        if (userId) {
            onlineUsers.set(userId, {
                lastSeen: Date.now(),
                name: userName
            });
        }
        cleanOfflineUsers();
        const userList = Array.from(onlineUsers.entries()).map(([id, info]) => ({
            id, name: info.name
        }));
        sendJSON(res, 200, { success: true, onlineCount: onlineUsers.size, users: userList });
        return;
    }

    // GET /api/users
    if (pathname === '/api/users' && req.method === 'GET') {
        cleanOfflineUsers();
        const userList = Array.from(onlineUsers.entries()).map(([id, info]) => ({
            id, name: info.name
        }));
        sendJSON(res, 200, { onlineCount: onlineUsers.size, users: userList });
        return;
    }

    // GET /api/data
    if (pathname === '/api/data' && req.method === 'GET') {
        try {
            const data = await loadData();
            sendJSON(res, 200, data);
        } catch (e) {
            sendJSON(res, 500, { error: 'read_failed' });
        }
        return;
    }

    // POST /api/data
    if (pathname === '/api/data' && req.method === 'POST') {
        try {
            const body = await readBody(req);
            const incoming = typeof body === 'string' ? JSON.parse(body) : body;

            if (!incoming || typeof incoming !== 'object') {
                sendJSON(res, 400, { error: 'invalid_data' });
                return;
            }
            if (!Array.isArray(incoming.battleMembers) && !Array.isArray(incoming.contributionMembers)) {
                sendJSON(res, 400, { error: 'invalid_data_structure' });
                return;
            }

            const existing = await loadData();

            const mergedBattle = incoming.battleMembers
                ? mergeBattleMembers(existing.battleMembers || [], incoming.battleMembers)
                : (existing.battleMembers || []);

            const mergedContrib = incoming.contributionMembers
                ? mergeContributionMembers(existing.contributionMembers || [], incoming.contributionMembers)
                : (existing.contributionMembers || []);

            const merged = {
                month: incoming.month || existing.month,
                battleMembers: mergedBattle,
                contributionMembers: mergedContrib,
                lastUpdated: new Date().toISOString()
            };

            await saveData(merged);
            sendJSON(res, 200, { success: true, lastUpdated: merged.lastUpdated, merged: true });
        } catch (e) {
            console.error('POST /api/data error:', e.message);
            sendJSON(res, 500, { error: 'write_failed', detail: e.message });
        }
        return;
    }

    // ==================== 静态文件 ====================
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    serveStatic(res, filePath);
});

// ==================== 启动 ====================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🍓 小草莓家族云端版已启动 → http://0.0.0.0:${PORT}`);
    console.log(`📦 存储模式: ${USE_SUPABASE ? 'Supabase 云端数据库 ✅' : '本地文件 ⚠️（未配置 Supabase）'}`);
    console.log(`👥 多人协同编辑模式已启用`);
});
