import StrictEventEmitter from 'strict-event-emitter-types';
import { EventEmitter } from 'events';
import CancelablePromise from '@nextgis/cancelable-promise';
import { isObject, JsonMap } from '@nextgis/utils';
import {
  WebMap,
  ControlPosition,
  MapControls,
  WebMapEvents,
  LayerDef,
  MapClickEvent,
  LayerAdapter,
  FilterOptions,
  OnLayerClickOptions,
} from '@nextgis/webmap';
import NgwConnector, {
  ResourceItem,
  FeatureLayersIdentify,
  FeatureItem,
  FeatureLayersIdentifyItems,
  LayerFeature,
} from '@nextgis/ngw-connector';
import { QmsAdapterOptions } from '@nextgis/qms-kit';
import {
  addNgwLayer,
  NgwLayerOptions,
  ResourceAdapter,
  NgwWebmapItem,
  NgwLayerOptionsAdditional,
  NgwIdentify,
  KeynamedNgwLayerOptions,
  ResourceIdNgwLayerOptions,
  ResourceNgwLayerOptions,
  fetchNgwLayerItem,
  fetchNgwLayerItems,
  fetchNgwLayerFeature,
  fetchNgwLayerFeatures,
  fetchIdentifyGeoJson,
  fetchNgwResourceExtent,
  sendIdentifyRequest,
  getCompanyLogo,
} from '@nextgis/ngw-kit';
import { getIcon } from '@nextgis/icons';
import { PropertiesFilter } from '@nextgis/properties-filter';

import { appendNgwResources } from './utils/appendNgwResources';
import { prepareWebMapOptions } from './utils/prepareWebMapOptions';

import { NgwMapOptions, NgwMapEvents, NgwLayers } from './interfaces';
import { Geometry, Feature, FeatureCollection } from 'geojson';

/**
 * Base class containing the logic of interaction WebMap with NextGIS services.
 *
 * @example
 * ```javascript
 * import { NgwMap } from '@nextgis/ngw-map';
 * import MapAdapter from '@nextgis/leaflet-map-adapter';
 * // styles are not included in the leaflet-map-adapter
 * import 'leaflet/dist/leaflet.css';
 *
 * const ngwMap = new NgwMap({
 *   mapAdapter: new MapAdapter(),
 *   target: 'map',
 *   qmsId: 487,
 *   baseUrl: 'https://demo.nextgis.com',
 *   webmapId: 3985
 * });
 * ```
 * @public
 */
export class NgwMap<
  M = unknown,
  L = unknown,
  C = unknown,
  O extends NgwMapOptions<C> = NgwMapOptions<C>
