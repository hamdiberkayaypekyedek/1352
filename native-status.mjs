// Read-only loopback HTTP status probe. No browser XHR and no payload POST.
export function parseStatus(response) {
  const split = response.indexOf('\r\n\r\n');
  if (split < 0 || !/^HTTP\/1\.[01] 200(?: |\r)/.test(response)) return null;
  const headers = response.slice(0, split);
  if (/transfer-encoding\s*:\s*chunked/i.test(headers)) return null;
  let body = response.slice(split + 4);
  const length = /content-length\s*:\s*(\d+)/i.exec(headers);
  if (length) {
    if (body.length < Number(length[1])) return null;
    body = body.slice(0, Number(length[1]));
  }
  try { const data = JSON.parse(body); return data.status === 'ready' || data.status === 'busy' ? data.status : null; }
  catch (_) { return null; }
}

export async function probeStatus(env) {
  const { call, alloc, errno, log } = env;
  const now = env.now || Date.now;
  const sleep = env.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const end = now() + 15000;
  const address = alloc(16), option = alloc(4), optlen = alloc(4), poll = alloc(8), input = alloc(4096);
  address.bytes.set([16, 2, 0x23, 0x82, 127, 0, 0, 1]); // 127.0.0.1:9090
  const text = 'GET /status HTTP/1.0\r\nHost: 127.0.0.1:9090\r\nConnection: close\r\n\r\n';
  const output = alloc(text.length);
  for (let i = 0; i < text.length; i++) output.bytes[i] = text.charCodeAt(i);
  let last = 'no-response';
  async function attempt() {
    let fd = -1;
    const until = Math.min(end, now() + 1500);
    try {
      fd = call(97, 2, 1, 0); // AF_INET, SOCK_STREAM
      if (fd < 0) { last = 'socket:' + errno(); return null; }
      option.view.setInt32(0, 1, true);
      // Orbis SO_NBIO: do not connect unless nonblocking mode was accepted.
      if (call(105, fd, 0xffff, 0x1200, option.ptr, 4) !== 0) {
        last = 'so-nbio:' + errno(); return null;
      }
      if (call(105, fd, 0xffff, 0x0800, option.ptr, 4) !== 0) { last = 'nosigpipe:' + errno(); return null; }
      const connected = call(98, fd, address.ptr, 16);
      if (connected !== 0) {
        const err = errno();
        if (err !== 36 && err !== 37 && err !== 35) { last = 'connect:' + err; return null; }
        let ready = false;
        while (now() < until) {
          poll.view.setInt32(0, fd, true); poll.view.setInt16(4, 4, true); poll.view.setInt16(6, 0, true);
          const n = call(209, poll.ptr, 1, 0);
          if (n < 0) { last = 'poll:' + errno(); return null; }
          if (n > 0) {
            option.view.setInt32(0, 0, true); optlen.view.setInt32(0, 4, true);
            if (call(118, fd, 0xffff, 0x1007, option.ptr, optlen.ptr) !== 0 || option.view.getInt32(0, true) !== 0) { last = 'connect-not-ready'; return null; }
            if (poll.view.getInt16(6, true) & 4) { ready = true; break; }
            last = 'connect-events'; return null;
          }
          await sleep(50);
        }
        if (!ready) { last = 'connect-timeout'; return null; }
      }
      let sent = 0;
      while (sent < text.length && now() < until) {
        const n = call(4, fd, output.ptr.add32(sent), text.length - sent);
        if (n > 0) sent += n;
        else if (n < 0 && errno() !== 35 && errno() !== 4) { last = 'send:' + errno(); return null; }
        else await sleep(50);
      }
      if (sent !== text.length) { last = 'send-timeout'; return null; }
      let response = '';
      while (now() < until && response.length < 16384) {
        const n = call(3, fd, input.ptr, input.bytes.length);
        if (n > 0) {
          for (let i = 0; i < n; i++) response += String.fromCharCode(input.bytes[i]);
          const status = parseStatus(response);
          if (status) return status;
        } else if (n === 0) break;
        else if (errno() !== 35 && errno() !== 4) { last = 'read:' + errno(); return null; }
        else await sleep(50);
      }
      last = response ? 'unrecognized-http-response' : 'read-timeout';
      return null;
    } finally { if (fd >= 0) call(6, fd); }
  }
  while (now() < end) {
    const status = await attempt();
    if (status) { log('native-status:' + status); return status; }
    await sleep(500);
  }
  log('native-status-unverified:' + last);
  return null;
}
