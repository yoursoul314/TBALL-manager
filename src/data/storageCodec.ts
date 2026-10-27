import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
const FORMAT = 'tb-manager-compressed-json';
const THRESHOLD = 128_000;
export const MAX_BACKUP_BYTES = 64_000_000;
// Detect accidental corruption, not encryption or authentication.
function checksum(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
/** Keep small JSON readable; losslessly compress large nested migration archives. */
export function encodeStorageText(text: string, force = false) {
  if (text.length > MAX_BACKUP_BYTES) throw Error('저장본 크기 한도 초과: 원본을 유지합니다');
  if (!force && text.length < THRESHOLD) return text;
  const payload = compressToUTF16(text);
  if (decompressFromUTF16(payload) !== text) throw Error('저장 압축 검증 실패: 원본을 유지합니다');
  const encoded = JSON.stringify({
    format: FORMAT,
    encoding: 'lz-string-utf16-v1',
    length: text.length,
    checksum: checksum(text),
    payload,
  });
  return encoded.length < text.length ? encoded : text;
}
/** Plain v1–v12 JSON and existing external backups remain supported. */
export function decodeStorageText(raw: string): string {
  const envelope = JSON.parse(raw);
  if (envelope?.format !== FORMAT) return raw;
  if (
    envelope.encoding !== 'lz-string-utf16-v1' ||
    !Number.isSafeInteger(envelope.length) ||
    envelope.length < 0 ||
    envelope.length > MAX_BACKUP_BYTES ||
    typeof envelope.payload !== 'string' ||
    typeof envelope.checksum !== 'string'
  )
    throw Error('지원하지 않거나 손상된 압축 저장 형식: 원본을 유지합니다');
  const text = decompressFromUTF16(envelope.payload);
  if (
    typeof text !== 'string' ||
    text.length !== envelope.length ||
    checksum(text) !== envelope.checksum
  )
    throw Error('압축 기록 무결성 확인 실패: 원본을 유지합니다');
  return text;
}
export function isQuotaError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return (typeof name === 'string' && ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(name)) || (typeof message === 'string' && /quota|storage.*full/i.test(message));
}
export function writeStorageText(storage: Pick<Storage, 'setItem'>, key: string, text: string) {
  const encoded = encodeStorageText(text);
  try {
    storage.setItem(key, encoded);
  } catch (error) {
    // setItem is atomic. Never delete another key to make a failed write fit.
    if (!isQuotaError(error) || encoded !== text) throw error;
    storage.setItem(key, encodeStorageText(text, true));
  }
}
