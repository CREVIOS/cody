/**
 * Monaco Editor Configuration
 * 
 * Configures Monaco Editor to use CDN workers to avoid Next.js build issues
 * with dynamic imports.
 * 
 * This configuration is loaded early in the app lifecycle (in layout.tsx)
 * to ensure Monaco Editor uses CDN workers instead of trying to bundle them.
 */

if (typeof window !== 'undefined') {
  // Configure Monaco Editor to use CDN workers
  // This prevents Next.js from trying to bundle worker files and resolves
  // the "Can't resolve <dynamic>" build errors
  (window as any).MonacoEnvironment = {
    getWorkerUrl: function (_moduleId: string, label: string) {
      // Use CDN for Monaco Editor workers
      // Version should match the monaco-editor version in package.json
      const baseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
      
      if (label === 'json') {
        return `${baseUrl}/language/json/json.worker.js`;
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return `${baseUrl}/language/css/css.worker.js`;
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return `${baseUrl}/language/html/html.worker.js`;
      }
      if (label === 'typescript' || label === 'javascript') {
        return `${baseUrl}/language/typescript/ts.worker.js`;
      }
      // Default editor worker
      return `${baseUrl}/editor/editor.worker.js`;
    },
  };
}

