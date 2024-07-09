import { fetchNgwLayerItem, fetchNgwLayerItemExtent } from '.';

import type { IdentifyItemOptions, NgwFeatureItemResponse } from '.';
import type { FetchNgwItemOptions } from './interfaces';
import type {
  FeatureItemExtensions,
  FeatureResource,
  LayerFeature,
  RequestOptions,
  VectorLayerResourceItem,
} from '@nextgis/ngw-connector';
import type NgwConnector from '@nextgis/ngw-connector';
import type { FeatureProperties, LngLatBoundsArray } from '@nextgis/utils';
import type { Feature, GeoJsonObject, Geometry } from 'geojson';

export class IdentifyItem<
  F extends FeatureProperties = FeatureProperties,
  G extends Geometry = Geometry,
> implements LayerFeature
{
  readonly id: number;
  readonly label: string;
  readonly layerId: number;
  readonly parent: string;
  readonly fields: FeatureProperties;
  geom?: GeoJsonObject;
  extensions?: FeatureItemExtensions;

  private connector: NgwConnector;
  private _item?: NgwFeatureItemResponse<F, G>;
  private _geojson?: Feature<G, F>;
  private _resource?: VectorLayerResourceItem;
  private _extent?: LngLatBoundsArray;

  constructor(options: IdentifyItemOptions) {
    const f = options.feature;
    this.id = f.id;
    this.geom = f.geom;
    this.label = f.label;
    this.parent = f.parent;
    this.fields = f.fields;
    this.layerId = f.layerId;
    this.connector = options.connector;
  }

  identify(
    options: Partial<FetchNgwItemOptions<F>> = {},
  ): Promise<NgwFeatureItemResponse<F, G>> {
    if (this._item) {
      return Promise.resolve(this._item);
    }
    return fetchNgwLayerItem<G, F>({
      connector: this.connector,
      featureId: this.id,
      resourceId: this.layerId,
      fields: null,
      extensions: ['attachment', 'description'],
      ...options,
    }).then((resp) => {
      this._item = resp;
      this.geom = resp.geom;
      this.extensions = resp.extensions;
      return resp;
    });
  }

  resource(opt?: RequestOptions<'GET'>): Promise<FeatureResource> {
    if (this._resource) {
      return Promise.resolve(this._resource.feature_layer);
    }
    return this.connector.getResource(this.layerId, opt).then((resp) => {
      this._resource = resp as VectorLayerResourceItem;
      return this._resource.feature_layer;
    });
  }

  getBounds(
    opt?: Pick<RequestOptions<'GET'>, 'cache' | 'signal'>,
  ): Promise<LngLatBoundsArray | undefined> {
    if (this._extent) {
      return Promise.resolve(this._extent);
    }
    return fetchNgwLayerItemExtent({
      connector: this.connector,
      featureId: this.id,
      resourceId: this.layerId,
      ...opt,
    });
  }

  geojson(options: Partial<FetchNgwItemOptions<F>>): Promise<Feature<G, F>> {
    if (this._geojson) {
      return Promise.resolve(this._geojson);
    }
    return this.identify(options).then((resp) => {
      return resp.toGeojson().then((geojson) => {
        this._geojson = geojson;
        return geojson;
      });
    });
  }
}
