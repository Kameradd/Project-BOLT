export const bytesToSignedInt16 = (msb, lsb) => {
  const value = (msb << 8) | lsb;
  return value & 0x8000 ? value - 0x10000 : value;
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeJsonCandidate = (text) =>
  String(text)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/:\s*-?Infinity\b/g, ":null")
    .replace(/:\s*NaN\b/g, ":null");

const parseLooseNumericObject = (rawText) => {
  const text = String(rawText || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }

  const body = text.slice(start + 1, end);
  const result = {};

  // Accepts forms like key: 12, "key": 12, 'key': 12
  const pairRegex = /(?:"([^"\\]+)"|'([^'\\]+)'|([A-Za-z_][A-Za-z0-9_]*))\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = pairRegex.exec(body)) !== null) {
    const key = match[1] || match[2] || match[3];
    const numeric = Number(match[4]);
    if (!key || !Number.isFinite(numeric)) {
      continue;
    }
    result[key] = numeric;
  }

  return Object.keys(result).length > 0 ? result : null;
};

const tryParseJsonObject = (rawText) => {
  const input = String(rawText || "").replace(/^\uFEFF/, "").trim();
  if (!input || !input.includes("{")) {
    return null;
  }

  const candidates = [];

  // Original input first.
  candidates.push(input);

  // Strip serial prefixes/suffixes and keep only first object envelope.
  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(input.slice(firstBrace, lastBrace + 1));
  }

  // Handle concatenated objects in one line: {...}{...}
  const chunks = input.match(/\{[^{}]*\}/g) || [];
  for (const chunk of chunks) {
    candidates.push(chunk);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue with normalized candidate.
    }

    try {
      return JSON.parse(normalizeJsonCandidate(candidate));
    } catch {
      // Try next candidate.
    }
  }

  for (const candidate of candidates) {
    const loose = parseLooseNumericObject(candidate);
    if (loose) {
      return loose;
    }
  }

  return null;
};

const tokenizeWords = (payload) => {
  const text = String(payload || "").trim().toUpperCase();
  if (!text) {
    return [];
  }

  // Fast path: contiguous hex payload.
  const compact = text.replace(/\s+/g, "");
  if (/^[0-9A-F]+$/.test(compact) && compact.length % 4 === 0) {
    const words = [];
    for (let index = 0; index < compact.length; index += 4) {
      words.push(compact.slice(index, index + 4));
    }
    return words;
  }

  // Common hardware formats: 0xABCD,ABCD;ABCD|ABCD etc.
  const without0x = text.replace(/0X/g, "");
  const relaxed = without0x.replace(/[\s,;:_\-|]+/g, "");
  if (/^[0-9A-F]+$/.test(relaxed) && relaxed.length % 4 === 0) {
    const words = [];
    for (let index = 0; index < relaxed.length; index += 4) {
      words.push(relaxed.slice(index, index + 4));
    }
    return words;
  }

  const extracted = [];
  const matches = without0x.match(/[0-9A-F]{4}/g) || [];
  for (const word of matches) {
    extracted.push(word);
  }
  return extracted;
};

export const inspectHexPayload = (hexString, expectedWords) => {
  const words = tokenizeWords(hexString);
  if (words.length === 0) {
    return { values: null, reason: "no_hex_words_detected" };
  }

  if (Number.isInteger(expectedWords) && expectedWords > 0 && words.length < expectedWords) {
    return {
      values: null,
      reason: `insufficient_words:${words.length}/${expectedWords}`
    };
  }

  const selectedWords =
    Number.isInteger(expectedWords) && expectedWords > 0 ? words.slice(0, expectedWords) : words;

  const values = [];
  for (const word of selectedWords) {
    if (!/^[0-9A-F]{4}$/.test(word)) {
      return { values: null, reason: `invalid_word:${word}` };
    }
    const msb = parseInt(word.slice(0, 2), 16);
    const lsb = parseInt(word.slice(2, 4), 16);
    values.push(bytesToSignedInt16(msb, lsb));
  }

  if (Number.isInteger(expectedWords) && expectedWords > 0 && words.length > expectedWords) {
    return {
      values,
      reason: `trimmed_extra_words:${words.length - expectedWords}`
    };
  }

  return { values, reason: null };
};

export const parseHexPayload = (hexString, expectedWords) =>
  inspectHexPayload(hexString, expectedWords).values;

export const inspectTelemetryPayload = (payload, options = {}) => {
  const { expectedWords, schema } = options;
  const text = String(payload || "").trim();

  if (!text) {
    return { values: null, channels: null, reason: "empty_payload", format: "unknown" };
  }

  if (text.includes("{")) {
    const parsed = tryParseJsonObject(text);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { values: null, channels: null, reason: "invalid_json", format: "json" };
    }

    const schemaFields = Array.isArray(schema) ? schema : [];
    const channels = {};
    const values = [];

    if (schemaFields.length === 0) {
      for (const [key, value] of Object.entries(parsed)) {
        const numeric = toFiniteNumber(value);
        if (numeric !== null) {
          channels[key] = numeric;
          values.push(numeric);
        }
      }

      if (values.length === 0) {
        return { values: null, channels: null, reason: "json_no_numeric_fields", format: "json" };
      }

      return { values, channels, reason: null, format: "json" };
    }

    let present = 0;
    for (const field of schemaFields) {
      const numeric = toFiniteNumber(parsed[field]);
      if (numeric === null) {
        channels[field] = 0;
        values.push(0);
        continue;
      }

      channels[field] = numeric;
      values.push(numeric);
      present += 1;
    }

    if (present === 0) {
      return { values: null, channels: null, reason: "json_schema_fields_missing", format: "json" };
    }

    const missing = schemaFields.length - present;
    return {
      values,
      channels,
      reason: missing > 0 ? `json_missing_fields:${missing}` : null,
      format: "json"
    };
  }

  const hexInspection = inspectHexPayload(text, expectedWords);
  if (!hexInspection.values) {
    return { values: null, channels: null, reason: hexInspection.reason, format: "hex" };
  }

  let channels = null;
  if (Array.isArray(schema) && schema.length > 0) {
    channels = {};
    for (let index = 0; index < schema.length; index += 1) {
      channels[schema[index]] = hexInspection.values[index] ?? 0;
    }
  }

  return {
    values: hexInspection.values,
    channels,
    reason: hexInspection.reason,
    format: "hex"
  };
};
