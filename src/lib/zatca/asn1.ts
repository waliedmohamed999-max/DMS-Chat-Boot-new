/**
 * ترميز DER (ASN.1) أدنى ما يلزم لبناء طلب شهادة ZATCA (CSR) — بلا مكتبات خارجية. كل دالة تعيد Buffer
 * بترميز DER كامل (وسم + طول + قيمة).
 */

function length(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(value.length), value]);
}

export const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items));
export const set = (...items: Buffer[]) => tlv(0x31, Buffer.concat(items));
export const integer = (n: number) => tlv(0x02, Buffer.from([n]));
export const octetString = (v: Buffer) => tlv(0x04, v);
export const bitString = (v: Buffer) => tlv(0x03, Buffer.concat([Buffer.from([0x00]), v]));
export const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, "utf8"));
export const printable = (s: string) => tlv(0x13, Buffer.from(s, "ascii"));
/** وسم سياقي ضمني/صريح مركّب: [n] — 0xa0 | n */
export const context = (n: number, v: Buffer) => tlv(0xa0 | n, v);

export function oid(dotted: string): Buffer {
  const parts = dotted.split(".").map(Number);
  const bytes: number[] = [40 * parts[0]! + parts[1]!];
  for (const p of parts.slice(2)) {
    const stack: number[] = [p & 0x7f];
    let v = p >>> 7;
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(...stack);
  }
  return tlv(0x06, Buffer.from(bytes));
}

/** RDN مفرد: SET { SEQ { OID, value } } */
export const rdn = (attrOid: string, value: Buffer) => set(seq(oid(attrOid), value));
