/**
 * Parse a web site origin from a hostname, URL or IP address.
 * Never allow credentials, paths, protocols other than HTTPS (HTTP on local
 * loopback only), query strings or fragments in the configured origin.
 */
export function normalizeWebsiteUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new TypeError('Enter a Planner website URL or IP address.');
  }
  const raw = input.trim();
  if (/\s/.test(raw)) throw new TypeError('Website URL cannot contain spaces.');
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)
    ? raw : 'https://' + raw;
  let parsed;
  try { parsed = new URL(withScheme); }
  catch { throw new TypeError('Enter a valid URL, domain or IP address (example: level.dwank.uk).'); }

  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== '/' || !parsed.hostname) {
    throw new TypeError('Enter only a website hostname/IP and optional port, without credentials, path, query or fragment.');
  }

  // Modern browsers and Node URL both reject malformed IPv6 in new URL().
  const hostname = parsed.hostname;
  const ipv6 = hostname.startsWith('[') && hostname.endsWith(']');
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) &&
    hostname.split('.').every(piece => Number(piece) <= 255);
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const validDomain = hostname.includes('.') &&
    hostname.length <= 253 &&
    hostname.split('.').every(label =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
  if (!ipv6 && !ipv4 && !local && !validDomain) {
    throw new TypeError('Enter a valid domain or IP address (for example level.dwank.uk or 192.168.1.40).');
  }
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
    throw new TypeError('Use HTTPS. HTTP is permitted only for localhost or loopback testing.');
  }
  return parsed.origin;
}
