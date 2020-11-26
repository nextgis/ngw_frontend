import {
  WebMap,
  LngLatBoundsArray,
  RasterAdapterOptions,
} from '@nextgis/webmap';
import {
  ResourceItem,
  WebmapResource,
  BasemapWebmap,
} from '@nextgis/ngw-connector';
import CancelablePromise from '@nextgis/cancelable-promise';
import { fixUrlStr, Type } from '@nextgis/utils';
import { ItemOptions } from '@nextgis/item';

import StrictEventEmitter from 'strict-event-emitter-types';
import { EventEmitter } from 'events';

import { NgwWebmapItem } from './NgwWebmapItem';
import { createOnFirstShowAdapter } from './adapters/createBasemapWebmapItemAdapter';
import { getLayerAdapterOptions } from './utils/getLayerAdapterOptions';
import { updateImageParams } from './utils/utils';

import {
  TreeGroup,
  TreeLayer,
  NgwLayerAdapterType,
  NgwWebmapAdapterOptions,
  NgwWebmapLayerAdapterEvents,
  ResourceAdapter,
} from './interfaces';
import { getNgwWebmapExtent } from './utils/fetchNgwExtent';

export class NgwWebmapLayerAdapter<M = any> implements ResourceAdapter<M> {
  layer?: NgwWebmapItem;

  NgwWebmapItem: Type<NgwWebmapItem> = NgwWebmapItem;
  /**
   * Radius for searching objects in pixels
   */
  pixelRadius = 10; // webmapSettings.identify_radius,
  resourceId!: number;
  webmapClassName = 'webmap';
  readonly emitter: StrictEventEmitter<
    EventEmitter,
    NgwWebmapLayerAdapterEvents
  > = new EventEmitter();
  protected _extent?: LngLatBoundsArray;
  private response?: ResourceItem;
  private _webmapLayersIds?: number[];

  constructor(public map: M, public options: NgwWebmapAdapterOptions) {
    const r = options.resourceId;
    if (Array.isArray(r)) {
      this.resourceId = r[0];
      this.options.id = r[1];
    } else {
      this.resourceId = r;
    }

    if (!this.resourceId) {
      throw new Error('NGW `resourceId` is not defined');
    }
  }

  async addLayer(options: NgwWebmapAdapterOptions): Promise<any> {
    this.options = { ...this.options, ...options };
    this.layer = await this._getWebMapLayerItem();
    return this.layer;
  }

  removeLayer(): void {
    const mapAdapter = this.options.webMap.mapAdapter;

    this.getDependLayers().forEach((x) => {
      if (!('layer' in x)) return;
      // @ts-ignore Update x interface
      mapAdapter.removeLayer(x.layer.layer);
    });
    // delete this.options;
    delete this.layer;
    delete this.response;
    delete this._webmapLayersIds;
  }

  showLayer(): void {
    if (this.layer && this.layer.properties) {
      this.layer.properties.property('visibility').set(true);
    }
  }

  hideLayer(): void {
    if (this.layer && this.layer.properties) {
      this.layer.properties.property('visibility').set(false);
    }
  }

  getExtent(): LngLatBoundsArray | undefined {
    const webmap = this.response && this.response.webmap;
    if (webmap) {
      return getNgwWebmapExtent(webmap);
    }
  }

  getDependLayers(): Array<NgwWebmapItem> {
    return (this.layer && this.layer.tree.getDescendants()) || [];
  }

  async getIdentificationIds(): Promise<number[]> {
    const visibleLayers: number[] = [];
    let ids = this._webmapLayersIds;
    if (!ids) {
      ids = await this._getWebMapIds();
      this._webmapLayersIds = ids;
    }
    if (ids && ids.length) {
      let deps = this.getDependLayers();
      deps = deps.sort((a, b) => b.id - a.id);
      deps.forEach((x) => {
        const item = x.item;
        const parentId = item.parentId;
        if (parentId !== undefined && item.item_type === 'layer') {
          const visible = x.properties.property('visibility');
          const isVisible = visible.get() && !visible.isBlocked();
          if (isVisible) {
            visibleLayers.push(parentId);
          }
        }
      });
    }
    return visibleLayers;
  }

