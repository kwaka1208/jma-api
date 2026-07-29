import { test } from 'node:test';
import assert from 'node:assert';
import {
  extractReportCode,
  isSuperseded,
  filterSuperseded,
} from '../../src/lib/format-filter.js';

// 実フィード fixtures に出現する実際の entry id(URL)
const NEW_GIFU = {
  // VPWW55 相当（R06 新形式・大雨）
  id: 'https://www.data.jma.go.jp/developer/xml/data/20260728120000_0_VPWW55_210000.xml',
  title: '気象警報・注意報（Ｒ０６）（大雨）',
};
const OLD_TOYAMA_VPWW53 = {
  // fixtures/reports/keiho_toyama_companion_vpww53.xml と同じ id 形式
  id: 'https://www.data.jma.go.jp/developer/xml/data/20260728094437_0_VPWW53_160000.xml',
  title: '気象特別警報・警報・注意報',
};
const OLD_H27_VPWW54 = {
  id: 'https://www.data.jma.go.jp/developer/xml/data/20260728094437_0_VPWW54_160000.xml',
  title: '気象警報・注意報（Ｈ２７）',
};

test('extractReportCode', async (t) => {
  await t.test('URL から電文コードを取り出す', () => {
    assert.strictEqual(extractReportCode(OLD_TOYAMA_VPWW53.id), 'VPWW53');
    assert.strictEqual(extractReportCode(NEW_GIFU.id), 'VPWW55');
  });

  await t.test('コードが無い/空なら null', () => {
    assert.strictEqual(extractReportCode('https://example.com/foo.xml'), null);
    assert.strictEqual(extractReportCode(''), null);
    assert.strictEqual(extractReportCode(undefined), null);
  });
});

test('isSuperseded', async (t) => {
  await t.test('旧形式(VPWW53/54)は true', () => {
    assert.strictEqual(isSuperseded(OLD_TOYAMA_VPWW53), true);
    assert.strictEqual(isSuperseded(OLD_H27_VPWW54), true);
  });

  await t.test('新形式(VPWW55, R06)は false', () => {
    assert.strictEqual(isSuperseded(NEW_GIFU), false);
  });

  await t.test('コードが取れない場合は title でフォールバック判定', () => {
    assert.strictEqual(
      isSuperseded({ id: 'https://example.com/x.xml', title: '気象特別警報・警報・注意報' }),
      true
    );
    assert.strictEqual(
      isSuperseded({ id: 'https://example.com/x.xml', title: '震源・震度に関する情報' }),
      false
    );
  });

  await t.test('新形式コードなら title が旧形式名でもコードを優先(誤除外しない)', () => {
    // 実運用では起こらない組み合わせだが、コード優先の挙動を固定する
    assert.strictEqual(
      isSuperseded({ id: NEW_GIFU.id, title: '気象特別警報・警報・注意報' }),
      false
    );
  });
});

test('filterSuperseded', async (t) => {
  await t.test('旧形式だけを落として新形式を残す', () => {
    const entries = [NEW_GIFU, OLD_TOYAMA_VPWW53, OLD_H27_VPWW54];
    const result = filterSuperseded(entries);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0], NEW_GIFU);
  });

  await t.test('空配列はそのまま', () => {
    assert.deepStrictEqual(filterSuperseded([]), []);
  });
});
