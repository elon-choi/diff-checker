'use client';
import React, { useMemo, useState } from 'react';
import type { Finding } from '@/lib/diff';
import { toMarkdown, toHtml } from '@/lib/report';
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
  const [selectedSections, setSelectedSections] = useState<string[]>([]); // 선택한 섹션 헤더
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
  const [running, setRunning] = useState(false);

  const summary = useMemo(() => {
    const by: Record<Severity, number> = { CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
    for (const f of findings) by[f.severity]++;
    return by;
  }, [findings]);

  const sortedFindings = useMemo(() => {
    const severityOrder: Record<Severity, number> = {
      CRITICAL: 0,
      MAJOR: 1,
      MINOR: 2,
      INFO: 3,
    };
    return [...findings].sort((a, b) => {
      return severityOrder[a.severity] - severityOrder[b.severity];
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
      setSpecWikiRawText(rawText);
      setSpecText(rawText);
      setSelectedSections([]); // 섹션 선택 초기화
      alert('위키 내용을 불러왔습니다. 필요시 아래에서 특정 섹션만 선택하거나 텍스트를 직접 편집할 수 있습니다.');
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
      setSpecText(data.text || '');
      alert('PDF 내용을 불러왔습니다.');
    } catch (e: any) {
      alert(e?.message ?? 'PDF 파싱에 실패했습니다.');
    } finally {
      setSpecLoading(false);
    }
  }

  async function onRun() {
    setRunning(true);
    try {
      const res = await fetch('/api/diff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phase,
          specText,
          figmaJson: parseJSON(figmaText),
          webJson: parseJSON(webText),
          androidJson: parseJSON(androidText),
          iosJson: parseJSON(iosText),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'diff failed');
      setFindings(data.findings || []);
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
          <h1 className="text-xl font-semibold tracking-tight">Spec–Design–Implementation Diff Checker</h1>
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
                    {specWikiRawText && (
                      <div className="space-y-2">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-xs text-blue-800 font-medium mb-2">📋 범위 지정 방법:</p>
                          <div className="text-xs text-blue-700 space-y-1">
                            <p>1. 아래 섹션 목록에서 비교에 포함할 섹션을 선택하세요</p>
                            <p>2. 또는 텍스트 영역에서 직접 편집하여 불필요한 부분을 제거하세요</p>
                            <p>3. "기획 배경", "성과" 등 불필요한 섹션은 제외하는 것을 권장합니다</p>
                          </div>
                        </div>
                        {(() => {
                          // 마크다운 헤더 추출 (# ## ###)
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
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">② Summary</h2>
            <div className="grid grid-cols-4 gap-3 text-center">
              <Card label="CRITICAL" value={summary.CRITICAL} className="text-red-600" />
              <Card label="MAJOR" value={summary.MAJOR} className="text-orange-600" />
              <Card label="MINOR" value={summary.MINOR} className="text-yellow-600" />
              <Card label="INFO" value={summary.INFO} className="text-gray-800" />
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 overflow-hidden">
            <h2 className="font-semibold mb-3">③ Findings</h2>
            {findings.length === 0 ? (
              <p className="text-sm text-gray-500">결과가 없습니다. 입력을 준비하고 Run Diff를 눌러주세요.</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600">
                      <th className="text-left p-2">Severity</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFindings.map((f) => (
                      <tr key={f.id} className="border-t">
                        <td className="p-2 font-medium">{f.severity}</td>
                        <td className="p-2 text-gray-700">{f.category}</td>
                        <td className="p-2 text-gray-800">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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


