// Test harness: deny outbound traffic in this Node process; keep its loopback HTTP server available.
const net = require('node:net');
const dns = require('node:dns');
const local = host => !host || ['127.0.0.1','localhost','::1','[::1]'].includes(String(host));
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : 'localhost';
  if (!local(host)) throw new Error('EXTERNAL_NETWORK_BLOCKED: ' + host);
  return originalConnect.apply(this, args);
};
const originalLookup = dns.lookup;
dns.lookup = function (hostname, ...args) {
  if (!local(hostname)) throw new Error('EXTERNAL_DNS_BLOCKED: ' + hostname);
  return originalLookup.call(this, hostname, ...args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (url, ...args) {
  if (!local(new URL(typeof url === 'string' || url instanceof URL ? url : url.url).hostname)) throw new Error('EXTERNAL_FETCH_BLOCKED');
  return originalFetch.call(this, url, ...args);
};
