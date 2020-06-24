/**
 * The library that allows to use a single interface for managing various interactive map frameworks.
 *
 * @remarks
 * The following adapters are available:
 * {@link https://github.com/nextgis/nextgisweb_frontend/tree/master/packages/leaflet-map-adapter | @nextgis/leaflet-map-adapter},
 * {@link https://github.com/nextgis/nextgisweb_frontend/tree/master/packages/ol-map-adapter | @nextgis/ol-map-adapter},
 * {@link https://github.com/nextgis/nextgisweb_frontend/tree/master/packages/mapboxgl-map-adapter | @nextgis/mapbox-map-adapter}
 * and experimental {@link https://github.com/nextgis/nextgisweb_frontend/tree/master/packages/cesium-map-adapter | @nextgis/cesium-map-adapter}.
 *
 * @example
 * ```js
 * import WebMap from "@nextgis/webmap";
 *
 * import "./leaflet-style-override.css";
 * import MapAdapter from "@nextgis/leaflet-map-adapter";
 * // OR
 * // import 'ol/ol.css';
 * // import MapAdapter from '@nextgis/ol-map-adapter';
 * // OR
 * // import 'mapbox-gl/dist/mapbox-gl.css';
 * // import MapAdapter from '@nextgis/mapboxgl-map-adapter';
 *
 * const webMap = new WebMap({
 *   mapAdapter: new MapAdapter(),
 *   mapOptions: { target: 'map' }
 * });
 * ```
 *
 * @packageDocumentation
 */

import { WebMap } from './WebMap';

export * from './WebMap';
export * from './WebMapLayers';
export * from './interfaces/Events';
export * from './interfaces/BaseTypes';
export * from './interfaces/WebMapApp';
export * from './interfaces/MapAdapter';
export * from './interfaces/MapControl';
export * from './interfaces/StarterKit';
export * from './interfaces/LayerAdapter';
export * from './interfaces/RuntimeParams';

export { WebMap };
export default WebMap;
