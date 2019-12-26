/**
 * @module mapboxgl-map-adapter
 */
import { Map, GeoJSONSource, GeoJSONSourceRaw } from 'mapbox-gl';
import {
  GeoJsonAdapterOptions,
  VectorAdapterLayerType,
  VectorAdapterLayerPaint,
  GetPaintCallback,
  DataLayerFilter,
  LayerDefinition,
  PropertiesFilter
} from '@nextgis/webmap';
import {
  GeoJsonObject,
  FeatureCollection,
  GeometryCollection,
  GeometryObject
} from 'geojson';
import { TLayer } from '../MapboxglMapAdapter';
import { VectorAdapter, Feature } from './VectorAdapter';
import {
  detectType,
  typeAlias,
  typeAliasForFilter,
  geometryFilter
} from '../util/geom_type';

let ID = 0;

export class GeoJsonAdapter extends VectorAdapter<GeoJsonAdapterOptions> {
  selected = false;
  source?: string;
  private _features: Feature[] = [];
  private _filteredFeatureIds: (string | number)[] = [];
  private _filterFun?: DataLayerFilter<Feature>;
  private _sources: Record<string, GeoJSONSource> = {};

  constructor(public map: Map, public options: GeoJsonAdapterOptions) {
    super(map, options);
    this.source = this._sourceId;
  }

  async addLayer(options: GeoJsonAdapterOptions): Promise<TLayer> {
    const layer = await super.addLayer(options);
    if (this.options.data) {
      this.addData(this.options.data);
    }
    return layer;
  }

  removeLayer() {
    super.removeLayer();
    const source = this.map.getSource(this._sourceId);
    if (source) {
      this.map.removeSource(this._sourceId);
    }
  }

  clearLayer(cb?: (feature: Feature) => boolean) {
    let features: Feature[] = [];
    const source = this.map.getSource(this._sourceId) as GeoJSONSource;
    if (cb) {
      features = this._features = this._features.filter(x => !cb(x));
    }
    source.setData({ type: 'FeatureCollection', features });
  }

  async addData(data: GeoJsonObject) {
    let type: VectorAdapterLayerType | undefined;
    if (this.options.type) {
      type = this.options.type;
    }
    if (!type && data) {
      const detectedType = detectType(data);
      type = typeAlias[detectedType];
    }
    if (data && type) {
      const features = this.filterGeometries(data, type);
      features.forEach(x => {
        // to avoid id = 0 is false
        const fid = '_' + ID++;
        x._featureFilterId = fid;
        if (x.properties) {
          x.properties[this.featureIdName] = fid;
        }
      });
      if (this._filterFun) {
        this._filter(this._filterFun);
      }
      await this._updateLayerPaint(type);
      const source = this.map.getSource(this._sourceId) as GeoJSONSource;
      source.setData({ type: 'FeatureCollection', features: this._features });
    }
  }

  getLayers() {
    const filtered = this._filteredFeatureIds.length;
    return this._getFeatures().map(feature => {
      let visible = false;
      if (filtered) {
        const id = this._getFeatureFilterId(feature);
        if (id !== undefined) {
          visible = this._filteredFeatureIds.indexOf(id) !== -1;
        }
      }
      return {
        feature,
        visible
      };
    });
  }

  filter(fun: DataLayerFilter<Feature, TLayer>) {
    this._filterFun = fun;
    this._filter(fun);
  }

  removeFilter() {
    this._filterFun = undefined;
    this._filteredFeatureIds = [];
    this._updateFilter();
  }

  getSelected() {
    const features: LayerDefinition<Feature, TLayer>[] = [];
    this._getFeatures().forEach(x => {
      const id = this._getFeatureFilterId(x);
      if (id && this._selectedFeatureIds.indexOf(id) !== -1) {
        features.push({ feature: x });
      }
    });
    return features;
  }

