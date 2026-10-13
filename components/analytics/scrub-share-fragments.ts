/**
 * OpenPanel's event filter (its `filter` option, which the Next.js component
 * writes into the init script as source, hence a string of plain JavaScript).
 * Whatever the page did to the URL, and however the visitor got there (Back,
 * Forward, a client-side link), no event property ever holds a secret:
 * - a /verify share fragment is cut off (it carries a paste);
 * - an invite link's token segment becomes "redacted" (/invite/redacted),
 *   also when the path is URL-encoded once or twice (%2Finvite%2F, %252Finvite%252F), in any case.
 * Every other URL is left as it is.
 */
export const SCRUB_SHARE_FRAGMENTS = `function (event) {
  var properties = event && event.payload && event.payload.properties;
  if (properties) {
    for (var key in properties) {
      var value = properties[key];
      if (typeof value !== 'string') continue;
      if (value.indexOf('#v=') !== -1) value = value.slice(0, value.indexOf('#v='));
      value = value.replace(/(\\/|%2F|%252F)invite(\\/|%2F|%252F)[A-Za-z0-9_-]*/gi, '$1invite$2redacted');
      properties[key] = value;
    }
  }
  return true;
}`
