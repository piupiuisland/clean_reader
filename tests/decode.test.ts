import { describe, expect, it } from 'vitest';
import { decodeText, UnsupportedFileError } from '../src/services/import/decode';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('decodeText', () => {
  it('decodes plain UTF-8 Chinese', () => {
    const r = decodeText(new TextEncoder().encode('第一章　开始\n“你好，世界。”'));
    expect(r.encoding).toBe('utf-8');
    expect(r.text).toBe('第一章　开始\n“你好，世界。”');
  });

  it('strips a UTF-8 BOM', () => {
    const r = decodeText(bytes(0xef, 0xbb, 0xbf, 0x41));
    expect(r).toEqual({ text: 'A', encoding: 'utf-8' });
  });

  it('decodes GBK bytes via GB18030', () => {
    // "中文，测试。" in GBK
    const r = decodeText(bytes(0xd6, 0xd0, 0xce, 0xc4, 0xa3, 0xac, 0xb2, 0xe2, 0xca, 0xd4, 0xa1, 0xa3));
    expect(r.encoding).toBe('gb18030');
    expect(r.text).toBe('中文，测试。');
  });

  it('decodes UTF-16LE with BOM', () => {
    const r = decodeText(bytes(0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65));
    expect(r).toEqual({ text: '中文', encoding: 'utf-16le' });
  });

  it('rejects binary data', () => {
    expect(() => decodeText(bytes(0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01))).toThrow(UnsupportedFileError);
  });

  it('rejects empty files', () => {
    expect(() => decodeText(new Uint8Array())).toThrow(UnsupportedFileError);
  });
});
