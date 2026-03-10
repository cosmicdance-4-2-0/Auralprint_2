export const BUILD_111_DECODE_FIXTURES = [
  {
    name: 'build111_schema6_wrapper',
    hash: '#p=eyJzY2hlbWEiOjYsInByZWZzIjp7InZpc3VhbHMiOnsiYmFja2dyb3VuZENvbG9yIjoiIzEyMzQ1NiJ9LCJ0cmFjZSI6eyJudW1MaW5lcyI6OTk5OSwibGluZUNvbG9yTW9kZSI6ImJhZCJ9fX0',
    sourcePreferences: {
      visuals: { backgroundColor: '#123456' },
      trace: { numLines: 9999, lineColorMode: 'bad' },
    },
    expectedOk: true,
  },
  {
    name: 'build111_wrapper_no_schema',
    hash: '#p=eyJwcmVmcyI6eyJhdWRpbyI6eyJmZnRTaXplIjoxMjN9LCJwYXJ0aWNsZXMiOnsic2l6ZU1pblB4Ijo5OTksInNpemVNYXhQeCI6MX19fQ',
    sourcePreferences: {
      audio: { fftSize: 123 },
      particles: { sizeMinPx: 999, sizeMaxPx: 1 },
    },
    expectedOk: true,
  },
  {
    name: 'build111_unwrapped_preferences',
    hash: '#p=eyJ2aXN1YWxzIjp7InBhcnRpY2xlQ29sb3IiOiIjQUJDREVGIn0sImF1ZGlvIjp7Im1pblJhZGl1c0ZyYWMiOjAuOSwibWF4UmFkaXVzRnJhYyI6MC4xfX0',
    sourcePreferences: {
      visuals: { particleColor: '#ABCDEF' },
      audio: { minRadiusFrac: 0.9, maxRadiusFrac: 0.1 },
    },
    expectedOk: true,
  },
  {
    name: 'unknown_future_schema',
    hash: '#p=eyJzY2hlbWEiOjk5LCJwcmVmZXJlbmNlcyI6eyJ2aXN1YWxzIjp7ImJhY2tncm91bmRDb2xvciI6IiNmZmZmZmYifX19',
    sourcePreferences: {
      visuals: { backgroundColor: '#ffffff' },
    },
    expectedOk: false,
    expectedReason: 'Unsupported schema v99.',
  },
];