  select(findFeatureFun?: DataLayerFilter<Feature, TLayer> | PropertiesFilter) {
    if (findFeatureFun) {
      if (typeof findFeatureFun === 'function') {
        const features = this._getFeatures().filter(x =>
          findFeatureFun({ feature: x })
        );
        this._selectFeature(features);
      } else {
        super._updateFilter(findFeatureFun);
      }
    } else if (!this.selected) {
      this._selectFeature(this._getFeatures());
    }
  }

  unselect(
    findFeatureFun?: DataLayerFilter<Feature, TLayer> | PropertiesFilter
  ) {
    if (findFeatureFun) {
      if (typeof findFeatureFun === 'function') {
        const features = this._getFeatures().filter(x =>
          findFeatureFun({ feature: x })
        );
        this._unselectFeature(features);
      }
    } else if (this.selected) {
      this._unselectFeature();
    }
    this.selected = !!this._selectedFeatureIds.length;
  }

  protected _onAddLayer(sourceId: string) {
    let source = this.map.getSource(sourceId) as GeoJSONSource;
    if (!source) {
      const sourceOpt: GeoJSONSourceRaw = {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      };
      const _opts: (keyof GeoJsonAdapterOptions)[] = [
        'cluster',
        'clusterMaxZoom',
        'clusterRadius'
      ];
      _opts.forEach(x => {
        const opt = this.options[x] as GeoJsonAdapterOptions;
        if (opt !== undefined) {
          //@ts-ignore
          sourceOpt[x] = opt;
        }
      });
      this.map.addSource(sourceId, sourceOpt);
      source = this.map.getSource(sourceId) as GeoJSONSource;
    }
    this._sources[sourceId] = source;
    if (this.options.type) {
      this._updateLayerPaint(this.options.type);
    }
  }

  protected _getFeatureFilterId(feature: Feature): string | number | undefined {
    // @ts-ignore
    const id = feature._featureFilterId;
    if (id !== undefined) {
      return id;
    } else if (
      feature.properties &&
      feature.properties[this.featureIdName] !== undefined
    ) {
      return feature.properties[this.featureIdName];
    }
    return feature.id;
  }

  protected async _createPaintForType(
    paint: VectorAdapterLayerPaint | GetPaintCallback,
    type: VectorAdapterLayerType,
    name: string
  ): Promise<any> {
    if (typeof paint === 'function') {
      return await this._getPaintFromCallback(paint, type, name);
    } else {
      return super._createPaintForType(paint, type, name);
    }
  }

  protected _selectFeature(feature: Feature | Feature[]) {
    if (this.options && !this.options.multiselect) {
      this._selectedFeatureIds = [];
    }
    let features: Feature[] = [];
    if (Array.isArray(feature)) {
      features = feature;
    } else {
      features = [feature];
    }
    features.forEach(f => {
      const id = this._getFeatureFilterId(f);
      if (id !== undefined) {
        this._selectedFeatureIds.push(id);
      }
    });
    this._updateFilter();
  }

  protected _unselectFeature(feature?: Feature | Feature[]) {
    if (feature) {
      let features: Feature[] = [];
      if (Array.isArray(feature)) {
        features = feature;
      } else {
        features = [feature];
      }
      if (features.length) {
        features.forEach(f => {
          const id = this._getFeatureFilterId(f);
          if (id !== undefined) {
            const index = this._selectedFeatureIds.indexOf(id);
            if (index !== -1) {
              this._selectedFeatureIds.splice(index, 1);
            }
          }
        });
      }
    } else {
      this._selectedFeatureIds = [];
    }
    this._updateFilter();
  }

