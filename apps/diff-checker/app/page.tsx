'use client';
import React, { useMemo, useState, useEffect } from 'react';
import type { Finding } from '@/lib/diff';
import { toMarkdown, toHtml } from '@/lib/report';
import { parseWikiSections, extractSelectedSectionsHtml, parsePdfSections, extractSelectedPdfSections, type WikiSection } from '@/lib/wiki-parser';
type Phase = 1 | 2 | 3 | 4;
type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
type Category = 'TEXT_MISMATCH' | 'MISSING_ELEMENT' | 'VISIBILITY' | 'POLICY' | 'STRUCTURE';

type SpecInputMode = 'text' | 'wiki' | 'file';

export default function Page() {
  const [phase, setPhase] = useState<Phase>(1);
  const [specInputMode, setSpecInputMode] = useState<SpecInputMode>('text');
  const [specText, setSpecText] = useState('성인 등급은 이용이 제한됩니다\n확인 버튼 노출');
  const [specWikiUrl, setSpecWikiUrl] = useState<string>('');
  const [specWikiRawText, setSpecWikiRawText] = useState<string>(''); // 위키에서 가져온 원본 텍스트
  const [specWikiHtml, setSpecWikiHtml] = useState<string>(''); // 위키에서 가져온 원본 HTML
  const [specWikiSelectedHtml, setSpecWikiSelectedHtml] = useState<string>(''); // 선택된 섹션의 HTML
  const [wikiSections, setWikiSections] = useState<WikiSection[]>([]); // 파싱된 섹션 목록 (위키 또는 PDF)
  const [selectedSections, setSelectedSections] = useState<string[]>([]); // 선택한 섹션 ID 목록
  const [pdfRawText, setPdfRawText] = useState<string>(''); // PDF에서 가져온 원본 텍스트
  const [pdfSelectedText, setPdfSelectedText] = useState<string>(''); // 선택된 PDF 섹션의 텍스트
  const [confluenceEmail, setConfluenceEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('confluence_email') || '';
    }
    return '';
  });
  const [confluenceToken, setConfluenceToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('confluence_token') || '';
    }
    return '';
  });
  const [confluenceBaseUrl, setConfluenceBaseUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('confluence_base_url') || '';
    }
    return '';
  });
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [figmaText, setFigmaText] = useState<string>('');
  const [figmaUrl, setFigmaUrl] = useState<string>('');
  const [figmaToken, setFigmaToken] = useState<string>('');
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [figmaInputMode, setFigmaInputMode] = useState<'api' | 'json' | 'file'>('json');
  const [webText, setWebText] = useState<string>('');
  const [androidText, setAndroidText] = useState<string>('');
  const [iosText, setIosText] = useState<string>('');

  const [findings, setFindings] = useState<Finding[]>([]);
  const [specItemsCount, setSpecItemsCount] = useState<number>(0); // API에서 받은 SpecItem 개수
  const [running, setRunning] = useState(false);
  const [llmValidationEnabled, setLlmValidationEnabled] = useState(false); // LLM 검증 활성화 상태
  // Phase-2: 필터 토글
  const [showKeyedOnly, setShowKeyedOnly] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(true);
  const [showReverse, setShowReverse] = useState(false);
  const [showDebug, setShowDebug] = useState(false); // Debug 패널 토글

  // Phase 1: 필터링된 findings (Safe Upgrade Plan - Debug 패널 분리)
  const filteredFindings = useMemo(() => {
    return findings.filter(f => {
      const selectorKey = (f as any).selectorKey;
      const diffType = (f as any).diffType;
      const ruleName = (f as any).meta?.ruleName;
      
      // Debug 모드가 아니면 reverse와 unmapped 숨김
      if (!showDebug) {
        if (ruleName === 'reverse.comparison') return false;
        if (diffType === 'UNMAPPED') return false;
      }
      
      // Keyed only 필터 (Debug 모드에서만 사용)
      if (showKeyedOnly && !selectorKey) return false;
      
      // Unmapped 필터 (Debug 모드에서만 사용)
      if (!showUnmapped && diffType === 'UNMAPPED') return false;
      
      // Reverse 필터 (Debug 모드에서만 사용)
      if (!showReverse && ruleName === 'reverse.comparison') return false;
      
      return true;
    });
  }, [findings, showKeyedOnly, showUnmapped, showReverse, showDebug]);

  const summary = useMemo(() => {
    // Severity별 Finding 수는 전체 findings를 기준으로 계산 (필터링 전)
    const by: Record<string, number> = { CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0, WARN: 0 };
    const byReasonCode: Record<string, number> = {};
    
    // 전체 findings를 기준으로 계산
    for (const f of findings) {
      const severity = f.severity || 'INFO';
      by[severity] = (by[severity] || 0) + 1;
      const reasonCode = (f as any).decisionMetadata?.decision_reason_code || 'UNKNOWN';
      byReasonCode[reasonCode] = (byReasonCode[reasonCode] || 0) + 1;
    }
    
    return { bySeverity: by, byReasonCode, total: findings.length };
  }, [findings]);

  // Phase 1: SpecItem 기준 그룹화 (Safe Upgrade Plan)
  const groupedFindings = useMemo(() => {
    const groups: Record<string, { specTitle: string; specItemId?: string; findings: Finding[] }> = {};
    
    for (const f of filteredFindings) {
      // SpecItem ID 또는 requirement를 key로 사용
      const specItemId = (f as any).relatedSpecId || f.id.split(':')[1] || 'unknown';
      const requirement = (f as any).requirement || 
                          (f as any).specSideEvidence?.spec_section || 
                          (f as any).meta?.section || 
                          '기타';
      
      // specTitle 생성 (sectionPath 또는 requirement 사용)
      const specTitle = (f as any).requirement || 
                       (f as any).specSideEvidence?.spec_section || 
                       (f as any).meta?.section || 
                       '기타';
      
      const key = specItemId !== 'unknown' ? specItemId : requirement;
      
      if (!groups[key]) {
        groups[key] = {
          specTitle,
          specItemId: specItemId !== 'unknown' ? specItemId : undefined,
          findings: [],
        };
      }
      groups[key].findings.push(f);
    }
    
    return groups;
  }, [filteredFindings]);
  
  // 요구사항별 통계 계산 (Safe Upgrade Plan - 전체 findings 기준)
  const requirementStats = useMemo(() => {
    // SpecItem 개수를 기준으로 요구사항 수 계산
    const totalRequirements = specItemsCount > 0 ? specItemsCount : 0;
    
    if (totalRequirements === 0) {
      return { totalRequirements: 0, matchedCount: 0, diffCount: 0 };
    }
    
    // 전체 findings를 기준으로 계산 (필터링 전)
    // SpecItem과 매핑된 finding만 요구사항 차이로 계산
    const specItemIdsWithFindings = new Set<string>();
    
    for (const f of findings) {
      // reverse.comparison은 요구사항 차이가 아님 (Figma에만 있는 것)
      const ruleName = (f as any).meta?.ruleName;
      if (ruleName === 'reverse.comparison') {
        continue; // reverse finding은 요구사항 차이에 포함하지 않음
      }
      
      // SpecItem과 매핑된 finding만 카운트
      const specItemId = (f as any).relatedSpecId || f.id.split(':')[1];
      if (specItemId && specItemId !== 'unknown') {
        const hasDiff = f.severity === 'MAJOR' || 
                       f.severity === 'CRITICAL' || 
                       f.severity === 'WARN' || 
                       f.severity === 'MINOR';
        if (hasDiff) {
          specItemIdsWithFindings.add(specItemId);
        }
      }
    }
    
    const diffCount = specItemIdsWithFindings.size;
    const matchedCount = Math.max(0, totalRequirements - diffCount);
    
    return { totalRequirements, matchedCount, diffCount };
  }, [findings, specItemsCount]);

  const sortedFindings = useMemo(() => {
    const severityOrder: Record<string, number> = {
      CRITICAL: 0,
      MAJOR: 1,
      WARN: 2,
      MINOR: 3,
      INFO: 4,
    };
    return [...findings].sort((a, b) => {
      return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
    });
  }, [findings]);

  const parseJSON = (s: string) => (s.trim() ? JSON.parse(s) : undefined);

  async function handleSpecWikiFetch() {
    if (!specWikiUrl.trim()) {
      alert('위키 링크를 입력해주세요.');
      return;
    }
    
    // Confluence 인증 정보를 로컬 스토리지에 저장
    if (typeof window !== 'undefined') {
      if (confluenceEmail) localStorage.setItem('confluence_email', confluenceEmail);
      if (confluenceToken) localStorage.setItem('confluence_token', confluenceToken);
      if (confluenceBaseUrl) localStorage.setItem('confluence_base_url', confluenceBaseUrl);
    }
    
    setSpecLoading(true);
    try {
      const res = await fetch('/api/spec/fetch-wiki', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: specWikiUrl,
          confluenceEmail: confluenceEmail || undefined,
          confluenceToken: confluenceToken || undefined,
          confluenceBaseUrl: confluenceBaseUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresAuth) {
          alert(
            '인증이 필요한 위키입니다.\n\n' +
            'Confluence를 사용하는 경우:\n' +
            '1. Confluence API 토큰 발급 (설정 → 보안 → API 토큰)\n' +
            '2. 이메일, API 토큰 입력 (Base URL은 자동 추출됩니다)\n\n' +
            '또는 위키 내용을 직접 복사하여 "텍스트 입력" 탭에 붙여넣으세요.'
          );
        }
        alert(`오류: ${data?.error || '위키 내용을 가져오는데 실패했습니다.'}`);
        throw new Error(data?.error || '위키 내용을 가져오는데 실패했습니다.');
      }
      const rawText = data.text || '';
      const rawHtml = data.html || '';
      
      setSpecWikiRawText(rawText);
      setSpecWikiHtml(rawHtml);
      
      // HTML에서 섹션 파싱
      if (rawHtml) {
        const sections = parseWikiSections(rawHtml);
        setWikiSections(sections);
        
        // 기본적으로 모든 섹션 선택 (개요/성과/목표 같은 섹션은 나중에 제외 가능)
        const allSectionIds = getAllSectionIds(sections);
        setSelectedSections(allSectionIds);
        
        // 선택된 섹션만 추출하여 specText에 설정 (HTML 그대로 전달하여 표 파싱 가능하게 함)
        const selectedHtml = extractSelectedSectionsHtml(rawHtml, allSectionIds);
        setSpecWikiSelectedHtml(selectedHtml);
        setSpecText(selectedHtml); // HTML을 그대로 전달하여 표 파싱 가능하게 함
      } else {
        // HTML이 없으면 텍스트만 사용
        setSpecText(rawText);
        setWikiSections([]);
        setSelectedSections([]);
      }
      
      alert('위키 내용을 불러왔습니다. 섹션 선택 UI에서 비교에 포함할 섹션을 선택하세요.');
    } catch (e: any) {
      alert(e?.message ?? '위키 내용을 가져오는데 실패했습니다.');
    } finally {
      setSpecLoading(false);
    }
  }
  
  function handleConfluenceClear() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('confluence_email');
      localStorage.removeItem('confluence_token');
      localStorage.removeItem('confluence_base_url');
      setConfluenceEmail('');
      setConfluenceToken('');
      setConfluenceBaseUrl('');
      alert('저장된 Confluence 인증 정보가 삭제되었습니다.');
    }
  }

  async function handleSpecFileUpload(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 파일만 업로드 가능합니다.');
      return;
    }
    setSpecLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/spec/parse-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'PDF 파싱에 실패했습니다.');
      
      const pdfText = data.text || '';
      setPdfRawText(pdfText);
      setSpecText(pdfText);
      
      // PDF 텍스트에서 섹션 파싱
      const sections = parsePdfSections(pdfText);
      setWikiSections(sections);
      setSelectedSections([]); // 초기에는 선택 없음
      setPdfSelectedText('');
      
      alert('PDF 내용을 불러왔습니다. 섹션을 선택하여 원하는 영역만 추출할 수 있습니다.');
    } catch (e: any) {
      alert(e?.message ?? 'PDF 파싱에 실패했습니다.');
    } finally {
      setSpecLoading(false);
    }
  }

  async function onRun() {
    setRunning(true);
    try {
      // 선택된 섹션이 있으면 해당 내용 전달
      let specContent = specText;
      let isHtml = false;
      
      if (selectedSections.length > 0) {
        // 위키 HTML인 경우
        if (specWikiSelectedHtml) {
          specContent = specWikiSelectedHtml;
          isHtml = true;
        }
        // PDF 텍스트인 경우
        else if (pdfSelectedText) {
          specContent = pdfSelectedText;
          isHtml = false;
        }
      } else {
        // 선택된 섹션이 없으면 원본 사용
        if (specWikiHtml) {
          specContent = specWikiHtml;
          isHtml = true;
        } else if (pdfRawText) {
          specContent = pdfRawText;
          isHtml = false;
        }
      }
      
      // HTML인지 확인 (<table 태그가 있으면 HTML로 간주)
      if (!isHtml) {
        isHtml = specContent.includes('<table');
      }
      
      const res = await fetch('/api/diff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phase,
          specText: specContent,
          specHtml: isHtml ? specContent : undefined,
          figmaJson: parseJSON(figmaText),
          webJson: parseJSON(webText),
          androidJson: parseJSON(androidText),
          iosJson: parseJSON(iosText),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Guardrail 에러인 경우 특별 처리
        if (data.message && (data.message.includes('Spec 추출 실패') || data.message.includes('Spec 추출 부족'))) {
          alert(`⚠️ ${data.message}\n\n표 파싱 또는 섹션 선택을 확인해주세요.`);
          return;
        }
        throw new Error(data?.error || data?.message || 'diff failed');
      }
      setFindings(data.findings || []);
      setSpecItemsCount(data.summary?.specItemsCount || 0); // SpecItem 개수 저장
      setLlmValidationEnabled(data.summary?.llmValidation?.used || false); // LLM 검증 사용 여부
    } catch (e: any) {
      alert(e?.message ?? 'failed');
    } finally {
      setRunning(false);
    }
  }

  function onExportMarkdown() {
    const md = toMarkdown(findings, phase);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phase-${phase}-diff.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onExportJson() {
    const json = JSON.stringify(
      {
        phase,
        summary: {
          total: findings.length,
          bySeverity: summary,
        },
        findings,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phase-${phase}-diff.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onExportHtml() {
    const html = toHtml(findings, phase);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phase-${phase}-diff.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFigmaFetch() {
    if (!figmaUrl.trim()) {
      alert('Figma 파일 URL을 입력해주세요.');
      return;
    }
    if (!figmaToken.trim()) {
      alert('Figma Personal Access Token을 입력해주세요.');
      return;
    }
    
    // 토큰을 로컬 스토리지에 저장
    if (typeof window !== 'undefined') {
      localStorage.setItem('figma_token', figmaToken);
    }
    
    setFigmaLoading(true);
    try {
      const res = await fetch('/api/figma/fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: figmaUrl, token: figmaToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Rate limit 에러인 경우 더 자세한 안내
        if (res.status === 429) {
          alert(`${data?.error || 'Figma API 요청 한도가 초과되었습니다.'}\n\n대안: Figma Plugin을 사용하여 JSON을 직접 복사해 붙여넣으세요.`);
        } else {
          throw new Error(data?.error || 'Figma 파일을 가져오는데 실패했습니다.');
        }
        return;
      }
      setFigmaText(JSON.stringify(data.json, null, 2));
      alert('Figma 파일을 성공적으로 가져왔습니다.');
    } catch (e: any) {
      alert(e?.message ?? 'Figma 파일을 가져오는데 실패했습니다.');
    } finally {
      setFigmaLoading(false);
    }
  }
  
  function handleFigmaTokenClear() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('figma_token');
      setFigmaToken('');
      alert('저장된 토큰이 삭제되었습니다.');
    }
  }

  // 섹션 선택 변경 핸들러
  function handleSectionToggle(sectionId: string) {
    setSelectedSections(prev => {
      if (prev.includes(sectionId)) {
        // 선택 해제 시 하위 섹션도 모두 해제
        const newSelected = prev.filter(id => id !== sectionId);
        const section = findSectionById(wikiSections, sectionId);
        if (section) {
          const childIds = getAllSectionIds([section]);
          return newSelected.filter(id => !childIds.includes(id));
        }
        return newSelected;
      } else {
        // 선택 시 하위 섹션도 모두 선택
        const section = findSectionById(wikiSections, sectionId);
        if (section) {
          const childIds = getAllSectionIds([section]);
          return [...prev, sectionId, ...childIds];
        }
        return [...prev, sectionId];
      }
    });
  }

  // 선택된 섹션 변경 시 specText 업데이트
  useEffect(() => {
    // 위키 HTML인 경우
    if (specWikiHtml && selectedSections.length > 0 && wikiSections.length > 0) {
      const selectedHtml = extractSelectedSectionsHtml(specWikiHtml, selectedSections);
      setSpecWikiSelectedHtml(selectedHtml);
      // HTML을 그대로 전달 (표 파싱을 위해)
      setSpecText(selectedHtml);
    } else if (specWikiHtml && selectedSections.length === 0) {
      // 아무것도 선택되지 않으면 빈 텍스트
      setSpecWikiSelectedHtml('');
      setSpecText('');
    }
    
    // PDF 텍스트인 경우
    if (pdfRawText && selectedSections.length > 0 && wikiSections.length > 0) {
      const selectedText = extractSelectedPdfSections(pdfRawText, selectedSections);
      setPdfSelectedText(selectedText);
      setSpecText(selectedText);
    } else if (pdfRawText && selectedSections.length === 0) {
      // 아무것도 선택되지 않으면 전체 텍스트 사용
      setPdfSelectedText('');
      setSpecText(pdfRawText);
    }
  }, [selectedSections, specWikiHtml, pdfRawText, wikiSections]);

  // 헬퍼 함수들
  function getAllSectionIds(sections: WikiSection[]): string[] {
    const ids: string[] = [];
    function traverse(sections: WikiSection[]) {
      for (const section of sections) {
        ids.push(section.id);
        if (section.children.length > 0) {
          traverse(section.children);
        }
      }
    }
    traverse(sections);
    return ids;
  }

  function findSectionById(sections: WikiSection[], id: string): WikiSection | null {
    for (const section of sections) {
      if (section.id === id) return section;
      const found = findSectionById(section.children, id);
      if (found) return found;
    }
    return null;
  }

  function extractTextFromSelectedHtml(html: string): string {
    if (typeof window === 'undefined') return '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    return doc.body?.textContent?.trim() || '';
  }

  function renderSectionTree(sections: WikiSection[], depth: number = 0): React.ReactNode {
    return sections.map(section => (
      <div key={section.id} className={depth > 0 ? 'ml-4 mt-1' : ''}>
        <label className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
          <input
            type="checkbox"
            checked={selectedSections.includes(section.id)}
            onChange={() => handleSectionToggle(section.id)}
            className="mt-1"
          />
          <div className="flex-1">
            <span className={`font-medium text-sm ${depth === 0 ? 'text-base' : ''}`}>
              {section.title || '(제목 없음)'}
            </span>
            {section.text && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {section.text.substring(0, 100)}...
              </p>
            )}
          </div>
        </label>
        {section.children.length > 0 && (
          <div className="mt-1">
            {renderSectionTree(section.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  }

  function pasteSample(target: 'figma' | 'web' | 'android' | 'ios') {
    const figs = `{
  "type": "FRAME",
  "name": "UserGrade/Restriction",
  "visible": true,
  "children": [
    { "type": "TEXT", "name": "Title", "characters": "성인 작품은 노출되지 않습니다", "visible": true }
  ]
}`;
    const web = `{
  "elements": [
    { "role": "text", "id": "msg", "text": "허용된 등급 이상만 볼 수 있어요", "visible": true },
    { "role": "button", "id": "ok", "text": "확인", "visible": true }
  ]
}`;
    const andr = `{
  "nodes": [
    { "role": "text", "resourceId": "tvMessage", "text": "허용된 등급 이상만 볼 수 있어요", "visible": true },
    { "role": "image", "resourceId": "ivAdultBadge", "name": "adultIcon", "visible": true }
  ]
}`;
    const ios = `{
  "nodes": [
    { "role": "text", "name": "label.message", "text": "성인 등급은 이용이 제한됩니다", "visible": true },
    { "role": "button", "name": "btn.ok", "text": "확인", "visible": true }
  ]
}`;
    if (target === 'figma') setFigmaText(figs);
    if (target === 'web') setWebText(web);
    if (target === 'android') setAndroidText(andr);
    if (target === 'ios') setIosText(ios);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-[2.5rem] font-semibold tracking-tight">Spec Diff Checker</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(Number(e.target.value) as Phase)}
              className="rounded-md border-gray-300 text-sm shadow-sm focus:ring-2 focus:ring-black/10"
            >
              <option value={1}>1: Spec ↔ Figma</option>
              <option value={2}>2: + Web</option>
              <option value={3}>3: + Android</option>
              <option value={4}>4: + iOS</option>
            </select>
            <button
              onClick={onRun}
              disabled={running}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm shadow hover:bg-gray-900 disabled:opacity-50"
            >
              {running ? 'Running…' : 'Run Diff'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={onExportMarkdown}
                disabled={findings.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={findings.length === 0 ? '결과가 없습니다' : 'Markdown 형식으로 내보내기'}
              >
                Export Markdown
              </button>
              <button
                onClick={onExportJson}
                disabled={findings.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={findings.length === 0 ? '결과가 없습니다' : 'JSON 형식으로 내보내기'}
              >
                Export JSON
              </button>
              <button
                onClick={onExportHtml}
                disabled={findings.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={findings.length === 0 ? '결과가 없습니다' : 'HTML 형식으로 내보내기'}
              >
                Export HTML
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">① Inputs</h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Spec 입력 방식</label>
                </div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setSpecInputMode('text')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      specInputMode === 'text'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    텍스트 입력
                  </button>
                  <button
                    onClick={() => setSpecInputMode('wiki')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      specInputMode === 'wiki'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    위키 링크
                  </button>
                  <button
                    onClick={() => setSpecInputMode('file')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      specInputMode === 'file'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    PDF 업로드
                  </button>
                </div>
                {specInputMode === 'text' && (
                  <textarea
                    className="w-full min-h-[120px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                    value={specText}
                    onChange={(e) => setSpecText(e.target.value)}
                    placeholder="정책/문구를 한 줄씩 입력하세요"
                  />
                )}
                {specInputMode === 'wiki' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2"
                        value={specWikiUrl}
                        onChange={(e) => setSpecWikiUrl(e.target.value)}
                        placeholder="위키 페이지 URL을 입력하세요"
                      />
                      <button
                        onClick={handleSpecWikiFetch}
                        disabled={specLoading}
                        className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50"
                      >
                        {specLoading ? '불러오는 중...' : '가져오기'}
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-700">Confluence 인증 (선택사항)</p>
                        {(confluenceEmail || confluenceToken || confluenceBaseUrl) && (
                          <button
                            onClick={handleConfluenceClear}
                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                            title="저장된 인증 정보 삭제"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="email"
                          className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5"
                          value={confluenceEmail}
                          onChange={(e) => setConfluenceEmail(e.target.value)}
                          placeholder={confluenceEmail ? '이메일 저장됨' : '이메일'}
                        />
                        <input
                          type="password"
                          className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5"
                          value={confluenceToken}
                          onChange={(e) => setConfluenceToken(e.target.value)}
                          placeholder={confluenceToken ? '토큰 저장됨' : 'API 토큰'}
                        />
                        <input
                          type="text"
                          className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5"
                          value={confluenceBaseUrl}
                          onChange={(e) => setConfluenceBaseUrl(e.target.value)}
                          placeholder={confluenceBaseUrl ? 'Base URL 저장됨' : 'Base URL (예: https://your-domain.atlassian.net)'}
                        />
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>💡 인증이 필요한 위키는 Confluence 정보를 입력하세요. 공개 위키는 비워두세요.</p>
                        {(confluenceEmail || confluenceToken || confluenceBaseUrl) && (
                          <p className="text-green-600">✓ 인증 정보가 저장되었습니다. 새로고침해도 유지됩니다.</p>
                        )}
                      </div>
                    </div>
                    {wikiSections.length > 0 && (
                      <div className="space-y-2">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-xs text-blue-800 font-medium mb-2">📋 범위 지정 방법:</p>
                          <div className="text-xs text-blue-700 space-y-1">
                            <p>1. 아래 섹션 목록에서 비교에 포함할 섹션을 선택하세요</p>
                            <p>2. "기획 배경", "성과", "목표" 등 불필요한 섹션은 체크 해제하세요</p>
                            <p>3. 여러 과제가 섞인 위키에서 과제 단위로 선택 가능합니다</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-700">섹션 선택 ({selectedSections.length}개 선택됨)</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const allIds = getAllSectionIds(wikiSections);
                                  setSelectedSections(allIds);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                              >
                                전체 선택
                              </button>
                              <button
                                onClick={() => setSelectedSections([])}
                                className="text-xs text-gray-600 hover:text-gray-800 underline"
                              >
                                전체 해제
                              </button>
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 rounded p-2 bg-white">
                            {renderSectionTree(wikiSections)}
                          </div>
                        </div>
                      </div>
                    )}
                    {specWikiRawText && wikiSections.length === 0 && (
                      <div className="space-y-2">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <p className="text-xs text-yellow-800">
                            ⚠️ 섹션 구조를 파싱할 수 없습니다. 텍스트 입력 모드로 전환하여 직접 편집하세요.
                          </p>
                        </div>
                        {(() => {
                          // 마크다운 헤더 추출 (# ## ###) - 폴백
                          const headers: Array<{ level: number; text: string; lineIndex: number }> = [];
                          const lines = specWikiRawText.split('\n');
                          lines.forEach((line, idx) => {
                            const match = line.match(/^(#{1,6})\s+(.+)$/);
                            if (match) {
                              headers.push({
                                level: match[1].length,
                                text: match[2].trim(),
                                lineIndex: idx,
                              });
                            }
                          });

                          if (headers.length > 0) {
                            return (
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs font-medium text-gray-700 mb-2">섹션 선택 (다중 선택 가능):</p>
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {headers.map((header, idx) => {
                                    const isSelected = selectedSections.includes(header.text);
                                    const nextHeaderLine = idx < headers.length - 1 ? headers[idx + 1].lineIndex : lines.length;
                                    const sectionLines = lines.slice(header.lineIndex, nextHeaderLine).join('\n');
                                    
                                    return (
                                      <label
                                        key={`${header.lineIndex}-${header.text}`}
                                        className="flex items-start gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedSections([...selectedSections, header.text]);
                                            } else {
                                              setSelectedSections(selectedSections.filter(s => s !== header.text));
                                            }
                                          }}
                                          className="mt-0.5"
                                        />
                                        <div className="flex-1">
                                          <span className={`text-xs ${isSelected ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                                            {'#'.repeat(header.level)} {header.text}
                                          </span>
                                          <p className="text-xs text-gray-500 mt-0.5">
                                            {sectionLines.length > 100 ? sectionLines.substring(0, 100) + '...' : sectionLines}
                                          </p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                                {selectedSections.length > 0 && (
                                  <button
                                    onClick={() => {
                                      // 선택한 섹션만 추출
                                      const lines = specWikiRawText.split('\n');
                                      const selectedHeaders = headers.filter(h => selectedSections.includes(h.text));
                                      let extractedText = '';
                                      
                                      selectedHeaders.forEach((header, idx) => {
                                        const startLine = header.lineIndex;
                                        const endLine = idx < selectedHeaders.length - 1 
                                          ? selectedHeaders[idx + 1].lineIndex 
                                          : lines.length;
                                        const sectionText = lines.slice(startLine, endLine).join('\n');
                                        extractedText += sectionText + '\n\n';
                                      });
                                      
                                      setSpecText(extractedText.trim());
                                    }}
                                    className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                  >
                                    선택한 섹션만 적용 ({selectedSections.length}개)
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedSections([]);
                                    setSpecText(specWikiRawText);
                                  }}
                                  className="mt-1 w-full px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                                >
                                  전체 복원
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                    {specText && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">비교에 사용할 내용 (편집 가능):</label>
                          {specWikiRawText && specText !== specWikiRawText && (
                            <button
                              onClick={() => {
                                if (confirm('원본으로 복원하시겠습니까? 현재 편집 내용이 사라집니다.')) {
                                  setSpecText(specWikiRawText);
                                  setSelectedSections([]);
                                }
                              }}
                              className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                              원본 복원
                            </button>
                          )}
                        </div>
                        <textarea
                          className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                          value={specText}
                          onChange={(e) => setSpecText(e.target.value)}
                          placeholder="위키에서 가져온 내용이 여기에 표시됩니다. 필요시 직접 편집하여 불필요한 부분을 제거하세요."
                        />
                        <p className="text-xs text-gray-500">
                          💡 기획 배경, 성과 등 UI 비교와 무관한 내용은 제거하는 것을 권장합니다.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {specInputMode === 'file' && (
                  <div className="space-y-2">
                    <label className="block">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSpecFile(file);
                            handleSpecFileUpload(file);
                          }
                        }}
                        className="hidden"
                      />
                      <div className="w-full min-h-[120px] rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                        {specLoading ? (
                          <span className="text-sm text-gray-500">PDF 파싱 중...</span>
                        ) : specFile ? (
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">{specFile.name}</p>
                            <p className="text-xs text-gray-500 mt-1">다른 파일을 선택하려면 클릭하세요</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">PDF 파일을 선택하세요</p>
                            <p className="text-xs text-gray-500 mt-1">또는 드래그 앤 드롭</p>
                          </div>
                        )}
                      </div>
                    </label>
                    {wikiSections.length > 0 && pdfRawText && (
                      <div className="space-y-2">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-xs text-blue-800 font-medium mb-2">📋 범위 지정 방법:</p>
                          <div className="text-xs text-blue-700 space-y-1">
                            <p>1. 아래 섹션 목록에서 비교에 포함할 섹션을 선택하세요</p>
                            <p>2. "기획 배경", "성과", "목표" 등 불필요한 섹션은 체크 해제하세요</p>
                            <p>3. 여러 과제가 섞인 문서에서 과제 단위로 선택 가능합니다</p>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-700">섹션 선택 ({selectedSections.length}개 선택됨)</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const allIds = getAllSectionIds(wikiSections);
                                  setSelectedSections(allIds);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                              >
                                전체 선택
                              </button>
                              <button
                                onClick={() => setSelectedSections([])}
                                className="text-xs text-gray-600 hover:text-gray-800 underline"
                              >
                                전체 해제
                              </button>
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 rounded p-2 bg-white">
                            {renderSectionTree(wikiSections)}
                          </div>
                        </div>
                      </div>
                    )}
                    {specText && pdfRawText && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">비교에 사용할 내용 (편집 가능):</label>
                          {pdfRawText && specText !== pdfRawText && (
                            <button
                              onClick={() => {
                                if (confirm('원본으로 복원하시겠습니까? 현재 편집 내용이 사라집니다.')) {
                                  setSpecText(pdfRawText);
                                  setSelectedSections([]);
                                }
                              }}
                              className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                              원본 복원
                            </button>
                          )}
                        </div>
                        <textarea
                          className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                          value={specText}
                          onChange={(e) => setSpecText(e.target.value)}
                          placeholder="PDF에서 추출된 내용이 여기에 표시됩니다. 필요시 직접 편집하여 불필요한 부분을 제거하세요."
                        />
                        <p className="text-xs text-gray-500">
                          💡 기획 배경, 성과 등 UI 비교와 무관한 내용은 제거하는 것을 권장합니다.
                        </p>
                      </div>
                    )}
                    {specText && (
                      <textarea
                        className="w-full min-h-[120px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                        value={specText}
                        onChange={(e) => setSpecText(e.target.value)}
                        readOnly
                      />
                    )}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Figma 입력</label>
                  <div className="flex gap-2">
                    <a
                      href="/docs/FIGMA_PLUGIN_GUIDE.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline text-blue-600 hover:text-blue-800"
                      title="Figma Plugin 사용 가이드 (API 한도 없음)"
                    >
                      📖 Plugin 가이드
                    </a>
                    <button onClick={() => pasteSample('figma')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setFigmaInputMode('json')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      figmaInputMode === 'json'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    JSON 직접 붙여넣기 (권장)
                  </button>
                  <button
                    onClick={() => setFigmaInputMode('file')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      figmaInputMode === 'file'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    파일 업로드
                  </button>
                  <button
                    onClick={() => setFigmaInputMode('api')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      figmaInputMode === 'api'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    API로 가져오기
                  </button>
                </div>
                {figmaInputMode === 'json' ? (
                  <div className="space-y-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                      <p className="text-xs text-blue-800 font-medium mb-1">💡 JSON 직접 붙여넣기 방법:</p>
                      <ol className="text-xs text-blue-700 list-decimal list-inside space-y-0.5">
                        <li>Figma에서 Plugins → "Export to JSON" 실행</li>
                        <li>추출된 JSON 복사</li>
                        <li>아래 텍스트 영역에 붙여넣기 (Cmd/Ctrl + V)</li>
                      </ol>
                      <p className="text-xs text-blue-600 mt-2">✅ API 한도 없음 | 무제한 사용 가능</p>
                    </div>
                    <textarea
                      className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                      value={figmaText}
                      onChange={(e) => setFigmaText(e.target.value)}
                      placeholder='Figma JSON을 여기에 붙여넣으세요...

예시:
[
  {
    "Content": "필터"
  },
  {
    "Content": "정렬 선택"
  }
]

또는 표준 Figma API 형식:
{
  "document": {
    "type": "FRAME",
    "children": [...]
  }
}'
                    />
                    {figmaText && (
                      <p className="text-xs text-green-600">✓ JSON이 입력되었습니다. Run Diff 버튼을 클릭하세요.</p>
                    )}
                  </div>
                ) : figmaInputMode === 'file' ? (
                  <div className="space-y-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                      <p className="text-xs text-blue-800 font-medium mb-1">💡 JSON 파일 업로드 방법:</p>
                      <ol className="text-xs text-blue-700 list-decimal list-inside space-y-0.5">
                        <li>Figma에서 Plugins → "Export to JSON" 실행</li>
                        <li>JSON을 파일로 저장 (.json 확장자)</li>
                        <li>아래에서 파일 선택</li>
                      </ol>
                      <p className="text-xs text-blue-600 mt-2">✅ API 한도 없음 | 무제한 사용 가능</p>
                    </div>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = event.target?.result as string;
                              setFigmaText(content);
                            };
                            reader.onerror = () => {
                              alert('파일을 읽는데 실패했습니다.');
                            };
                            reader.readAsText(file);
                          }
                        }}
                        className="hidden"
                        id="figma-file-input"
                      />
                      <label
                        htmlFor="figma-file-input"
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-sm text-gray-600">
                          JSON 파일을 선택하거나 드래그하여 업로드
                        </span>
                        <span className="text-xs text-gray-400">
                          .json 파일만 지원됩니다
                        </span>
                      </label>
                    </div>
                    {figmaText && (
                      <div className="space-y-2">
                        <p className="text-xs text-green-600">✓ 파일이 로드되었습니다. 내용을 확인하거나 수정할 수 있습니다.</p>
                        <textarea
                          className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                          value={figmaText}
                          onChange={(e) => setFigmaText(e.target.value)}
                          placeholder="JSON 내용이 여기에 표시됩니다..."
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2"
                        value={figmaUrl}
                        onChange={(e) => setFigmaUrl(e.target.value)}
                        placeholder="Figma 파일 URL (https://www.figma.com/file/...)"
                      />
                      <input
                        type="password"
                        className="w-48 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2"
                        value={figmaToken}
                        onChange={(e) => setFigmaToken(e.target.value)}
                        placeholder="Personal Access Token"
                      />
                      <button
                        onClick={handleFigmaFetch}
                        disabled={figmaLoading}
                        className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap"
                      >
                        {figmaLoading ? '가져오는 중...' : '가져오기'}
                      </button>
                    </div>
                    <textarea
                      className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                      value={figmaText}
                      onChange={(e) => setFigmaText(e.target.value)}
                      placeholder='API로 가져온 JSON이 여기에 표시됩니다. 또는 직접 붙여넣을 수도 있습니다.'
                    />
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>
                        토큰 발급: <a href="https://www.figma.com/settings" target="_blank" rel="noopener noreferrer" className="underline">Figma Settings → Personal access tokens</a>
                      </p>
                      {figmaToken && (
                        <p className="text-green-600">✓ 토큰이 저장되었습니다. 새로고침해도 유지됩니다.</p>
                      )}
                      {!figmaToken && (
                        <p className="text-gray-400">💡 토큰을 입력하면 자동으로 저장됩니다. 서버에 환경 변수(FIGMA_TOKEN)가 설정되어 있으면 기본값으로 사용됩니다.</p>
                      )}
                      <p className="text-orange-600">⚠️ API 방식은 요청 한도 제한이 있을 수 있습니다. JSON 직접 붙여넣기를 권장합니다.</p>
                    </div>
                  </div>
                )}
              </div>
              <div className={`${phase >= 2 ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium mb-1">Web DOM JSON (Paste) (Phase ≥ 2)</label>
                  <button onClick={() => pasteSample('web')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                  value={webText}
                  onChange={(e) => setWebText(e.target.value)}
                />
              </div>
              <div className={`${phase >= 3 ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium mb-1">Android Dump JSON (Paste) (Phase ≥ 3)</label>
                  <button onClick={() => pasteSample('android')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                  value={androidText}
                  onChange={(e) => setAndroidText(e.target.value)}
                />
              </div>
              <div className={`${phase >= 4 ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium mb-1">iOS Dump JSON (Paste) (Phase ≥ 4)</label>
                  <button onClick={() => pasteSample('ios')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                  value={iosText}
                  onChange={(e) => setIosText(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">가이드</h3>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
              <li>Spec 입력 방식: 텍스트 직접 입력, 위키 링크, 또는 PDF 파일 업로드</li>
              <li>위키 링크는 공개된 페이지 URL을 입력하면 자동으로 내용을 가져옵니다</li>
              <li>PDF 파일은 텍스트가 추출 가능한 형태여야 합니다</li>
              <li>Figma/Web/Android/iOS는 PoC에선 JSON 붙여넣기로 시작하세요</li>
              <li>운영 전환 시 업로드/자동수집으로 바꿀 수 있습니다</li>
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          {/* (1) Summary - Phase 1 개선 */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-3">② Summary</h2>
            {llmValidationEnabled && (
              <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-xs">
                <span className="font-medium text-green-800">✓ LLM 기반 SpecItem 검증 사용됨</span>
                <p className="text-green-700 mt-1">불확실한 항목이 LLM으로 검증되어 번역키나 메타데이터가 자동으로 필터링되었습니다.</p>
              </div>
            )}
            <div className="space-y-4">
              {/* 요구사항 기준 Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">요구사항 비교 결과</h3>
                <div className="text-2xl font-bold text-gray-800 mb-1">
                  요구사항 {requirementStats.totalRequirements}개 중
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="text-xs text-green-700 mb-1">일치</div>
                    <div className="text-xl font-bold text-green-800">{requirementStats.matchedCount}개</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded p-3">
                    <div className="text-xs text-orange-700 mb-1">차이 있음</div>
                    <div className="text-xl font-bold text-orange-800">{requirementStats.diffCount}개</div>
                  </div>
                </div>
              </div>
              
              {/* Severity별 개수 (상세) */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Severity별 Finding 수</h3>
                <div className="grid grid-cols-5 gap-2 text-center">
                  <Card label="CRITICAL" value={summary.bySeverity.CRITICAL || 0} className="text-red-600" />
                  <Card label="MAJOR" value={summary.bySeverity.MAJOR || 0} className="text-orange-600" />
                  <Card label="WARN" value={summary.bySeverity.WARN || 0} className="text-yellow-600" />
                  <Card label="MINOR" value={summary.bySeverity.MINOR || 0} className="text-blue-600" />
                  <Card label="INFO" value={summary.bySeverity.INFO || 0} className="text-gray-600" />
                </div>
              </div>
            </div>
          </div>

          {/* (2) By Requirement - Phase 1 카드 형태 */}
          <div className="bg-white rounded-2xl shadow p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">③ By Requirement</h2>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
              >
                {showDebug ? 'Hide' : 'Show'} Debug
              </button>
            </div>
            
            {/* Debug 모드 필터 (Debug 패널에서만 표시) */}
            {showDebug && (
              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                <div className="font-medium mb-2">Debug Filters:</div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showKeyedOnly}
                      onChange={(e) => setShowKeyedOnly(e.target.checked)}
                      className="rounded"
                    />
                    <span>Keyed only</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showUnmapped}
                      onChange={(e) => setShowUnmapped(e.target.checked)}
                      className="rounded"
                    />
                    <span>Include unmapped</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showReverse}
                      onChange={(e) => setShowReverse(e.target.checked)}
                      className="rounded"
                    />
                    <span>Include reverse</span>
                  </label>
                </div>
              </div>
            )}
            {filteredFindings.length === 0 ? (
              <p className="text-sm text-gray-500">결과가 없습니다. 입력을 준비하고 Run Diff를 눌러주세요.</p>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {Object.entries(groupedFindings).map(([key, group]) => (
                  <div key={key} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    {/* Requirement Card Header */}
                    <div className="mb-3 pb-2 border-b border-gray-300">
                      <h3 className="font-semibold text-base text-gray-800">
                        Spec: {group.specTitle}
                      </h3>
                    </div>
                    
                    {/* Findings in Card */}
                    <div className="space-y-2">
                      {group.findings.map((f) => {
                        // Phase 1: Context 필드 추출
                        const specText = (f as any).specSideEvidence?.spec_text || 
                                        (f as any).evidence?.expected || 
                                        (f as any).evidence?.specItem?.text;
                        const figmaText = (f as any).figmaSideEvidence?.figma_text || 
                                         (f as any).evidence?.found || 
                                         (f as any).evidence?.figmaText ||
                                         (f as any).evidence?.figmaNode?.text;
                        const specPath = (f as any).specSideEvidence?.spec_section || 
                                        (f as any).requirement || 
                                        (f as any).meta?.section;
                        const figmaPath = (f as any).figmaSideEvidence?.figma_frame_path || 
                                         (f as any).evidence?.figmaNode?.path ||
                                         (f as any).evidence?.scope;
                        // diffType 추론: 원본 diffType이 있으면 사용, 없으면 category와 evidence 기반으로 추론
                        let diffType = (f as any).diffType;
                        if (!diffType) {
                          if (f.category === 'MISSING_ELEMENT') {
                            // Spec에 있지만 Figma에 없으면 MISSING, Figma에 있지만 Spec에 없으면 EXTRA
                            diffType = (f as any).figmaSideEvidence?.figma_text && !(f as any).specSideEvidence?.spec_text ? 'EXTRA' : 'MISSING';
                          } else if (f.category === 'TEXT_MISMATCH') {
                            diffType = 'MISMATCH';
                          } else if (f.category === 'VISIBILITY') {
                            diffType = 'CHANGED';
                          } else if (f.category === 'POLICY') {
                            diffType = 'MISSING';
                          } else if (f.category === 'STRUCTURE') {
                            diffType = 'UNMAPPED';
                          } else {
                            // 기본값: evidence를 기반으로 추론
                            if ((f as any).evidence?.figmaText && !(f as any).evidence?.expected) {
                              diffType = 'EXTRA';
                            } else if ((f as any).evidence?.expected && !(f as any).evidence?.found) {
                              diffType = 'MISSING';
                            } else if ((f as any).evidence?.expected && (f as any).evidence?.found) {
                              diffType = 'MISMATCH';
                            } else {
                              diffType = 'UNMAPPED';
                            }
                          }
                        }
                        
                        return (
                          <div key={f.id} className="bg-white rounded p-3 border-l-4" style={{
                            borderColor: diffType === 'MISSING' ? '#dc2626' :
                                       diffType === 'MISMATCH' ? '#ea580c' :
                                       diffType === 'CHANGED' ? '#ea580c' :
                                       diffType === 'EXTRA' ? '#ca8a04' : '#6b7280'
                          }}>
                            {/* Diff Type Badge */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{
                                backgroundColor: diffType === 'MISSING' ? '#fee2e2' :
                                               diffType === 'MISMATCH' ? '#fed7aa' :
                                               diffType === 'CHANGED' ? '#fed7aa' :
                                               diffType === 'EXTRA' ? '#fef3c7' : '#f3f4f6',
                                color: diffType === 'MISSING' ? '#991b1b' :
                                       diffType === 'MISMATCH' ? '#9a3412' :
                                       diffType === 'CHANGED' ? '#9a3412' :
                                       diffType === 'EXTRA' ? '#854d0e' : '#374151'
                              }}>
                                [{diffType}]
                              </span>
                              <span className="text-xs text-gray-500">{f.severity}</span>
                            </div>
                            
                            {/* Spec vs Figma 비교 */}
                            <div className="space-y-1 text-sm">
                              {figmaText && (
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-600 min-w-[60px]">Figma:</span>
                                  <span className="text-gray-800 flex-1">{figmaText}</span>
                                </div>
                              )}
                              {specText && (
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-600 min-w-[60px]">Spec:</span>
                                  <span className={`flex-1 ${figmaText && specText !== figmaText ? 'text-orange-700 font-semibold' : 'text-gray-800'}`}>
                                    {specText || '없음'}
                                  </span>
                                </div>
                              )}
                              {figmaPath && (
                                <div className="flex items-start gap-2 text-xs text-gray-500 mt-1">
                                  <span>↳</span>
                                  <span>Figma path: {figmaPath}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* (3) Raw (Debug 패널에서만 표시) */}
          {showDebug && (
            <div className="bg-white rounded-2xl shadow p-4 overflow-hidden">
              <h2 className="font-semibold mb-3">④ Raw (Debug)</h2>
              {findings.length === 0 ? (
                <p className="text-sm text-gray-500">결과가 없습니다.</p>
              ) : (
                <div className="overflow-auto max-h-[400px]">
                  <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-auto">
                    {JSON.stringify(findings, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">④ Next</h2>
            <ol className="text-sm text-gray-600 list-decimal pl-5 space-y-1">
              <li>지금은 서버에서 간단 유사도로 판정합니다.</li>
              <li>Phase 3/4에서 업로드/자동수집(API 연동)로 확장하세요.</li>
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}

function Card({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold ${className || ''}`}>{value}</div>
    </div>
  );
}


