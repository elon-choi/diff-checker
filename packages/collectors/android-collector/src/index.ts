export const AndroidCollector = {
  /**
   * 설계:
   * 1) adb shell uiautomator dump /sdcard/uidump.xml
   * 2) adb pull /sdcard/uidump.xml <outDir>/android_dump.xml
   * 3) xml → json 변환 후 저장 (<outDir>/android_dump.json)
   * 여기서는 실제 실행 대신 스텁 메타만 반환한다.
   */
  async collect(deviceId: string, outPath: string) {
    return {
      deviceId,
      outPath,
      note: '실제 수집 로직은 adb 의존. 설계 주석 참고.',
      steps: [
        'adb shell uiautomator dump /sdcard/uidump.xml',
        'adb pull /sdcard/uidump.xml ./android_dump.xml',
        'xml → json 변환 후 저장',
      ],
    };
  },
};