  protected _updateFilter() {
    let selectionArray: (string | number)[] = [];
    const filteredArray: (string | number)[] = [];

    if (this._filteredFeatureIds.length) {
      this._getFeatures().forEach(x => {
        const id = this._getFeatureFilterId(x);
        if (id !== undefined && this._filteredFeatureIds.indexOf(id) !== -1) {
          if (this._selectedFeatureIds.indexOf(id) !== -1) {
            selectionArray.push(id);
          } else {
            filteredArray.push(id);
          }
        }
      });
    } else {
      selectionArray = this._selectedFeatureIds;
    }
    this.selected = this._selectedFeatureIds.length > 0;
    const layers = this.layer;
    if (layers) {
      this._types.forEach(t => {
        const geomType = typeAliasForFilter[t];
        if (geomType) {
          const geomFilter = ['==', '$type', geomType];
          const layerName = this._getLayerNameFromType(t);
          const selLayerName = this._getSelectionLayerNameFromType(t);
          if (layers.indexOf(selLayerName) !== -1) {
            if (this._selectionName) {
              this.map.setFilter(selLayerName, [
                'all',
                geomFilter,
                ['in', this.featureIdName, ...selectionArray]
              ]);
            }
          }
          if (layers.indexOf(layerName) !== -1) {
            if (this._filteredFeatureIds.length) {
              this.map.setFilter(layerName, [
                'all',
                geomFilter,
                ['in', this.featureIdName, ...filteredArray]
              ]);
            } else {
              this.map.setFilter(layerName, [
                'all',
                geomFilter,
                ['!in', this.featureIdName, ...selectionArray]
              ]);
            }
          }
        }
      });
    }
  }

  private _getFeatures(): Feature[] {
    if (this.source) {
      const features = this.map.querySourceFeatures(this.source);
      return features;
    }
    return this._features;
  }

  private _filter(fun: DataLayerFilter<Feature, TLayer>) {
    this._filteredFeatureIds = [];
    this._getFeatures().forEach(feature => {
      const ok = fun({ feature });
      const id = this._getFeatureFilterId(feature);
      if (ok && id) {
        this._filteredFeatureIds.push(id);
      }
    });
    this._updateFilter();
  }

  private filterGeometries(
    data: GeoJsonObject,
    type: VectorAdapterLayerType
  ): Feature[] {
    let newFeatures: Feature[] = [];
    if (data.type === 'FeatureCollection') {
      const features = (data as FeatureCollection).features.filter(f =>
        geometryFilter(f.geometry.type, type)
      ) as Feature[];
      (data as FeatureCollection).features = features;
      newFeatures = features;
    } else if (data.type === 'Feature') {
      const allow = geometryFilter((data as Feature).geometry.type, type);
      if (!allow) {
        return [];
      }
      newFeatures.push(data as Feature);
    } else if (data.type === 'GeometryCollection') {
      const geomCollection = data as GeometryCollection;
      geomCollection.geometries = geomCollection.geometries.filter(g =>
        geometryFilter(g.type, type)
      );
      newFeatures = geomCollection.geometries.map(x => {
        const f: Feature = {
          type: 'Feature',
          geometry: x as GeometryObject,
          properties: {}
        };
        return f;
      });
    } else if (typeAlias[data.type]) {
      const obj: Feature = {
        type: 'Feature',
        geometry: data as GeometryObject,
        properties: {}
      };
      newFeatures = [obj];
    }
    this._features = this._features.concat(newFeatures);
    return newFeatures;
  }

  private async _getPaintFromCallback(
    paint: GetPaintCallback,
    type: VectorAdapterLayerType,
    name: string
  ) {
    const style: any = {};
    for (const feature of this._features) {
      const _paint = paint(feature);
      if (_paint.type === 'icon') {
        await this._registerImage(_paint);
        if (feature.properties) {
          feature.properties['_icon-image-' + name] = _paint.html;
        }
        style['icon-image'] = `{_icon-image-${name}}`;
      } else {
        for (const p in _paint) {
          // @ts-ignore
          const toSave = _paint[p];
          if (feature.properties) {
            feature.properties[`_paint_${p}_${name}`] = toSave;
          }
          style[p] = ['get', `_paint_${p}_${name}`];
        }
      }
    }
    if ('icon-image' in style) {
      return style;
    }
    const styleFromCb = this._createPaintForType(style, type, name);
    return styleFromCb;
  }
}