> extends WebMap<M, L, C, NgwMapEvents, O> {
  static getIcon = getIcon;

  readonly emitter: StrictEventEmitter<
    EventEmitter,
    NgwMapEvents
  > = new EventEmitter();
  connector!: NgwConnector;

  protected _ngwLayers: NgwLayers = {};
  private __selectFromNgwRaster?: (ev: MapClickEvent) => void;
  private __selectFromNgwVector?: (ev: OnLayerClickOptions) => void;

  constructor(options: O) {
    super(prepareWebMapOptions(options) as O);
    if (options.connector) {
      this.connector = options.connector;
    }
    this._createWebMap().then(() => {
      const container = this.getContainer();
      if (container) {
        container.classList.add('ngw-map-container');
      }
      if (this.options.whitlabel) {
        this._whiteLabel();
      }
    });
  }

  /**
   * Organized addition to the map design and controls elements,
   * calling `control.onAdd(this.webMap.mapAdapter)`
   * @param control - object with onAdd and onRemove methods
   *                or a string value indicating the name of the control installed in the map adapter
   * @param position - position relative to the map angles
   * @param [options] - initialization parameters if the control is set as a string value
   *
   * @example
   * ```javascript
   * ngwMap.addControl(new CustomControl(), 'bottom-left');
   * ngwMap.addControl('ZOOM', 'top-right')
   * ```
   */
  async addControl<K extends keyof MapControls>(
    controlDef: K | C,
    position: ControlPosition,
    options?: MapControls[K]
  ): Promise<any> {
    await this.onLoad('controls:create');
    return super.addControl(controlDef, position, options);
  }

  /**
   * Add any (style, vector, webmap) NGW layer by resource id.
   * @param options - set layer identification parameters and render method.
   *
   * @example
   * ```javascript
   * // add raster layer resourceId is the style of 4004 layer
   * ngwMap.addNgwLayer({ resourceId: 4005 });
   * // add vector data from layer GEOJSON source
   * ngwMap.addNgwLayer({
   *   resourceId: 4038,
   *   adapter: 'GEOJSON',
   *   adapterOptions: { paint: { color: 'red' } }
   * });
   * ```
   */
  async addNgwLayer(
    options: NgwLayerOptions
  ): Promise<ResourceAdapter | undefined> {
    await this.onMapLoad();
    const keyname = (options as KeynamedNgwLayerOptions).keyname;
    const resourceId = (options as ResourceIdNgwLayerOptions).resourceId;
    const resource = (options as ResourceNgwLayerOptions).resource;
    if (!keyname && !resourceId && !resource) {
      throw new Error(
        'resource, resourceId or keyname is required parameter to add NGW layer'
      );
    }
    if (this.options.baseUrl || this.options.baseUrl === '') {
      try {
        const adapter = addNgwLayer(options, this, this.connector);

        const layer = (await this.addLayer(adapter, {
          visibility: true,
          // TODO: do not merge options, use only `adapterOptions`
          ...options,
          ...options.adapterOptions,
        })) as ResourceAdapter;
        const id = layer && this.getLayerId(layer);
        if (layer && id) {
          this._ngwLayers[id] = { layer, resourceId: layer.resourceId };

          if (layer.options.baselayer) {
            const visibleLayerBaseLayer = this.getActiveBaseLayer();
            if (visibleLayerBaseLayer) {
              return layer;
            }
          }
        }
        return layer;
      } catch (er) {
        const resId =
          isObject(resource) && 'id' in resource
            ? resource.id
            : keyname || resourceId || resource;
        console.error(`Can't add NGW layer ${resId}.`, er);
      }
    }
  }

  /**
   * Pans and zooms the map to the initial position specified in the options
   */
  fit(): void {
    const { center, zoom, bounds } = this.options;
    if (center) {
      this.setCenter(center);
      if (zoom) {
        this.setZoom(zoom);
      }
    } else if (bounds) {
      this.fitBounds(bounds);
    }
  }

  fetchNgwLayerItem(options: {
    resourceId: number;
    featureId: number;
  }): CancelablePromise<FeatureItem> {
    return fetchNgwLayerItem({
      connector: this.connector,
      ...options,
    });
  }

  fetchNgwLayerItems(
    options: {
      resourceId: number;
      connector?: NgwConnector;
      filters?: PropertiesFilter;
    } & FilterOptions
  ): CancelablePromise<FeatureItem[]> {
    return fetchNgwLayerItems({
      connector: this.connector,
      ...options,
    });
  }

  fetchNgwLayerFeature<
    G extends Geometry = Geometry,
    P extends JsonMap = JsonMap
  >(options: {
    resourceId: number;
    featureId: number;
  }): CancelablePromise<Feature<G, P>> {
    return fetchNgwLayerFeature<G, P>({
      connector: this.connector,
      ...options,
    });
  }

  fetchNgwLayerFeatures<
    G extends Geometry | null = Geometry,
    P extends JsonMap = JsonMap
  >(
    options: {
      resourceId: number;
      connector?: NgwConnector;
      filters?: PropertiesFilter;
    } & FilterOptions
  ): CancelablePromise<FeatureCollection<G, P>> {
    return fetchNgwLayerFeatures({
      connector: this.connector,
      ...options,
    });
  }

  fetchIdentifyGeoJson(
    identify: NgwIdentify,
    multiple = false
  ): CancelablePromise<Feature | undefined> {
    const geojson = fetchIdentifyGeoJson({
      identify,
      connector: this.connector,
      multiple,
    });
    if (geojson && 'then' in geojson) {
      return geojson;
    } else {
      return CancelablePromise.resolve(geojson);
    }
  }

  /**
   * @deprecated use {@link fetchIdentifyGeoJson} instead
   */
  getIdentifyGeoJson(
    identify: NgwIdentify,
    multiple = false
  ): CancelablePromise<Feature | undefined> {
    return this.fetchIdentifyGeoJson(identify, multiple);
  }

  async getNgwLayers(): Promise<NgwLayers> {
    await this.onLoad();
    return this._ngwLayers;
  }

  async getNgwLayerByResourceId(id: number): Promise<LayerAdapter | undefined> {
    for (const n in this._ngwLayers) {
      const mem = this._ngwLayers[n];
      if (mem.resourceId === id) {
        return mem && mem.layer;
      } else if (mem.layer.getIdentificationIds) {
        const ids = await mem.layer.getIdentificationIds();
        if (ids && ids.some((x) => x === id)) {
          return mem.layer;
        }
      }
      if (mem.layer.getDependLayers) {
        const dependLayers = mem.layer.getDependLayers() as NgwWebmapItem[];
        const dependFit = dependLayers.find((x) => {
          return x.item && x.item.parentId === id;
        });
        if (dependFit) {
          return dependFit.layer;
        }
      }
    }
  }

  /**
   * Move map to layer. If the layer is NGW resource, extent will be received from the server
   *
   * @example
   * ```javascript
   * const ngwLayer = ngwMap.addNgwLayer({ id: 'ngw_layer_name', resourceId: 4005 });
   * ngwMap.zoomToLayer(ngwLayer);
   * ngwMap.zoomToLayer('ngw_layer_name');
   * ```
   */
  async zoomToLayer(layerDef: string | ResourceAdapter): Promise<void> {
    let id: string | undefined;
    if (typeof layerDef === 'string' || typeof layerDef === 'number') {
      id = String(id);
    } else {
      id = layerDef.id;
    }
    const ngwLayer = id && this._ngwLayers[id];
    if (ngwLayer) {
      if (ngwLayer.layer.getExtent) {
        const extent = await ngwLayer.layer.getExtent();
        if (extent) {
          this.fitBounds(extent);
        }
      } else {
        let item: ResourceItem | undefined;
        if (ngwLayer.layer.item) {
          item = ngwLayer.layer.item;
        } else {
          const resourceId = ngwLayer.resourceId;
          item = await this.connector.getResource(resourceId);
        }
        if (item) {
          fetchNgwResourceExtent(item, this.connector).then((extent) => {
            if (extent) {
              this.fitBounds(extent);
            }
          });
        }
      }
    }
  }

  onLoad(event: keyof NgwMapEvents = 'ngw-map:create'): Promise<this> {
    return super.onLoad(event as keyof WebMapEvents);
  }

  removeLayer(layerDef: LayerDef): void {
    const layer = this.getLayer(layerDef);
    if (layer) {
      const layerId = this.getLayerId(layer);
      if (layerId) {
        delete this._ngwLayers[layerId];
      }
      super.removeLayer(layer);
    }
  }

  enableSelection(): void {
    if (!this.__selectFromNgwRaster) {
      this.__selectFromNgwRaster = (ev: MapClickEvent) =>
        this._selectFromNgwRaster(ev);
      this.__selectFromNgwVector = (ev: OnLayerClickOptions) =>
        this._selectFromNgwVector(ev);
      this.emitter.on('click', this.__selectFromNgwRaster);
      this.emitter.on('layer:click', this.__selectFromNgwVector);
    }
  }

  disableSelection(): void {
    if (this.__selectFromNgwRaster) {
      this.emitter.removeListener('click', this.__selectFromNgwRaster);
      this.emitter.removeListener('click', this._selectFromNgwVector);
      this.__selectFromNgwRaster = undefined;
      this.__selectFromNgwVector = undefined;
    }
  }

  /**
   * @deprecated use {@link NgwMap.fetchNgwLayerItem} instead
   */
  getNgwLayerItem(options: {
    resourceId: number;
    featureId: number;
  }): CancelablePromise<FeatureItem> {
    return this.fetchNgwLayerItem(options);
  }

  /**
   * @deprecated use {@link NgwMap.fetchNgwLayerItems} instead
   */
  getNgwLayerItems(
    options: {
      resourceId: number;
      connector?: NgwConnector;
      filters?: PropertiesFilter;
    } & FilterOptions
  ): CancelablePromise<FeatureItem[]> {
    return this.fetchNgwLayerItems(options);
  }

  /**
   * @deprecated use {@link NgwMap.fetchNgwLayerFeature} instead
   */
  getNgwLayerFeature<
    G extends Geometry = Geometry,
    P extends JsonMap = JsonMap
  >(options: {
    resourceId: number;
    featureId: number;
  }): CancelablePromise<Feature<G, P>> {
    return this.fetchNgwLayerFeature(options);
  }

  /**
   * @deprecated use {@link NgwMap.fetchNgwLayerFeatures} instead
   */
  getNgwLayerFeatures<
    G extends Geometry | null = Geometry,
    P extends JsonMap = JsonMap
  >(
    options: {
      resourceId: number;
      connector?: NgwConnector;
      filters?: PropertiesFilter;
    } & FilterOptions
  ): CancelablePromise<FeatureCollection<G, P>> {
    return this.fetchNgwLayerFeatures(options);
  }

  private _isFitFromResource() {
    const params = this._initMapState;
    if (params.zoom && params.center) {
      return false;
    }
    return true;
  }

  private async _createWebMap() {
    await this.create();
    if (this.options.qmsId) {
      this.addQmsBaseLayer();
    }
    if (this.options.osm) {
      this.addOsmBaseLayer();
    }

    const resources: NgwLayerOptions[] = [];
    const layerFitAllowed = this._isFitFromResource();
    if (this.options.webmapId) {
      appendNgwResources(resources, this.options.webmapId, {
        fit: layerFitAllowed,
      });
    }
    if (this.options.resources && Array.isArray(this.options.resources)) {
      this.options.resources.forEach((x) => {
        const overwriteOptions = {} as NgwLayerOptionsAdditional;
        if (!layerFitAllowed) {
          overwriteOptions.fit = false;
        }
        appendNgwResources(resources, x, {}, overwriteOptions);
      });
    }
    for (const r of resources) {
      try {
        await this.addNgwLayer(r);
      } catch (er) {
        console.log(er);
      }
    }
    this._emitStatusEvent('ngw-map:create', this);
    this.enableSelection();
  }

  private addOsmBaseLayer() {
    this.addBaseLayer('OSM');
  }

  private addQmsBaseLayer() {
    let qmsId: number;
    let qmsLayerName: string | undefined;
    if (Array.isArray(this.options.qmsId)) {
      qmsId = this.options.qmsId[0];
      qmsLayerName = this.options.qmsId[1];
    } else {
      qmsId = Number(this.options.qmsId);
    }
    const qmsLayerOptions: QmsAdapterOptions = {
      qmsId,
    };
    if (qmsLayerName) {
      qmsLayerOptions.id = qmsLayerName;
    }

    this.addBaseLayer('QMS', qmsLayerOptions);
  }

  private _selectFromNgwVector(
    ev: OnLayerClickOptions
  ): FeatureLayersIdentify | undefined {
    const layer: ResourceAdapter = ev.layer as ResourceAdapter;
    // item property means layer is NgwResource
    const id = layer.item && layer.item.resource.id;
    const feature = ev.feature;

    if (id !== undefined && feature) {
      const featureId = feature.id;
      if (featureId) {
        const identifyFeature: LayerFeature = {
          id: Number(featureId),
          fields: feature.properties,
          label: `#${id}`,
          layerId: Number(id),
          parent: '',
          geom: feature.geometry,
        };
        const items: FeatureLayersIdentifyItems = {
          featureCount: 1,
          features: [identifyFeature],
        };
        const identify: FeatureLayersIdentify = {
          featureCount: 1,
          [id]: items,
        };
        this._emitStatusEvent('ngw:select', {
          ...identify,
          resources: [id],
          sourceType: 'vector',
        });
        return identify;
      }
    }
  }

  private async _selectFromNgwRaster(ev: MapClickEvent) {
    this._emitStatusEvent('ngw:preselect');

    const promises: Promise<number[] | undefined>[] = [];
    const layers = Object.values(this._ngwLayers);
    layers.sort((a, b) => {
      if (a.layer.order && b.layer.order) {
        return b.layer.order - a.layer.order;
      }
      return 1;
    });
    layers.forEach((l) => {
      const layer = l.layer;
      if (layer.getIdentificationIds && layer.options.selectable) {
        promises.push(layer.getIdentificationIds());
      }
    });
    const getIds = await Promise.all(promises);
    const ids: number[] = [];
    getIds.forEach((x) => {
      if (x) {
        x.forEach((y) => ids.push(y));
      }
    });

    if (!ids.length) {
      this._emitStatusEvent('ngw:select', null);
      return;
    }

    const pixelRadius = this.options.pixelRadius || 10;
    const center = this.getCenter();
    const zoom = this.getZoom();
    if (!center || !zoom) {
      this._emitStatusEvent('ngw:select', null);
      return;
    }
    const metresPerPixel =
      (40075016.686 * Math.abs(Math.cos((center[1] * 180) / Math.PI))) /
      Math.pow(2, zoom + 8);
    // FIXME: understand the circle creation function
    const radius = pixelRadius * metresPerPixel * 0.0005;
    return sendIdentifyRequest(ev, {
      layers: ids,
      connector: this.connector,
      radius,
    }).then((resp) => {
      this._emitStatusEvent('ngw:select', {
        ...resp,
        resources: ids,
        sourceType: 'raster',
        event: ev,
      });
      return resp;
    });
  }

  private async _whiteLabel() {
    const container = this.getContainer();
    if (container) {
      const logo = await getCompanyLogo(
        this.connector,
        this.options.companyLogoOptions
      );
      if (logo) {
        container.appendChild(logo);
      }
    }
  }
}
