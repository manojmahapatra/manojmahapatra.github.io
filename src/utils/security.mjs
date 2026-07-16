const JSON_SCRIPT_ESCAPES = Object.freeze({
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
});

/**
 * Serializes data for an HTML script element without allowing the HTML parser
 * to terminate the element early. The result remains valid JSON.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function serializeJsonForHtml(value) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("Cannot serialize an undefined JSON-LD value");
  }

  return serialized.replace(/[<>&\u2028\u2029]/g, (character) => JSON_SCRIPT_ESCAPES[character]);
}
