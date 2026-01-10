/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@diff-checker/markdown-reporter',
    '@diff-checker/html-reporter',
    '@diff-checker/json-reporter',
    '@diff-checker/core-engine',
  ],
  // CORS 설정 제거: 웹 앱 제거로 더 이상 필요 없음
  // Next.js 앱이 단일 앱으로 동작하므로 CORS 불필요
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse 관련 모듈을 external로 처리하여 서버 사이드에서 정상 작동하도록 함
      config.externals = config.externals || [];
      config.externals.push({
        'pdf-parse': 'commonjs pdf-parse',
        'pdfjs-dist': 'commonjs pdfjs-dist',
      });
    }
    return config;
  },
};

export default nextConfig;

