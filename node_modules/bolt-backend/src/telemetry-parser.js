export const bytesToSignedInt16 = (msb, lsb) => {
  const value = (msb << 8) | lsb;
  return value & 0x8000 ? value - 0x10000 : value;
};

export const parseHexPayload = (hexString, expectedWords) => {
  const compact = hexString.replace(/\s+/g, "").toUpperCase();
  if (compact.length % 4 !== 0) {
    return null;
  }

  if (Number.isInteger(expectedWords) && expectedWords > 0) {
    const expectedLength = expectedWords * 4;
    if (compact.length !== expectedLength) {
      return null;
    }
  }

  const values = [];
  for (let index = 0; index < compact.length; index += 4) {
    const word = compact.slice(index, index + 4);
    if (!/^[0-9A-F]{4}$/.test(word)) {
      return null;
    }

    const msb = parseInt(word.slice(0, 2), 16);
    const lsb = parseInt(word.slice(2, 4), 16);
    values.push(bytesToSignedInt16(msb, lsb));
  }

  return values;
};
