// [Web Fix] Node.js 환경에서 localStorage가 없어서 나는 에러 방지
if (typeof localStorage === 'undefined') {
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    length: 0,
    key: () => null,
  };
}
// shim.js
// 빌드 타임(Node.js)에서만 localStorage를 폴리필합니다.
// 브라우저(window가 존재하는 환경)에서는 절대 실행되지 않도록 막습니다.

if (typeof window === 'undefined') {
  // window가 없다는 것은 Node.js 환경(빌드 중)이라는 뜻입니다.
  if (typeof global !== 'undefined') {
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    };
  }
}