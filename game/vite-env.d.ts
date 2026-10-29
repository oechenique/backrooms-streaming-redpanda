/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base del collector (por ejemplo https://ingesta.ejemplo.com). En un build sin definir, no hay telemetría. */
  readonly VITE_COLLECTOR_URL?: string;
}