  protected async _getWebMapLayerItem(): Promise<NgwWebmapItem | undefined> {
    if (this.resourceId) {
      const webmap = await this.getWebMapConfig(this.resourceId);
      if (webmap && webmap.root_item) {
        return new Promise<NgwWebmapItem>((resolve) => {
          const options: ItemOptions = {};
          if (this.options.connector && this.options.connector.options.auth) {
            const headers = this.options.connector.getAuthorizationHeaders();
            if (headers) {
              options.headers = headers;
            }
          }
          options.order = this.options.order;
          options.crossOrigin = this.options.crossOrigin;
          options.drawOrderEnabled = webmap.draw_order_enabled;
          const layer = new this.NgwWebmapItem(
            this.options.webMap,
            webmap.root_item,
            options,
            this.options.connector
          );
          layer.emitter.on('init', () => resolve(layer));
        });
      }
    }
  }

  private async getWebMapConfig(id: number) {
    const data = await this.options.connector.getResource(id);
    if (data) {
      this.response = data;
      const webmap = data[
        this.webmapClassName as keyof ResourceItem
      ] as WebmapResource;
      if (data.basemap_webmap && data.basemap_webmap.basemaps.length) {
        this._setBasemaps(data.basemap_webmap);
      } else if (this.options.defaultBasemap) {
        const webMap = this.options.webMap;
        webMap.addBaseLayer('OSM', {
          id: 'webmap-default-baselayer',
          name: 'OpenStreetMap',
        });
      }
      if (webmap) {
        this._extent = [
          webmap.extent_left,
          webmap.extent_bottom,
          webmap.extent_right,
          webmap.extent_top,
        ];
        this._updateItemsParams(webmap.root_item, this.options.webMap, data);
        return webmap;
      } else {
        // TODO: resource is no webmap
      }
    }
  }

  private _setBasemaps(baseWebmap: BasemapWebmap) {
    const webMap = this.options.webMap;
    baseWebmap.basemaps.forEach((x) => {
      createOnFirstShowAdapter({
        webMap,
        connector: this.options.connector,
        item: x,
        adapterOptions: { crossOrigin: this.options.crossOrigin },
      }).then((adapter) => {
        webMap.addBaseLayer(adapter, {
          name: x.display_name,
          opacity: x.opacity,
          visibility: x.enabled,
        });
      });
    });
  }

  private _updateItemsParams(
    item: TreeGroup | TreeLayer,
    webMap: WebMap,
    data: ResourceItem
  ) {
    if (item) {
      if (item.item_type === 'group' || item.item_type === 'root') {
        if (item.children) {
          item.children = item.children.map((x) =>
            this._updateItemsParams(x, webMap, data)
          );
        }
        if (item.item_type === 'root') {
          item.display_name = data.resource.display_name;
        }
      } else if (item.item_type === 'layer') {
        const url = fixUrlStr(
          this.options.connector.options.baseUrl + '/api/component/render/image'
        );
        const resourceId = item.layer_style_id;
        item.url = url;
        item.resourceId = resourceId;
        item.updateWmsParams = (params) =>
          updateImageParams(params, resourceId);
        const adapter = item.layer_adapter.toUpperCase() as NgwLayerAdapterType;
        const layerAdapterOptions = getLayerAdapterOptions(
          {
            adapter,
            resource: resourceId,
          },
          webMap,
          this.options.connector.options.baseUrl || ''
        ) as RasterAdapterOptions;
        item = {
          ...item,
          ...layerAdapterOptions,
        };
      }
    }
    return item;
  }

  private async _getWebMapIds(): Promise<number[] | undefined> {
    const webMapItem = this.layer;
    if (webMapItem && webMapItem.item.item_type === 'root') {
      const layers = webMapItem.tree.getDescendants();
      const promises: Array<CancelablePromise<any>> = [];
      layers.forEach((x: NgwWebmapItem) => {
        const item = x.item;
        if (item.item_type === 'layer') {
          const id = item.layer_style_id;
          const promise = this.options.connector.getResource(id).then((y) => {
            if (y) {
              const parentId = Number(y.resource.parent.id);
              item.parentId = parentId;
              return parentId;
            }
          });
          promises.push(promise);
        }
      });
      const ids = await Promise.all(promises);
      return ids.filter((x) => x !== undefined);
      // const id = item['layer_style_id']
    }
  }
}
