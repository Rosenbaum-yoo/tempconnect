/// <reference types="vite/client" />

// CSS-Modul-Typen für alle drei React-SPAs (OCC, SOC, SCC)
declare module "*.css" {
  const stylesheet: string;
  export default stylesheet;
}
