// What this build is: the commit it was built from and when (set by vite.config.ts at build time).

declare const __APP_VERSION__: string;
declare const __BUILT_AT__: string;

export const BUILD_INFO = { version: __APP_VERSION__, builtAt: __BUILT_AT__ };
