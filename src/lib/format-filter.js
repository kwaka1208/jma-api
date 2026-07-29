// 後方互換のために並行配信される旧形式電文を除外する。pure function。
//
// 気象警報・注意報は 2026-05-29 の体系変更で新形式(VPWW55-61)に移行したが、
// 旧形式(VPWW50/53/54)も後方互換で配信され続けている。同じ事象が旧新両方で
// 流れてくるため、素通しすると重複する。ここでは旧形式を落とし、新形式のみ残す。
//
// 判定は電文本体を取得せず、Atom entry の id(URL) と title だけで行う。
// - id(URL)内の電文コード(例 ..._VPWW53_...)が最も確実。あればこれを優先。
// - コードが取れない場合は title(=Control/Title)で判定する。

import formatFilterConfig from '../config/format-filter.json' with { type: 'json' };

// entry の id(URL) から電文コード(VPWWnn 等)を取り出す。取れなければ null。
export function extractReportCode(id) {
  if (!id) return null;
  const match = id.match(/_(V[A-Z]{3}\d{2})_/);
  return match ? match[1] : null;
}

// この entry が旧形式(後方互換で並行配信されるもの)か判定する。
export function isSuperseded(entry, config = formatFilterConfig) {
  const code = extractReportCode(entry?.id);
  if (code && config.supersededCodes.includes(code)) {
    return true;
  }
  // コードが取れない場合のみ title でフォールバック判定する。
  if (!code && entry?.title && config.supersededTitles.includes(entry.title)) {
    return true;
  }
  return false;
}

// 旧形式 entry を除いた配列を返す。
export function filterSuperseded(entries, config = formatFilterConfig) {
  return entries.filter((entry) => !isSuperseded(entry, config));
}
