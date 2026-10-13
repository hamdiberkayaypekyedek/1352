(function () {
    var body = document.body;
    var state = document.getElementById('state');
    var message = document.getElementById('msgs') || document.getElementById('msg') || state;
    var cache = document.getElementById('cache');
    var blocked = false, started = false;
    function status(text) { if (message) message.textContent = text; }
    function fail(text) {
        blocked = true;
        window.aypekLight.fail();
        body.className = 'fail';
        status(text);
        var spin = document.getElementById('spin');
        if (spin) spin.style.display = 'none';
        if (cache) cache.textContent = 'İşlem başlatılmadı. Sayfayı yeniden açın.';
    }
    var expected = body.getAttribute('data-firmware');
    var ua = /PlayStation\s+4[\/ ](\d+)\.(\d+)(?!\d)/.exec(navigator.userAgent);
    var firmware = ua ? ua[1] + '.' + ('0' + parseInt(ua[2], 10)).slice(-2) : '';
    if (firmware !== expected) { fail('Bu paket yalnızca PS4 ' + expected + ' içindir'); return; }
    var ac = window.applicationCache;
    if (!ac || !document.documentElement.hasAttribute('manifest')) {
        fail('Önbellek kullanılamıyor'); return;
    }
    function start() {
        if (blocked || started) return;
        if (ac.status !== ac.IDLE) { fail('Dosyalar henüz hazır değil'); return; }
        started = true;
        status('Hazır. Otomatik başlatılıyor...');
        if (cache) cache.textContent = 'Dosyalar önbellekte';
        var module = body.getAttribute('data-module');
        if (!module) { location.replace('jb.html' + location.search); return; }
        var script = document.createElement('script');
        script.type = 'module'; script.src = module;
        script.onerror = function () { fail('İşlem dosyası yüklenemedi'); };
        body.appendChild(script);
    }
    function updateReady() {
        if (blocked || started) return;
        try { ac.swapCache(); location.reload(); }
        catch (e) { fail('Önbellek güncellemesi uygulanamadı'); }
    }
    ac.addEventListener('checking', function () { status('Dosyalar kontrol ediliyor...'); }, false);
    ac.addEventListener('downloading', function () { status('Dosyalar indiriliyor...'); }, false);
    ac.addEventListener('progress', function (e) {
        if (!blocked && cache && e.total) cache.textContent = 'İndiriliyor: %' + Math.round(e.loaded / e.total * 100);
    }, false);
    ac.addEventListener('cached', start, false);
    ac.addEventListener('noupdate', start, false);
    ac.addEventListener('updateready', updateReady, false);
    ac.addEventListener('error', function () { if (!started) fail('Önbellek kontrolü veya indirme başarısız'); }, false);
    ac.addEventListener('obsolete', function () { if (!started) fail('Önbellek artık geçerli değil'); }, false);
    status('Dosyalar kontrol ediliyor...');
    if (ac.status === ac.UPDATEREADY) updateReady();
    else if (ac.status === ac.OBSOLETE) fail('Önbellek artık geçerli değil');
    else if (ac.status === ac.IDLE) {
        if (navigator.onLine === false) start();
        else { try { ac.update(); } catch (e) { fail('Önbellek kontrolü başlatılamadı'); } }
    }
    // No key/click handlers: input cannot bypass the cache gate.
})();
