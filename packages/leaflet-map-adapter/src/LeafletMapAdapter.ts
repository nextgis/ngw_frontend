import {
  MapAdapter,
  MapOptions,
  LayerMem,
  MapControl,
  CreateControlOptions,
  CreateButtonControlOptions
} from '@nextgis/webmap';
import { Map, Control, Layer, GridLayer, ControlPosition } from 'leaflet';
import { EventEmitter } from 'events';
import { TileAdapter } from './layer-adapters/TileAdapter';
import { GeoJsonAdapter } from './layer-adapters/GeoJsonAdapter';
import { AttributionControl } from './controls/Attribution';
import { ImageAdapter } from './layer-adapters/ImageAdapter';
import { createControl } from './controls/createControl';
import { createButtonControl } from './controls/createButtonControl';

export interface LeafletMapAdapterOptions extends MapOptions {
  id?: string;
}

export class LeafletMapAdapter implements MapAdapter<Map, any, Control> {

  static layerAdapters = {
    IMAGE: ImageAdapter,
    TILE: TileAdapter,
    GEOJSON: GeoJsonAdapter,
    // // MVT: MvtAdapter,
    // OSM: OsmAdapter,
    // MARKER: MarkerAdapter,
  };

  static controlAdapters = {
    ZOOM: Control.Zoom,
    ATTRIBUTION: AttributionControl,
  };

  options: LeafletMapAdapterOptions = { target: 'map' };

  layerAdapters = LeafletMapAdapter.layerAdapters;
  controlAdapters = LeafletMapAdapter.controlAdapters;

  displayProjection = 'EPSG:3857';
  lonlatProjection = 'EPSG:4326';
  emitter = new EventEmitter();

  map: Map;

  // create(options: MapOptions = {target: 'map'}) {
  create(options: LeafletMapAdapterOptions = { target: 'map' }) {
    this.options = Object.assign({}, options);

    this.map = new Map(this.options.target, { zoomControl: false, attributionControl: false });
    this.emitter.emit('create', { map: this.map });

    this._addMapListeners();
  }

  getContainer(): HTMLElement {
    return this.map.getContainer();
  }

  onMapLoad(cb?: any): Promise<void> {
    return new Promise((resolve) => {
      if (this.map) {
        resolve(cb && cb());
      } else {
        this.emitter.once('create', () => {
          resolve(cb && cb());
        });
      }
    });
  }

  setView(lngLat: [number, number], zoom: number) {
    const [lng, lat] = lngLat;
    this.map.setView([lat, lng], zoom);
  }

  setCenter(lngLat: [number, number]) {
    const [lng, lat] = lngLat;
    this.map.setView([lat, lng], this.map.getZoom());
  }

  setZoom(zoom: number) {
    this.map.setZoom(zoom);
  }

  getZoom() {
    return this.map.getZoom();
  }

  // [extent_left, extent_bottom, extent_right, extent_top];
  fit(e: [number, number, number, number]) {
    // top, left, bottom, right
    this.map.fitBounds([[e[3], e[0]], [e[1], e[2]]]);
  }

  getLayerAdapter(name: string) {
    return LeafletMapAdapter.layerAdapters[name];
  }

  createControl(control: MapControl, options: CreateControlOptions) {
    return createControl(control, options);
  }

  createButtonControl(options: CreateButtonControlOptions) {
    return createButtonControl(options);
  }

  addControl(control: Control, position: string): Control {
    control.options.position = position.replace('-', '') as ControlPosition;
    this.map.addControl(control);
    return control;
  }

  removeControl(control) {
    this.map.removeControl(control);
  }

  removeLayer(layer: Layer) {
    layer.remove();
  }

  showLayer(layer: Layer) {
    layer.addTo(this.map);
  }

  hideLayer(layer: Layer) {
    layer.remove();
  }

  setLayerOpacity(layerName: string, value: number) {
    // ignore
  }

  setLayerOrder(layer, order, layers: { [x: string]: LayerMem }) {
    const baseLayers = [];

    const orderedLayers = Object.keys(layers).filter((x) => {
      if (layers[x].baseLayer) {
        baseLayers.push(x);
        return false;
      }
      return true;
    }).sort((a, b) => {
      return layers[a].order - layers[b].order;
    });

    // normilize vector layer ordering
    baseLayers.forEach((x) => {
      layers[x].layer.bringToBack();
    });
    for (let fry = 0; fry < orderedLayers.length; fry++) {
      if (layers[orderedLayers[fry]].onMap) {
        layers[orderedLayers[fry]].layer.bringToFront();
      }
    }
    // set raser layer ordering
    if (layer.setZIndex) {
      layer.setZIndex(order);
    }
  }

  onMapClick(evt) {
    const coord = evt.containerPoint;
    const latLng = evt.latlng;
    this.emitter.emit('click', {
      latLng,
      pixel: { left: coord.x, top: coord.y },
      source: evt,
    });
  }

  private _addMapListeners() {
    this.map.on('click', (evt) => {
      this.onMapClick(evt);
    });
  }

}
