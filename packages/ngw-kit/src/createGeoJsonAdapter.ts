import { NgwLayerOptions } from './interfaces';
import WebMap, {
  VectorLayerAdapter,
  Type,
  GeoJsonAdapterOptions,
  PropertiesFilter
} from '@nextgis/webmap';
import NgwConnector, { CancelablePromise } from '@nextgis/ngw-connector';
import { GeoJsonObject } from 'geojson';
import { getNgwLayerGeoJson } from './utils';

export async function createGeoJsonAdapter(
  options: NgwLayerOptions,
  webMap: WebMap,
  connector: NgwConnector) {

  const adapter = webMap.mapAdapter.layerAdapters.GEOJSON as Type<VectorLayerAdapter>;

  let _dataPromise: CancelablePromise<any> | undefined;
  const _fullDataLoad = false;

  const geoJsonAdapterCb = async (filters?: PropertiesFilter[]) => {
    _dataPromise = getNgwLayerGeoJson(options.resourceId, { filters, connector });
    return await _dataPromise;
  };

  const abort = () => {
    if (_dataPromise) {
      _dataPromise.cancel();
      _dataPromise = undefined;
    }
  };

  const onLoad = (data: GeoJsonObject) => {
    const geoJsonOptions: GeoJsonAdapterOptions = {
      data,
    };
    if (options.id) {
      geoJsonOptions.id = options.id;
    }
    return WebMap.utils.updateGeoJsonAdapterOptions(geoJsonOptions);
  };
  return class Adapter extends adapter {

    async addLayer(_opt: GeoJsonAdapterOptions) {
      const data = await geoJsonAdapterCb(_opt.propertiesFilter);
      const opt = onLoad(data);
      return super.addLayer({ ..._opt, ...opt });
    }

    beforeRemove() {
      abort();
    }

    async propertiesFilter(filters: PropertiesFilter) {
      abort();
      if (this.filter && _fullDataLoad) {
        this.filter((e) => {
          if (e.feature && e.feature.properties) {
            return WebMap.utils.propertiesFilter(e.feature.properties, filters);
          }
          return true;
        });
      } else if (this.setData) {
        const data = await geoJsonAdapterCb(filters);
        this.setData(data);
      }
    }

    removeFilter() {
      this.propertiesFilter([]);
      if (this.filter) {
        this.filter(function () { return true; });
      }
    }
  };
}
