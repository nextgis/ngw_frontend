import { MapAdapter } from './MapAdapter';
import { StarterKit } from './StarterKit';
import { MapControl } from './MapControl';

export interface MapOptions {
  target?: string | HTMLElement;
  logo?: string;
  controls?: Array<string | MapControl>;
  controlsOptions?: {[controlName: string]: any};
  minZoom?: number;
  maxZoom?: number;
  /** lat lng */
  center?: [number, number];
  /** top, left, bottom, right */
  bounds?: [number, number, number, number];
  zoom?: number;
}

export interface AppOptions {
  mapAdapter: MapAdapter;
  starterKits?: StarterKit[];
  // displayConfig?: DisplayConfig;
  // [configName: string]: any;
}

export interface WebMapAppEvents {
  'build-map': MapAdapter;
}

export interface GetAttributionsOptions {
  onlyVisible?: boolean;
  onlyBasemap?: boolean;
}
