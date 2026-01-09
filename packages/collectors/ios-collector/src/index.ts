export const IOSCollector = {
  /**
   * 설계:
   * - XCUITest/WDA 기반 accessibility dump 수집
   * - idevicesyslog / xcresult 파이프라인 고려
   * - 결과를 json으로 직렬화하여 저장
   * 여기서는 실제 실행 대신 스텁 메타만 반환한다.
   */
  async collect(deviceId: string, outPath: string) {
    return {
      deviceId,
      outPath,
      note: '실제 수집 로직은 XCUITest/WDA 의존. 설계 주석 참고.',
      steps: [
        'WDA/XCUITest로 accessibility dump 생성',
        'dump를 json으로 직렬화',
        'outPath로 저장',
      ],
    };
  },
};
