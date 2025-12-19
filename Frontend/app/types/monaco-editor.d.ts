declare module 'monaco-editor' {
  // This project uses Monaco through `@monaco-editor/react`.
  // Some environments (pnpm / Next typecheck) may not expose `monaco-editor`
  // as a top-level resolvable module for TypeScript.
  //
  // We only rely on Monaco typings for editor/model shapes; at runtime Monaco is
  // provided by `@monaco-editor/react`, so treating this module as `any` is safe.
  const monaco: any;
  export = monaco;
}

