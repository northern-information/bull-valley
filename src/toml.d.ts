// A TOML file imported as text (Vite's ?raw), for copy.ts. Declared here
// rather than through vite/client so the Worker's type check sees it too.
declare module '*.toml?raw' {
  const source: string
  export default source
}

// The laptop's readme as typed (laptopreadme.ts), every space kept.
declare module '*.TXT?raw' {
  const source: string
  export default source
}
