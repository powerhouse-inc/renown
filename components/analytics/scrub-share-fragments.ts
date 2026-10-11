/**
 * OpenPanel's event filter (its `filter` option, which the Next.js component
 * writes into the init script as source, hence a string of plain JavaScript):
 * cuts a /verify share fragment out of every property an event carries, so no
 * screen view or event path ever holds a paste, whatever the page did to the
 * URL. Every other URL is left as it is.
 */
export const SCRUB_SHARE_FRAGMENTS = `function (event) {
  var properties = event && event.payload && event.payload.properties;
  if (properties) {
    for (var key in properties) {
      var value = properties[key];
      if (typeof value === 'string' && value.indexOf('#v=') !== -1) properties[key] = value.slice(0, value.indexOf('#v='));
    }
  }
  return true;
}`
