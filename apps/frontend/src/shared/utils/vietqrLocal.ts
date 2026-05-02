import QRCode from "qrcode";

const BANK_BINS: Record<string, string> = {
  VPB: "970432",
  VCB: "970436",
  TCB: "970407",
  MB: "970422",
  ACB: "970416",
  TPB: "970423",
  STB: "970403",
  BIDV: "970418",
  CTG: "970415",
  SHB: "970443",
};

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16CcittFalse(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildVietQrPayload({
  bankCode,
  accountNumber,
  amount,
  description,
}: {
  bankCode: string;
  accountNumber: string;
  amount?: number;
  description?: string;
}): string {
  const bin = BANK_BINS[bankCode.toUpperCase()] ?? bankCode;

  const acqInfo = tlv("00", bin) + tlv("01", accountNumber);
  const merchantAcct =
    tlv("00", "A000000727") + tlv("01", acqInfo) + tlv("02", "QRIBFTTA");

  let payload =
    tlv("00", "01") +
    tlv("01", "12") +
    tlv("38", merchantAcct) +
    tlv("52", "0000") +
    tlv("53", "704") +
    tlv("58", "VN");

  if (amount && amount > 0) {
    payload += tlv("54", Math.round(amount).toString());
  }

  if (description) {
    payload += tlv("62", tlv("08", description));
  }

  payload += "6304";
  payload += crc16CcittFalse(payload);

  return payload;
}

let _qrCache = new Map<string, string>();
const MAX_CACHE = 50;

export async function generateVietQrDataUrl(opts: {
  bankCode: string;
  accountNumber: string;
  amount?: number;
  description?: string;
  width?: number;
}): Promise<string> {
  const payload = buildVietQrPayload(opts);

  const cached = _qrCache.get(payload);
  if (cached) return cached;

  const dataUrl = await QRCode.toDataURL(payload, {
    width: opts.width ?? 280,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  if (_qrCache.size >= MAX_CACHE) {
    const firstKey = _qrCache.keys().next().value;
    if (firstKey) _qrCache.delete(firstKey);
  }
  _qrCache.set(payload, dataUrl);

  return dataUrl;
}
