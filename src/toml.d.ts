// A TOML file imported as text (Vite's ?raw), for copy.ts. Declared here
// rather than through vite/client so the Worker's type check sees it too.
declare module '*.toml?raw' {
  const source: string
  export default source
}
