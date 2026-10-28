// What this build is: its version (package.json), the commit it was built from and when (set by vite.config.ts).

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __BUILT_AT__: string;

export const BUILD_INFO = { version: __APP_VERSION__, commit: __APP_COMMIT__, builtAt: __BUILT_AT__ };
