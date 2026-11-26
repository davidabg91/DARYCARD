// Зарежда се от sw.js (workbox `importScripts` във vite.config.ts).
//
// Старият кеш `client-photos` пазеше снимките като „непрозрачни“ отговори, а
// браузърът брои всеки такъв с пълнеж от няколко мегабайта в квотата на сайта.
// Новият кеш е `client-photos-v2`; старият се трие тук, щом този worker поеме,
// за да се върне мястото.
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.delete('client-photos').catch(function () { return false; }));
});
