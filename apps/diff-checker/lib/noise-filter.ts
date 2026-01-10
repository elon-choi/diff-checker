/**
 * 노이즈 필터링: Footer/Policy/고객센터/약관/개인정보 등 고정 문구 제외
 */
export function isNoise(text: string): boolean {
  if (!text || text.trim().length < 2) return true;
  
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  
  // Footer/Policy 관련 고정 문구
  const footerKeywords = [
    '고객센터',
    '이용약관',
    '개인정보처리방침',
    '개인정보',
    '사업자 정보',
    '고객 지원',
    'customer service',
    'privacy policy',
    'terms of service',
    'footer',
    'policy',
  ];
  
  if (footerKeywords.some(keyword => lower.includes(keyword))) {
    return true;
  }
  
  // #태그 제외
  if (/^#/.test(trimmed)) {
    return true;
  }
  
  // @포함 제외
  if (/@/.test(trimmed)) {
    return true;
  }
  
  // 숫자-only 제외 (예: "26", "3", "2025")
  if (/^\d+$/.test(trimmed)) {
    return true;
  }
  
  // 다크모드 관련 제외
  if (lower.includes('다크모드') || lower.includes('dark mode')) {
    return true;
  }
  
  // 작품명/작가명 패턴 제외 (쉼표로 구분된 여러 이름)
  if (/^[가-힣\w\s,]+$/.test(trimmed) && trimmed.includes(',') && trimmed.split(',').length >= 2) {
    // 작품명/작가명으로 보이는 패턴
    return true;
  }
  
  // 반복 다량 텍스트 (같은 문자가 3번 이상 반복)
  if (/(.)\1{2,}/.test(trimmed)) {
    return true;
  }
  
  // UI 레이블이 아닌 일반 텍스트 (너무 긴 문장)
  if (trimmed.length > 50 && !trimmed.includes('"')) {
    return true;
  }
  
  return false;
}

/**
 * SpecItem이 노이즈인지 확인
 */
export function isNoiseSpecItem(item: { text?: string; kind?: string; meta?: any }): boolean {
  if (!item.text) return true;
  
  const text = item.text.trim();
  
  // 표에서 추출된 항목은 더 관대하게 처리
  if (item.meta?.source === 'table') {
    // 표에서 추출된 항목은 기본적인 노이즈만 제외
    if (text.length < 2) return true;
    if (/^https?:\/\//i.test(text)) return true;
    if (/^[A-Z]+-\d+$/i.test(text)) return true; // Jira 티켓
    if (/^(비고|참고|note|reference):?$/i.test(text)) return true;
    // 표에서 추출된 항목은 나머지는 허용
    return false;
  }
  
  // 일반 텍스트는 기존 노이즈 필터 적용
  return isNoise(item.text);
}
