// 小草莓家族战 Service Worker
const CACHE_NAME = 'strawberry-family-v24';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/app-icon-192.png',
    './icons/app-icon-512.png'
];

// 安装：缓存核心资源，立即激活
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// 激活：清理所有旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((k) => caches.delete(k))
            );
        }).then(() => self.clients.claim())
            .then(() => self.clients.matchAll().then(clients => {
                clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }));
            }))
    );
});

// 请求拦截：导航请求网络优先，静态资源缓存优先
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // config.json 永远从网络获取（不缓存），确保隧道地址最新
    if (event.request.url.includes('config.json')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // HTML 导航请求：网络优先（确保总是拿到最新页面）
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // 静态资源：缓存优先
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request)
                .then((response) => {
                    if (response.ok && event.request.url.startsWith(self.location.origin)) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
        })
    );
});
