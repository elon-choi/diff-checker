/**
 * Phase-2: selectorKey 추출 유틸리티
 * Spec 텍스트에서 selectorKey를 추출하는 함수들
 */

/**
 * 텍스트에서 selectorKey를 추출
 * 지원 형식:
 * 1) [key:xxx] 텍스트
 * 2) data-qa=xxx / data-testid=xxx 문구
 * 3) (selector: xxx) 형태
 */
export function extractSelectorKeyFromText(text: string): string | undefined {
  if (!text || typeof text !== 'string') return undefined;

  // 1) [key:xxx] 패턴
  const keyPattern = /\[key:([^\]]+)\]/i;
  const keyMatch = text.match(keyPattern);
  if (keyMatch && keyMatch[1]) {
    return normalizeKey(keyMatch[1]);
  }

  // 2) data-qa=xxx 또는 data-testid=xxx 패턴
  const dataQaPattern = /data-qa\s*=\s*["']?([^"'\s]+)["']?/i;
  const dataQaMatch = text.match(dataQaPattern);
  if (dataQaMatch && dataQaMatch[1]) {
    return normalizeKey(dataQaMatch[1]);
  }

  const dataTestIdPattern = /data-testid\s*=\s*["']?([^"'\s]+)["']?/i;
  const dataTestIdMatch = text.match(dataTestIdPattern);
  if (dataTestIdMatch && dataTestIdMatch[1]) {
    return normalizeKey(dataTestIdMatch[1]);
  }

  // 3) (selector: xxx) 패턴
  const selectorPattern = /\(selector\s*:\s*([^)]+)\)/i;
  const selectorMatch = text.match(selectorPattern);
  if (selectorMatch && selectorMatch[1]) {
    return normalizeKey(selectorMatch[1]);
  }

  return undefined;
}

/**
 * selectorKey를 표준화: 공백 제거, 소문자, 특수문자 최소화
 */
export function normalizeKey(key: string): string {
  if (!key) return '';
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.') // 공백을 점으로 변환
    .replace(/[^a-z0-9._-]/g, '') // 영문자, 숫자, 점, 언더스코어, 하이픈만 허용
    .replace(/\.+/g, '.') // 연속된 점을 하나로
    .replace(/^\.|\.$/g, ''); // 앞뒤 점 제거
}

/**
 * 텍스트에서 selectorKey를 제거하고 순수 텍스트만 반환
 */
export function removeSelectorKeyFromText(text: string): string {
  if (!text) return text;

  // [key:xxx] 제거
  let cleaned = text.replace(/\[key:[^\]]+\]/gi, '').trim();
  
  // data-qa=xxx 제거
  cleaned = cleaned.replace(/data-qa\s*=\s*["'][^"']+["']/gi, '').trim();
  cleaned = cleaned.replace(/data-testid\s*=\s*["'][^"']+["']/gi, '').trim();
  
  // (selector: xxx) 제거
  cleaned = cleaned.replace(/\(selector\s*:[^)]+\)/gi, '').trim();
  
  return cleaned;
}
