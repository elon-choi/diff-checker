import { test, expect } from '@playwright/test';

/**
 * UI 보호 스냅샷 테스트
 * 
 * ⚠️ 중요: 이 테스트는 UI 컴포넌트의 시각적 회귀를 감지합니다.
 * UI를 변경할 때는 반드시:
 * 1. 사용자에게 변경 사항을 명시적으로 설명
 * 2. 스냅샷 업데이트: pnpm test:ui:update
 * 3. 변경 사항 검증 후 커밋
 * 
 * 스냅샷이 변경되면 UI가 변경된 것입니다.
 * 의도하지 않은 변경이라면 즉시 원복하세요.
 */

test.describe('UI 보호: 웹 앱 메인 화면', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 페이지 로드 대기
    await page.waitForSelector('h1:has-text("Spec–Design–Implementation Diff Checker")');
  });

  test('헤더 영역 스냅샷', async ({ page }) => {
    const header = page.locator('header');
    await expect(header).toHaveScreenshot('header.png');
  });

  test('Input 영역 전체 스냅샷', async ({ page }) => {
    const inputSection = page.locator('section:has-text("① Inputs")');
    await expect(inputSection).toHaveScreenshot('input-section.png');
  });

  test('Spec 입력 영역 스냅샷', async ({ page }) => {
    const specInput = page.locator('label:has-text("Spec (Markdown/Text)")').locator('..');
    await expect(specInput).toHaveScreenshot('spec-input.png');
  });

  test('Figma 입력 영역 스냅샷', async ({ page }) => {
    const figmaInput = page.locator('label:has-text("Figma 입력")').locator('..');
    await expect(figmaInput).toHaveScreenshot('figma-input.png');
  });

  test('Web 입력 영역 스냅샷 (Phase 2)', async ({ page }) => {
    // Phase를 2로 변경
    await page.selectOption('select', '2');
    await page.waitForTimeout(500); // 상태 업데이트 대기
    
    const webInput = page.locator('label:has-text("Web DOM JSON")').locator('..');
    await expect(webInput).toHaveScreenshot('web-input.png');
  });

  test('Android 입력 영역 스냅샷 (Phase 3)', async ({ page }) => {
    // Phase를 3으로 변경
    await page.selectOption('select', '3');
    await page.waitForTimeout(500);
    
    const androidInput = page.locator('label:has-text("Android Dump JSON")').locator('..');
    await expect(androidInput).toHaveScreenshot('android-input.png');
  });

  test('iOS 입력 영역 스냅샷 (Phase 4)', async ({ page }) => {
    // Phase를 4로 변경
    await page.selectOption('select', '4');
    await page.waitForTimeout(500);
    
    const iosInput = page.locator('label:has-text("iOS Dump JSON")').locator('..');
    await expect(iosInput).toHaveScreenshot('ios-input.png');
  });

  test('Export 버튼 영역 스냅샷', async ({ page }) => {
    const exportButtons = page.locator('button:has-text("Export")').first().locator('..');
    await expect(exportButtons).toHaveScreenshot('export-buttons.png');
  });

  test('Summary 영역 스냅샷', async ({ page }) => {
    const summarySection = page.locator('h2:has-text("② Summary")').locator('..');
    await expect(summarySection).toHaveScreenshot('summary-section.png');
  });

  test('Findings 영역 스냅샷', async ({ page }) => {
    const findingsSection = page.locator('h2:has-text("③ Findings")').locator('..');
    await expect(findingsSection).toHaveScreenshot('findings-section.png');
  });

  test('Next 섹션 스냅샷', async ({ page }) => {
    const nextSection = page.locator('h2:has-text("④ Next")').locator('..');
    await expect(nextSection).toHaveScreenshot('next-section.png');
  });

  test('전체 페이지 스냅샷', async ({ page }) => {
    await expect(page).toHaveScreenshot('full-page.png', {
      fullPage: true,
    });
  });
});

test.describe('UI 보호: Figma 입력 모드 전환', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('h1:has-text("Spec–Design–Implementation Diff Checker")');
  });

  test('JSON 직접 붙여넣기 모드 스냅샷', async ({ page }) => {
    // JSON 직접 붙여넣기 버튼 클릭 (이미 기본값일 수 있음)
    const jsonButton = page.locator('button:has-text("JSON 직접 붙여넣기")');
    if (await jsonButton.isVisible()) {
      await jsonButton.click();
      await page.waitForTimeout(300);
    }
    
    const figmaInput = page.locator('label:has-text("Figma 입력")').locator('..');
    await expect(figmaInput).toHaveScreenshot('figma-json-mode.png');
  });

  test('파일 업로드 모드 스냅샷', async ({ page }) => {
    // 파일 업로드 버튼 클릭
    const fileButton = page.locator('button:has-text("파일 업로드")');
    await fileButton.click();
    await page.waitForTimeout(300);
    
    const figmaInput = page.locator('label:has-text("Figma 입력")').locator('..');
    await expect(figmaInput).toHaveScreenshot('figma-file-mode.png');
  });
});
